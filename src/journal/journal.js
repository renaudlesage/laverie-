import { nouvelId } from '../identification/codes.js';
import { ecrireEvenements, ecrireOperations } from '../hors-ligne/ecriture.js';
import { abonner, attendre, compter, contexteCourant, lireEtat, synchroniser } from '../hors-ligne/synchro.js';

// Point d'envoi unique des écritures métier. Toutes passent par la file locale, même en ligne
// (invariant 10) : règles vérifiées sur l'appareil, projection locale mise à jour, puis envoi
// dans l'ordre. En ligne, on attend quelques secondes la réponse de la base pour l'afficher ;
// hors ligne, l'écriture reste « en attente » et part au retour du réseau.

export function abonnerFile(rappel) {
  return abonner(rappel);
}

export function nombreEnAttente() {
  return lireEtat().enAttente;
}

// UUID produit sur l'appareil : renvoyer le même événement est sans effet (invariant 5).
export function evenement(type, vetementId, { donnees = {}, siteId = null, lotId = null, lecteurId = null } = {}) {
  return {
    id: nouvelId(),
    vetement_id: vetementId,
    type,
    survenu_le: new Date().toISOString(),
    site_id: siteId,
    lot_id: lotId,
    lecteur_id: lecteurId,
    donnees,
  };
}

function contexte(organisationId) {
  const ctx = contexteCourant();
  if (!ctx || ctx.organisationId !== organisationId) throw new Error('Synchronisation non démarrée pour cette organisation');
  return ctx;
}

// Écrit localement, puis attend la base si l'appareil est en ligne.
async function ecrireEtAttendre(organisationId, ecrits, ecrire) {
  const ctx = contexte(organisationId);
  const attente = ctx.enLigne() ? attendre(ecrits.map((e) => e.id)) : null;
  let locales;
  try {
    locales = await ecrire(ctx, ecrits);
  } catch (e) {
    for (const x of ecrits) attente?.abandonner(x.id);
    throw e;
  }
  for (const r of locales) if (r.statut !== 'en_attente') attente?.abandonner(r.id);
  await compter();
  if (!attente || !locales.some((r) => r.statut === 'en_attente')) return locales;
  synchroniser();
  const serveur = await attente.resultat;
  return locales.map((r, i) => (r.statut === 'en_attente' && serveur[i] ? serveur[i] : r));
}

// Renvoie, pour chaque événement et dans l'ordre :
// { id, statut: 'accepte' | 'doublon' | 'rejete' | 'en_attente', motif? }.
export function emettre(organisationId, evenements) {
  return ecrireEtAttendre(organisationId, evenements, ecrireEvenements);
}

// Opérations sur les lots (ouvrir_sac, expedier_sac, receptionner_sac, ouvrir_lot, cloturer_lot,
// avorter_lot). Rejouables : une opération déjà faite répond « doublon ». Même file que les événements.
export function operation(type, lotId, donnees = {}) {
  return { id: nouvelId(), type, lot_id: lotId, survenu_le: new Date().toISOString(), ...donnees };
}

export function operer(organisationId, operations) {
  return ecrireEtAttendre(organisationId, operations, ecrireOperations);
}

// Bilan d'un envoi groupé : { acceptes, enAttente, doublons, rejets: [{ id, motif }] }.
// « acceptes » compte aussi les écritures enregistrées sur l'appareil en attente d'envoi.
export function bilan(reponses) {
  return {
    acceptes: reponses.filter((r) => r.statut === 'accepte' || r.statut === 'en_attente').length,
    enAttente: reponses.filter((r) => r.statut === 'en_attente').length,
    doublons: reponses.filter((r) => r.statut === 'doublon').length,
    rejets: reponses.filter((r) => r.statut === 'rejete'),
  };
}
