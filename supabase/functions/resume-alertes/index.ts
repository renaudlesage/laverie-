// Résumé quotidien des alertes par e-mail (Resend).
//   Appel quotidien (pg_cron) : chaque organisation au résumé actif, au plus une fois par jour,
//   seulement s'il y a eu de nouvelles alertes dans les 24 h.
//   { essai: true, organisation_id } avec la session d'un admin : envoi immédiat à cet admin.
// Secrets : RESEND_API_KEY, RESUME_EXPEDITEUR (ex. « Suivi linge <alertes@votre-domaine.be> »),
// URL_APP (facultatif).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { construireResume, type NouvelleAlerte } from './resume.ts';

const ENTETES = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};
const reponse = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: ENTETES });

async function preparer(db: SupabaseClient, org: string, lien: string) {
  const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [zone, ouvertes, nouvelles] = await Promise.all([
    db.from('organisations').select('nom').eq('id', org).single(),
    db.from('alertes').select('type').eq('organisation_id', org).is('close_le', null),
    db
      .from('alertes')
      .select('type, niveau, message, ouverte_le, vetement:vetements(numero_serie, article:articles(designation), identifiants(valeur, actif))', {
        count: 'exact',
      })
      .eq('organisation_id', org)
      .gte('ouverte_le', depuis)
      .order('niveau')
      .order('ouverte_le', { ascending: false })
      .limit(50),
  ]);
  const parType: Record<string, number> = {};
  for (const a of ouvertes.data ?? []) parType[a.type] = (parType[a.type] ?? 0) + 1;
  // deno-lint-ignore no-explicit-any
  const liste: NouvelleAlerte[] = (nouvelles.data ?? []).map((a: any) => ({
    type: a.type,
    niveau: a.niveau,
    message: a.message,
    ouverte_le: a.ouverte_le,
    article: a.vetement?.article?.designation ?? null,
    code: a.vetement?.identifiants?.find((i: { actif: boolean }) => i.actif)?.valeur ?? a.vetement?.numero_serie ?? null,
  }));
  return {
    total: nouvelles.count ?? liste.length,
    ...construireResume({ zone: zone.data?.nom ?? 'Zone', ouvertes: parType, nouvelles: liste, totalNouvelles: nouvelles.count ?? liste.length, lien }),
  };
}

async function envoyer(cle: string, expediteur: string, a: string[], r: { sujet: string; texte: string; html: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: expediteur, to: a, subject: r.sujet, text: r.texte, html: r.html }),
  });
  if (!res.ok) throw new Error(`Envoi refusé par Resend (${res.status}) : ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reponse({});
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const cle = Deno.env.get('RESEND_API_KEY');
  const expediteur = Deno.env.get('RESUME_EXPEDITEUR');
  const lien = (Deno.env.get('URL_APP') ?? 'https://laverie-khaki.vercel.app').replace(/\/$/, '');
  const corps = await req.json().catch(() => ({}));

  if (corps.essai) {
    const jeton = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    const { data: u } = await db.auth.getUser(jeton);
    if (!u?.user?.email) return reponse({ erreur: 'Connexion requise' }, 401);
    const { data: m } = await db
      .from('membres')
      .select('role')
      .eq('organisation_id', corps.organisation_id)
      .eq('user_id', u.user.id)
      .eq('actif', true)
      .maybeSingle();
    if (m?.role !== 'admin') return reponse({ erreur: 'Réservé à l’administrateur de la zone' }, 403);
    if (!cle || !expediteur) {
      return reponse({ erreur: 'Envoi d’e-mails pas encore configuré : secrets RESEND_API_KEY et RESUME_EXPEDITEUR à définir dans Supabase.' }, 503);
    }
    try {
      await envoyer(cle, expediteur, [u.user.email], await preparer(db, corps.organisation_id, lien));
      return reponse({ envoyes: 1, a: u.user.email });
    } catch (e) {
      return reponse({ erreur: (e as Error).message }, 502);
    }
  }

  if (!cle || !expediteur) return reponse({ envoyes: 0, erreur: 'Secrets RESEND_API_KEY et RESUME_EXPEDITEUR absents' });
  const jour = new Date().toISOString().slice(0, 10);
  const { data: organisations } = await db.from('organisations').select('id, nom, reglages');
  const bilan = [];
  for (const o of organisations ?? []) {
    if (!o.reglages?.resume_alertes?.actif) continue;
    const resume = await preparer(db, o.id, lien);
    if (!resume.total) continue; // rien de neuf : pas d'e-mail
    const { data: destinataires } = await db.rpc('destinataires_resume', { org: o.id });
    const emails = (destinataires ?? []).map((d: { email: string }) => d.email);
    if (!emails.length) continue;
    // Réservation du jour avant l'envoi : deux appels simultanés n'envoient qu'une fois.
    const { error } = await db.from('resumes_envoyes').insert({ organisation_id: o.id, jour, destinataires: emails.length, alertes: resume.total });
    if (error) continue;
    try {
      await envoyer(cle, expediteur, emails, resume);
      bilan.push({ organisation: o.nom, destinataires: emails.length, alertes: resume.total });
    } catch (e) {
      await db.from('resumes_envoyes').delete().eq('organisation_id', o.id).eq('jour', jour);
      bilan.push({ organisation: o.nom, erreur: (e as Error).message });
    }
  }
  return reponse({ envoyes: bilan.filter((b) => !('erreur' in b)).length, detail: bilan });
});
