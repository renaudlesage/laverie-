import { useOrganisation } from './OrganisationProvider.jsx';

// Droits d'interface ; la base les revérifie (RLS).
export function useDroits() {
  const { role } = useOrganisation();
  return {
    estAdmin: role === 'admin',
    gerePorteurs: role === 'admin' || role === 'gestionnaire',
    voitReferentiels: ['admin', 'gestionnaire', 'operateur_laverie', 'auditeur'].includes(role),
    enrole: role === 'admin' || role === 'gestionnaire',
    voitNoms: ['admin', 'gestionnaire', 'operateur_laverie', 'auditeur', 'porteur'].includes(role),
  };
}
