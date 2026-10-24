import { useEffect, useState } from 'react';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useLignes } from '../referentiels/useLignes.js';

const TYPES_LAVERIE = ['laverie_interne', 'laverie_externe'];

// Laverie où l'on travaille sur cet appareil. La laverie externe est rattachée à son site ;
// les autres rôles choisissent, et le choix est retenu sur l'appareil.
export function useSiteTravail() {
  const { organisation, adhesion } = useOrganisation();
  const { lignes: sites, chargement } = useLignes('sites', { ordre: 'nom' });
  const cle = `suivi-linge.site-travail.${organisation.id}`;
  const impose = adhesion?.role === 'laverie_externe' ? adhesion.site_id : null;
  const [choisi, setChoisi] = useState(() => {
    try {
      return localStorage.getItem(cle);
    } catch {
      return null;
    }
  });
  const laveries = sites.filter((s) => s.actif && TYPES_LAVERIE.includes(s.type));
  const siteId = impose ?? (laveries.some((s) => s.id === choisi) ? choisi : laveries.length === 1 ? laveries[0].id : null);

  useEffect(() => {
    if (impose || !choisi) return;
    try {
      localStorage.setItem(cle, choisi);
    } catch {
      // Choix valable pour la session.
    }
  }, [cle, choisi, impose]);

  return {
    siteId,
    site: sites.find((s) => s.id === siteId) ?? null,
    laveries,
    sites,
    chargement,
    impose: !!impose,
    choisir: setChoisi,
  };
}

export function ChoixSiteTravail({ travail }) {
  if (travail.impose || travail.laveries.length <= 1) {
    return travail.site ? <p className="etiquette">Site : {travail.site.nom}</p> : null;
  }
  return (
    <label className="choix-site">
      <span className="etiquette">Laverie de travail</span>
      <select value={travail.siteId ?? ''} onChange={(e) => travail.choisir(e.target.value || null)}>
        <option value="">Choisir…</option>
        {travail.laveries.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nom}
          </option>
        ))}
      </select>
    </label>
  );
}
