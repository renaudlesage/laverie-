import { useOrganisation } from './OrganisationProvider.jsx';

// Droits d'interface ; la base les revérifie (RLS).
export function useDroits() {
  const { role } = useOrganisation();
  return {
    estAdmin: role === 'admin',
    gerePorteurs: role === 'admin' || role === 'gestionnaire',
    voitReferentiels: ['admin', 'gestionnaire', 'operateur_laverie', 'auditeur'].includes(role),
    enrole: role === 'admin' || role === 'gestionnaire',
    laverie: role === 'operateur_laverie' || role === 'laverie_externe',
    // Laverie (M6) : collecte au poste, gestes de laverie, livraison.
    collecte: ['admin', 'gestionnaire', 'operateur_laverie'].includes(role),
    gestesLaverie: ['admin', 'operateur_laverie', 'laverie_externe'].includes(role),
    rapports: ['admin', 'gestionnaire', 'operateur_laverie', 'auditeur', 'laverie_externe'].includes(role),
    inventaire: ['admin', 'gestionnaire', 'operateur_laverie'].includes(role),
    voitVetements: role !== 'porteur',
    livre: ['admin', 'gestionnaire', 'operateur_laverie', 'laverie_externe'].includes(role),
    voitNoms: ['admin', 'gestionnaire', 'operateur_laverie', 'auditeur', 'porteur'].includes(role),
  };
}
