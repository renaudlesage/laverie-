import { supabase } from '../lib/supabase.js';

// Trace de chaque lecture dans lectures_brutes (CLAUDE.md §6 : une lecture n'est jamais perdue).
// La file hors-ligne (M7) prendra le relais quand le réseau manque.
export async function enregistrerLectureBrute({ organisationId, lecture, vetementId, contexte }) {
  const { error } = await supabase.from('lectures_brutes').insert({
    organisation_id: organisationId,
    lecteur_id: lecture.lecteur_id ?? null,
    technologie: lecture.technologie ?? null,
    valeur: lecture.valeur,
    lu_le: lecture.lu_le,
    vetement_id: vetementId ?? null,
    contexte: { valeur_brute: lecture.valeur_brute, ...contexte },
  });
  return error;
}
