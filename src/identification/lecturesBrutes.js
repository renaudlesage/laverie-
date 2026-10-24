import { nouvelId } from './codes.js';
import { ecrireLecture } from '../hors-ligne/ecriture.js';
import { compter, contexteCourant } from '../hors-ligne/synchro.js';

// Trace de chaque lecture dans lectures_brutes (CLAUDE.md §6 : une lecture n'est jamais perdue).
// Déposée dans la file locale, envoyée avec les autres écritures, même hors ligne.
export async function enregistrerLectureBrute({ organisationId, lecture, vetementId, contexte }) {
  const ctx = contexteCourant();
  if (!ctx || ctx.organisationId !== organisationId) return new Error('Synchronisation non démarrée');
  try {
    await ecrireLecture(ctx, {
      id: nouvelId(),
      organisation_id: organisationId,
      lecteur_id: lecture.lecteur_id ?? null,
      technologie: lecture.technologie ?? null,
      valeur: lecture.valeur,
      lu_le: lecture.lu_le,
      vetement_id: vetementId ?? null,
      contexte: { valeur_brute: lecture.valeur_brute, ...contexte },
    });
    await compter();
    return null;
  } catch (e) {
    return e;
  }
}
