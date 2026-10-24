import { supabase } from '../lib/supabase.js';
import { nouvelId } from '../identification/codes.js';

// Point d'envoi unique des événements métier (règle transversale du backlog à partir de M5).
// Aujourd'hui : envoi direct à ingerer_evenements. Jalon M7 : file locale persistée (IndexedDB),
// envoyée dans l'ordre et rejouée après coupure — sans changer les écrans qui appellent emettre().

let enAttente = 0;
const abonnes = new Set();

function notifier() {
  for (const f of abonnes) f();
}

export function abonnerFile(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

export function nombreEnAttente() {
  return enAttente;
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

// Renvoie, pour chaque événement et dans l'ordre : { id, statut: 'accepte' | 'doublon' | 'rejete', motif? }.
export async function emettre(organisationId, evenements) {
  enAttente += evenements.length;
  notifier();
  try {
    const { data, error } = await supabase.rpc('ingerer_evenements', { org: organisationId, evenements });
    if (error) throw error;
    return data;
  } finally {
    enAttente -= evenements.length;
    notifier();
  }
}

// Opérations sur les lots (ouvrir_sac, expedier_sac, receptionner_sac, ouvrir_lot, cloturer_lot,
// avorter_lot). Rejouables : une opération déjà faite répond « doublon ». Même file qu'emettre au M7.
export function operation(type, lotId, donnees = {}) {
  return { id: nouvelId(), type, lot_id: lotId, survenu_le: new Date().toISOString(), ...donnees };
}

export async function operer(organisationId, operations) {
  enAttente += operations.length;
  notifier();
  try {
    const { data, error } = await supabase.rpc('operer_lots', { org: organisationId, operations });
    if (error) throw error;
    return data;
  } finally {
    enAttente -= operations.length;
    notifier();
  }
}

// Bilan d'un envoi groupé : { acceptes, doublons, rejets: [{ id, motif }] }.
export function bilan(reponses) {
  return {
    acceptes: reponses.filter((r) => r.statut === 'accepte').length,
    doublons: reponses.filter((r) => r.statut === 'doublon').length,
    rejets: reponses.filter((r) => r.statut === 'rejete'),
  };
}
