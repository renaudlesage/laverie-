import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { ROLES, TECHNOLOGIES } from '../lib/libelles.js';

const ROLES_RESUME = ['admin', 'gestionnaire', 'operateur_laverie', 'auditeur'];

export const REGLES_ACTIVATION = {
  au_moins_une: 'Au moins une limite de traitement',
  tous_traitements: 'Une limite pour chaque traitement actif',
};

// Réglages de l'organisation (admin). Valeurs par défaut prudentes, modifiables à tout moment.
export default function Organisation() {
  const { organisation, recharger } = useOrganisation();
  const reglages = organisation.reglages ?? {};
  const [nom, setNom] = useState(organisation.nom);
  const [regle, setRegle] = useState(reglages.activation_limites ?? 'au_moins_une');
  const [antiDoublon, setAntiDoublon] = useState(String((reglages.anti_doublon_ms ?? 2000) / 1000).replace('.', ','));
  const [garanties, setGaranties] = useState(() =>
    Object.fromEntries(Object.keys(TECHNOLOGIES).map((t) => [t, reglages.garantie_tags?.[t] ? String(reglages.garantie_tags[t]) : ''])),
  );
  const [usurePct, setUsurePct] = useState(String(reglages.usure_tag_pct ?? 80));
  const [delaiCollecte, setDelaiCollecte] = useState(String(reglages.delai_collecte_jours ?? 2));
  const [delaiLaverie, setDelaiLaverie] = useState(String(reglages.delai_laverie_jours ?? 7));
  const [resumeActif, setResumeActif] = useState(!!reglages.resume_alertes?.actif);
  const [resumeRoles, setResumeRoles] = useState(reglages.resume_alertes?.roles ?? ['admin', 'gestionnaire']);
  const [essai, setEssai] = useState(null);
  const [supportAutorise, setSupportAutorise] = useState(!!organisation.support_autorise);
  const [accesSupport, setAccesSupport] = useState([]);
  useEffect(() => {
    supabase
      .from('acces_support')
      .select('id, email, motif, debut, fin')
      .eq('organisation_id', organisation.id)
      .order('debut', { ascending: false })
      .limit(10)
      .then(({ data }) => setAccesSupport(data ?? []));
  }, [organisation.id]);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState(null);

  async function envoyerEssai() {
    setEssai('envoi');
    const { data, error } = await supabase.functions.invoke('resume-alertes', { body: { essai: true, organisation_id: organisation.id } });
    let texte = data?.erreur;
    if (error) {
      try {
        texte = (await error.context?.json())?.erreur;
      } catch {
        // réponse illisible
      }
      texte ??= 'Envoi impossible pour le moment.';
    }
    setEssai(texte ? { type: 'erreur', texte } : { type: 'info', texte: `Résumé d’essai envoyé à ${data.a}.` });
  }

  async function enregistrer(e) {
    e.preventDefault();
    const secondes = Number(antiDoublon.replace(',', '.'));
    if (!Number.isFinite(secondes) || secondes < 0.5 || secondes > 60) {
      setMessage({ type: 'erreur', texte: 'Fenêtre anti-doublon : entre 0,5 et 60 secondes.' });
      return;
    }
    const entier = (texte, min, max) => {
      const n = Number(texte);
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    };
    const garantie_tags = {};
    for (const [t, valeur] of Object.entries(garanties)) {
      if (!valeur.trim()) continue;
      const n = entier(valeur.trim(), 1, 100000);
      if (n === null) {
        setMessage({ type: 'erreur', texte: `Garantie du tag ${TECHNOLOGIES[t]} : un nombre entier de passages.` });
        return;
      }
      garantie_tags[t] = n;
    }
    const usure = entier(usurePct, 1, 100);
    const collecte = entier(delaiCollecte, 1, 365);
    const laverie = entier(delaiLaverie, 1, 365);
    if (usure === null || collecte === null || laverie === null) {
      setMessage({ type: 'erreur', texte: 'Seuil d’usure entre 1 et 100 % ; délais entre 1 et 365 jours (nombres entiers).' });
      return;
    }
    setEnvoi(true);
    const { error } = await supabase
      .from('organisations')
      .update({
        nom: nom.trim(),
        support_autorise: supportAutorise,
        reglages: {
          ...reglages,
          activation_limites: regle,
          anti_doublon_ms: Math.round(secondes * 1000),
          garantie_tags,
          usure_tag_pct: usure,
          delai_collecte_jours: collecte,
          delai_laverie_jours: laverie,
          resume_alertes: { actif: resumeActif, roles: resumeRoles },
        },
      })
      .eq('id', organisation.id);
    setEnvoi(false);
    if (error) {
      setMessage({ type: 'erreur', texte: messageErreur(error) });
      return;
    }
    setMessage({ type: 'info', texte: 'Réglages enregistrés.' });
    recharger();
  }

  return (
    <form className="carte formulaire" onSubmit={enregistrer}>
      <p className="etiquette">Organisation</p>
      <h1>Réglages de la zone</h1>

      <label>
        <span>
          Nom<span className="requis"> *</span>
        </span>
        <input required value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>

      <fieldset className="choix-radio">
        <legend>Activation d’un article</legend>
        <p className="aide">
          Un article ne s’active qu’avec sa notice fabricant et ses limites de passages. La règle ne s’applique qu’au moment
          de l’activation : les articles déjà actifs ne sont pas désactivés si elle change.
        </p>
        {Object.entries(REGLES_ACTIVATION).map(([valeur, libelle]) => (
          <label key={valeur} className="champ-case">
            <input type="radio" name="regle" value={valeur} checked={regle === valeur} onChange={() => setRegle(valeur)} />
            <span>{libelle}</span>
          </label>
        ))}
      </fieldset>

      <label>
        <span>Fenêtre anti-doublon des lectures (secondes)</span>
        <input inputMode="decimal" value={antiDoublon} onChange={(e) => setAntiDoublon(e.target.value)} />
        <small className="aide">Le même code relu par le même lecteur dans ce délai n’est compté qu’une fois.</small>
      </label>

      <fieldset className="pile">
        <legend>Alertes</legend>
        <p className="aide">
          Garantie des tags en nombre de passages, d’après la fiche du fabricant. Sans valeur, pas d’alerte d’usure pour cette
          technologie.
        </p>
        <div className="grille-champs">
          {Object.entries(TECHNOLOGIES).map(([t, libelle]) => (
            <label key={t}>
              <span>Garantie {libelle}</span>
              <input
                inputMode="numeric"
                value={garanties[t]}
                onChange={(e) => setGaranties({ ...garanties, [t]: e.target.value })}
                placeholder="—"
              />
            </label>
          ))}
        </div>
        <label>
          <span>Alerte « tag à remplacer » à partir de (% de la garantie)</span>
          <input inputMode="numeric" value={usurePct} onChange={(e) => setUsurePct(e.target.value)} />
        </label>
        <label>
          <span>« Non revenu » : collecté sans réception depuis plus de (jours)</span>
          <input inputMode="numeric" value={delaiCollecte} onChange={(e) => setDelaiCollecte(e.target.value)} />
        </label>
        <label>
          <span>« Non revenu » : en laverie depuis plus de (jours)</span>
          <input inputMode="numeric" value={delaiLaverie} onChange={(e) => setDelaiLaverie(e.target.value)} />
        </label>
        <small className="aide">
          Le seuil « fin de vie proche » se règle par article et par traitement (Paramètres → Articles). Les alertes liées au
          temps sont réévaluées chaque heure.
        </small>
      </fieldset>

      <fieldset className="pile">
        <legend>Résumé quotidien des alertes par e-mail</legend>
        <label className="champ-case">
          <input type="checkbox" checked={resumeActif} onChange={(e) => setResumeActif(e.target.checked)} />
          <span>Envoyer chaque matin un résumé des nouvelles alertes (seulement s’il y en a)</span>
        </label>
        <div className="grille-champs">
          {ROLES_RESUME.map((r) => (
            <label key={r} className="champ-case">
              <input
                type="checkbox"
                checked={resumeRoles.includes(r)}
                onChange={(e) => setResumeRoles(e.target.checked ? [...resumeRoles, r] : resumeRoles.filter((x) => x !== r))}
              />
              <span>{ROLES[r]}</span>
            </label>
          ))}
        </div>
        <button type="button" className="bouton" disabled={essai === 'envoi'} onClick={envoyerEssai}>
          {essai === 'envoi' ? 'Envoi…' : 'M’envoyer un essai maintenant'}
        </button>
        {essai && essai !== 'envoi' && <p className={`message message-${essai.type}`}>{essai.texte}</p>}
      </fieldset>

      <fieldset className="pile">
        <legend>Accès support de la plateforme</legend>
        <label className="champ-case">
          <input type="checkbox" checked={supportAutorise} onChange={(e) => setSupportAutorise(e.target.checked)} />
          <span>Autoriser le support à consulter la zone pour vous aider (lecture seule, 2 h par accès, motif obligatoire)</span>
        </label>
        <small className="aide">
          Le support ne voit jamais le nom des pompiers (matricule et casier seulement) et ne peut rien modifier. Retirer
          l’autorisation coupe aussitôt tout accès en cours.
        </small>
        {accesSupport.length > 0 && (
          <ul className="liste">
            {accesSupport.map((a) => (
              <li key={a.id} className="ligne-liste ligne-statique">
                <span className="ligne-titre">{a.motif}</span>
                <span className="ligne-detail mono">
                  {a.email} · {new Date(a.debut).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {message && <p className={`message message-${message.type}`}>{message.texte}</p>}
      <button type="submit" className="bouton bouton-principal" disabled={envoi}>
        Enregistrer
      </button>
    </form>
  );
}
