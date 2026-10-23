import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Chargement from './Chargement.jsx';

export function ExigeSession({ children }) {
  const { session, chargement, sortieVolontaire } = useAuth();
  const location = useLocation();
  if (chargement) return <Chargement />;
  if (!session) return <Navigate to="/connexion" replace state={sortieVolontaire ? undefined : { depuis: location }} />;
  return children;
}

export function ExigeOrganisation({ children }) {
  const { organisation, chargement } = useOrganisation();
  const location = useLocation();
  if (chargement) return <Chargement />;
  if (!organisation) return <Navigate to="/organisation" replace state={{ depuis: location }} />;
  return children;
}
