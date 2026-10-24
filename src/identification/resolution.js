import { candidats } from './normalisation.js';

// Classe les identifiants actifs trouvés pour une lecture.
//   trouve  : un seul vêtement
//   ambigu  : plusieurs vêtements (même valeur sous deux technologies) → choix demandé
//   inconnu : aucun → enrôlement
export function classerCorrespondances(lignes) {
  const parVetement = new Map();
  for (const l of lignes) {
    if (!parVetement.has(l.vetement_id)) parVetement.set(l.vetement_id, l);
  }
  const correspondances = [...parVetement.values()];
  if (correspondances.length === 0) return { statut: 'inconnu', correspondances };
  if (correspondances.length === 1) {
    return { statut: 'trouve', vetementId: correspondances[0].vetement_id, correspondances };
  }
  return { statut: 'ambigu', correspondances };
}

// Cherche le vêtement d'une lecture normalisée parmi les identifiants actifs visibles (RLS).
export async function resoudre(lecture, { client, organisationId }) {
  const liste = candidats(lecture);
  let requete = client
    .from('identifiants')
    .select('vetement_id, technologie, valeur, vetement:vetements(id, statut, taille, numero_serie, article:articles(designation))')
    .eq('organisation_id', organisationId)
    .eq('actif', true)
    .in('valeur', [...new Set(liste.map((c) => c.valeur))]);
  if (lecture.technologie) requete = requete.eq('technologie', lecture.technologie);
  const { data, error } = await requete;
  if (error) return { statut: 'erreur', erreur: error, correspondances: [] };
  return classerCorrespondances(data);
}
