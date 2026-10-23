import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import IndicateurConnexion from './IndicateurConnexion.jsx';
import BoutonTheme from './BoutonTheme.jsx';

export default function Gabarit() {
  const { deconnexion } = useAuth();
  const { organisation, adhesions } = useOrganisation();
  const { voitReferentiels } = useDroits();

  return (
    <div className="gabarit">
      <header className="entete">
        <div className="entete-titre">
          <Link to="/" className="marque">Suivi linge</Link>
          {organisation && <span className="organisation-courante">{organisation.nom}</span>}
        </div>
        <div className="entete-actions">
          {voitReferentiels && (
            <Link to="/parametres" className="bouton bouton-discret">Paramètres</Link>
          )}
          {adhesions.length > 1 && (
            <Link to="/organisation" className="bouton bouton-discret">Changer</Link>
          )}
          <BoutonTheme />
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
