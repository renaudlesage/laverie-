import { STATUTS_VETEMENT } from '../lib/libelles.js';
import { LIBELLES_EVENEMENTS } from '../vetements/Historique.jsx';

// Motif de refus de la base rendu lisible : codes d'événement et de statut en français.
export function motifLisible(motif = '') {
  return motif
    .replace(/« (\w+) » depuis le statut « (\w+) »/, (tout, type, statut) =>
      `« ${LIBELLES_EVENEMENTS[type] ?? type} » impossible pour un vêtement « ${STATUTS_VETEMENT[statut] ?? statut} »`,
    )
    .replace(/^Transition impossible : /, '');
}
