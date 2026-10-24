import { candidats } from '../identification/normalisation.js';

// Retrouve le sac d'une lecture normalisée parmi les sacs actifs chargés.
export function trouverSac(sacs, lecture) {
  const valeurs = new Set(candidats(lecture).map((c) => c.valeur));
  return (
    sacs.find(
      (s) => s.actif && s.code && valeurs.has(s.code) && (!lecture.technologie || !s.technologie || s.technologie === lecture.technologie),
    ) ?? null
  );
}

// Statuts d'une tournée de sac encore en cours (un seul par sac).
export const TOURNEE_EN_COURS = ['ouvert', 'ferme', 'expedie'];
