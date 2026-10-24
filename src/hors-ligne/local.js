import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { base } from './base.js';

// Lecture réactive de l'index local : l'écran se met à jour dès que la projection change
// (écriture sur l'appareil ou tirage depuis la base).
export function useLocal(requete, dependances, initial = undefined) {
  const [valeur, setValeur] = useState(initial);
  useEffect(() => {
    const abonnement = liveQuery(requete).subscribe({
      next: setValeur,
      error: (e) => console.error('Index local :', e),
    });
    return () => abonnement.unsubscribe();
  }, dependances); // eslint-disable-line react-hooks/exhaustive-deps
  return valeur;
}

// Vêtements complétés pour l'affichage : désignation de l'article et identifiants actifs.
export async function enrichir(vetements) {
  const articles = new Map((await base.articles.bulkGet([...new Set(vetements.map((v) => v.article_id))])).filter(Boolean).map((a) => [a.id, a]));
  const identifiants = await base.identifiants.where('vetement_id').anyOf(vetements.map((v) => v.id)).toArray();
  return vetements.map((v) => ({
    ...v,
    article: { designation: articles.get(v.article_id)?.designation ?? 'Article' },
    identifiants: identifiants.filter((i) => i.vetement_id === v.id && i.actif),
  }));
}

export const parNom = (a, b) => (a.nom ?? '').localeCompare(b.nom ?? '', 'fr');

export async function lignesOrganisation(table, organisationId) {
  return base.table(table).where('organisation_id').equals(organisationId).toArray();
}

export async function vetementsDuLotLocal(lotId, statut) {
  const liste = await base.vetements.where('lot_id').equals(lotId).toArray();
  return enrichir(statut ? liste.filter((v) => v.statut === statut) : liste);
}

export async function vetementsParStatut(organisationId, statuts, siteId) {
  const liste = await base.vetements
    .where('[organisation_id+statut]')
    .anyOf(statuts.map((s) => [organisationId, s]))
    .toArray();
  return enrichir(siteId ? liste.filter((v) => v.site_id === siteId) : liste);
}
