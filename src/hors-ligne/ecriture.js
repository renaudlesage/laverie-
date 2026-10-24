import { base } from './base.js';
import { RegleRefusee, operer as operation, seuilAtteint, verifier } from './machine.js';
import { rafraichir } from './tirage.js';
import { nouvelId } from '../identification/codes.js';

// Écriture sur l'appareil : règles bloquantes vérifiées sur l'index local, projection locale
// mise à jour, puis écriture déposée dans la file (envoyée dans l'ordre par synchro.js).
// Réponse par écriture : { id, statut: 'en_attente' | 'doublon' | 'rejete', motif?, code? }.

const SANS_PROJECTION_LOCALE = ['annulation', 'enrolement', 'tag_pose', 'tag_retire'];
const TOURNEE_EN_COURS = ['ouvert', 'ferme', 'expedie'];
const PROJECTION = ['statut', 'contamine', 'site_id', 'porteur_id', 'lot_id', 'derniere_lecture_le', 'controle_renforce'];

const rejet = (id, e) => ({ id, statut: 'rejete', motif: e.message, code: e.code ?? 'local' });

function deposer(ctx, genre, charge, { vetements = [], lots = [] } = {}) {
  return base.file.add({
    utilisateur_id: ctx.utilisateurId,
    organisation_id: ctx.organisationId,
    genre,
    charge,
    vetements,
    lots,
    depose_le: new Date().toISOString(),
  });
}

async function seuilLocal(v) {
  const [compteurs, limitesArticle, limitesVetement, article] = await Promise.all([
    base.compteurs.where('vetement_id').equals(v.id).toArray(),
    base.articles_limites.where('article_id').equals(v.article_id).toArray(),
    base.vetements_limites.where('vetement_id').equals(v.id).toArray(),
    base.articles.get(v.article_id),
  ]);
  const limites = Object.fromEntries(limitesArticle.map((l) => [l.traitement_id, l.limite]));
  for (const l of limitesVetement) limites[l.traitement_id] = l.limite;
  return seuilAtteint({ compteurs, limites, dureeVieMois: article?.duree_vie_mois, misEnServiceLe: v.mis_en_service_le });
}

// Données absentes de l'index : relues à la base si l'appareil est en ligne.
async function completer(ctx, ev) {
  if (!ctx.enLigne()) return;
  const v = await base.vetements.get(ev.vetement_id);
  const lots = [ev.lot_id, v?.lot_id].filter(Boolean);
  const manquants = [];
  for (const id of lots) if (!(await base.lots.get(id))) manquants.push(id);
  if (!v || manquants.length) await rafraichir(ctx.organisationId, { vetements: v ? [] : [ev.vetement_id], lots: manquants });
}

async function appliquerEvenement(ctx, ev) {
  return base.transaction('rw', [base.vetements, base.lots, base.sites, base.porteurs, base.compteurs, base.articles_limites,
    base.vetements_limites, base.articles, base.file], async () => {
    const v = await base.vetements.get(ev.vetement_id);
    if (!v || v.organisation_id !== ctx.organisationId) {
      throw new RegleRefusee('Vêtement absent de l’index de cet appareil : synchronisez en ligne puis recommencez', 'P0002');
    }
    const [lot, lotDuVetement, site, porteur] = await Promise.all([
      ev.lot_id ? base.lots.get(ev.lot_id) : null,
      v.lot_id ? base.lots.get(v.lot_id) : null,
      ev.site_id ? base.sites.get(ev.site_id) : null,
      ev.donnees?.porteur_id ? base.porteurs.get(ev.donnees.porteur_id) : null,
    ]);
    const besoinSeuil = ['attribution', 'controle', 'livraison'].includes(ev.type);
    const seuil = besoinSeuil ? await seuilLocal(v) : false;
    const { etat } = verifier(ev, { v, lot, lotDuVetement, site, porteur, seuil });
    const maj = Object.fromEntries(PROJECTION.map((c) => [c, etat[c] ?? null]));
    await base.vetements.update(v.id, maj);
    await deposer(ctx, 'evenement', ev, { vetements: [v.id], lots: [ev.lot_id, v.lot_id].filter(Boolean) });
  });
}

export async function ecrireEvenements(ctx, evenements) {
  const reponses = [];
  for (const ev of evenements) {
    if (SANS_PROJECTION_LOCALE.includes(ev.type)) {
      // Annulation, enrôlement, tags : la base seule sait les appliquer (journal complet).
      if (!ctx.enLigne()) {
        reponses.push(rejet(ev.id, new RegleRefusee('Connexion nécessaire pour cette action', 'hors_ligne')));
        continue;
      }
      await deposer(ctx, 'evenement', ev, { vetements: [ev.vetement_id] });
      reponses.push({ id: ev.id, statut: 'en_attente' });
      continue;
    }
    let essais = 0;
    for (;;) {
      try {
        if (essais === 0) await completer(ctx, ev);
        await appliquerEvenement(ctx, ev);
        reponses.push({ id: ev.id, statut: 'en_attente' });
        break;
      } catch (e) {
        // Index peut-être en retard sur la base : une relecture, puis le refus est confirmé.
        if (e instanceof RegleRefusee && essais === 0 && ctx.enLigne()) {
          essais += 1;
          try {
            await rafraichir(ctx.organisationId, { vetements: [ev.vetement_id], lots: [ev.lot_id].filter(Boolean) });
            continue;
          } catch {
            // Relecture impossible : le refus local fait foi.
          }
        }
        if (!(e instanceof RegleRefusee)) throw e;
        if (e.code === 'LC001') {
          // Circuits séparés : l'écriture ne part pas, mais l'alerte, oui.
          await deposer(ctx, 'signalement', {
            id: nouvelId(), vetement_id: ev.vetement_id, lot_id: ev.lot_id, message: e.message, survenu_le: ev.survenu_le,
          });
        }
        reponses.push(rejet(ev.id, e));
        break;
      }
    }
  }
  return reponses;
}

async function appliquerOperation(ctx, op) {
  return base.transaction('rw', [base.lots, base.sacs, base.sites, base.traitements, base.vetements, base.compteurs, base.file], async () => {
    const [lot, sac, siteDestination, site, traitement, contenu] = await Promise.all([
      base.lots.get(op.lot_id),
      op.sac_id ? base.sacs.get(op.sac_id) : null,
      op.site_destination_id ? base.sites.get(op.site_destination_id) : null,
      op.site_id ? base.sites.get(op.site_id) : null,
      op.traitement_id ? base.traitements.get(op.traitement_id) : null,
      base.vetements.where('lot_id').equals(op.lot_id).toArray(),
    ]);
    const tourneeEnCours = op.sac_id
      ? (await base.lots.where('sac_id').equals(op.sac_id).toArray()).some((l) => TOURNEE_EN_COURS.includes(l.statut))
      : false;
    const r = operation(op, { lot, sac, siteDestination, site, traitement, contenu, tourneeEnCours });
    if (r.doublon) return 'doublon';
    await base.lots.put({ ...lot, ...r.lot });
    for (const etat of r.vetements ?? []) {
      await base.vetements.update(etat.id, Object.fromEntries(PROJECTION.map((c) => [c, etat[c] ?? null])));
    }
    for (const p of r.passages ?? []) {
      const c = await base.compteurs.get([p.vetement_id, p.traitement_id]);
      await base.compteurs.put({ organisation_id: ctx.organisationId, ...p, ...c, passages: (c?.passages ?? 0) + 1 });
    }
    await deposer(ctx, 'operation', op, { vetements: contenu.map((v) => v.id), lots: [op.lot_id] });
    return 'en_attente';
  });
}

export async function ecrireOperations(ctx, operations) {
  const reponses = [];
  for (const op of operations) {
    let essais = 0;
    for (;;) {
      try {
        if (essais === 0 && ctx.enLigne() && op.lot_id && !op.type.startsWith('ouvrir') && !(await base.lots.get(op.lot_id))) {
          await rafraichir(ctx.organisationId, { lots: [op.lot_id] });
        }
        reponses.push({ id: op.id, statut: await appliquerOperation(ctx, op) });
        break;
      } catch (e) {
        if (e instanceof RegleRefusee && essais === 0 && ctx.enLigne() && !op.type.startsWith('ouvrir')) {
          essais += 1;
          try {
            await rafraichir(ctx.organisationId, { lots: [op.lot_id] });
            continue;
          } catch {
            // Relecture impossible : le refus local fait foi.
          }
        }
        if (!(e instanceof RegleRefusee)) throw e;
        reponses.push(rejet(op.id, e));
        break;
      }
    }
  }
  return reponses;
}

export function ecrireLecture(ctx, lecture) {
  return deposer(ctx, 'lecture', lecture);
}
