import { bilan, emettre } from '../journal/journal.js';

// Champs d'un vêtement utiles aux écrans de laverie.
export const CHAMPS_VETEMENT =
  'id, statut, contamine, controle_renforce, taille, numero_serie, porteur_id, site_id, lot_id, article_id, article:articles(designation), identifiants(valeur, technologie, actif)';

export function codeVisible(v) {
  return v.identifiants?.find((i) => i.actif)?.valeur ?? v.numero_serie ?? v.id.slice(0, 8);
}

// Contenu d'un sac ou d'un lot, lu dans l'index local.
export { vetementsDuLotLocal as vetementsDuLot } from '../hors-ligne/local.js';

// Envoie un événement par vêtement lu en rafale ; renvoie le bilan (rejets libellés par code lu)
// et la liste des vêtements refusés, que la rafale garde affichés.
export async function envoyerPourLus(organisationId, lus, fabrique) {
  const evts = lus.map(fabrique);
  const reponses = await emettre(organisationId, evts);
  const parId = Object.fromEntries(evts.map((e, i) => [e.id, lus[i]]));
  const b = bilan(reponses);
  b.rejets = b.rejets.map((r) => ({ ...r, libelle: parId[r.id]?.lecture?.valeur }));
  b.refuses = b.rejets.map((r) => parId[r.id]?.vetementId);
  b.acceptes_ids = reponses.filter((r) => r.statut !== 'rejete').map((r) => parId[r.id]?.vetementId);
  return b;
}
