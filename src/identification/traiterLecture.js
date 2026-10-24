import { supabase } from '../lib/supabase.js';
import { enregistrerLectureBrute } from './lecturesBrutes.js';
import { resoudre } from './resolution.js';
import { signaler } from './retour.js';

// Chaîne commune à tous les écrans : résolution, trace dans lectures_brutes, signal.
export async function traiterLecture(lecture, { organisationId, contexte }) {
  const resultat = await resoudre(lecture, { client: supabase, organisationId });
  const erreurTrace = await enregistrerLectureBrute({
    organisationId,
    lecture,
    vetementId: resultat.statut === 'trouve' ? resultat.vetementId : null,
    contexte: { ...contexte, source: lecture.source, resultat: resultat.statut },
  });
  signaler(resultat.statut === 'erreur' ? 'erreur' : resultat.statut);
  return { ...resultat, erreurTrace };
}
