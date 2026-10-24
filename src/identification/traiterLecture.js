import { supabase } from '../lib/supabase.js';
import { contexteCourant } from '../hors-ligne/synchro.js';
import { rafraichir } from '../hors-ligne/tirage.js';
import { enregistrerLectureBrute } from './lecturesBrutes.js';
import { resoudre, resoudreLocal } from './resolution.js';
import { signaler } from './retour.js';

// Chaîne commune à tous les écrans : résolution (index local d'abord, puis la base si en ligne),
// trace dans lectures_brutes, signal.
export async function traiterLecture(lecture, { organisationId, contexte }) {
  let resultat = await resoudreLocal(lecture, { organisationId });
  const ctx = contexteCourant();
  if (resultat.statut === 'inconnu' && ctx?.enLigne()) {
    const distant = await resoudre(lecture, { client: supabase, organisationId });
    if (distant.statut !== 'erreur') resultat = distant;
    // Vêtement absent de l'index : on l'y ajoute pour les écritures qui vont suivre.
    if (distant.statut === 'trouve' && ctx.index) {
      await rafraichir(organisationId, { vetements: [distant.vetementId] }).catch(() => {});
    }
  }
  const erreurTrace = await enregistrerLectureBrute({
    organisationId,
    lecture,
    vetementId: resultat.statut === 'trouve' ? resultat.vetementId : null,
    contexte: { ...contexte, source: lecture.source, resultat: resultat.statut },
  });
  signaler(resultat.statut === 'erreur' ? 'erreur' : resultat.statut);
  return { ...resultat, erreurTrace };
}
