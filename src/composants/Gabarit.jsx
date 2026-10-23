import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import IndicateurConnexion from './IndicateurConnexion.jsx';

export default function Gabarit() {
  const { deconnexion } = useAuth();
  const { organisation, adhesions } = useOrganisation();

  return (
    <div className="gabarit">
      <header className="entete">
        <div className="entete-titre">
          <Link to="/" className="marque">Suivi linge</Link>
          {organisation && <span className="organisation-courante">{organisation.nom}</span>}
        </div>
        <div className="entete-actions">
          {adhesions.length > 1 && (
            <Link to="/organisation" className="bouton bouton-discret">Changer</Link>
          )}
          <button type="button" className="bouton bouton-discret" onClick={deconnexion}>
            Déconnexion
          </button>
        </div>
      </header>
      <IndicateurConnexion />
      <main className="contenu">
        <Outlet />
      </main>
    </div>
  );
}
