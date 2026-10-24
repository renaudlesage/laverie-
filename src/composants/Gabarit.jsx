import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import IndicateurConnexion from './IndicateurConnexion.jsx';
import BoutonTheme from './BoutonTheme.jsx';

export default function Gabarit() {
  const { deconnexion } = useAuth();
  const { organisation, adhesions } = useOrganisation();
  const { voitReferentiels, livre } = useDroits();

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
          <BoutonTheme />
          <button type="button" className="bouton bouton-discret" onClick={deconnexion}>
            Déconnexion
          </button>
        </div>
      </header>
      <nav className="navigation" aria-label="Navigation principale">
        <NavLink to="/" end>Accueil</NavLink>
        <NavLink to="/scan">Scanner</NavLink>
        {livre && <NavLink to="/laverie">Laverie</NavLink>}
        {voitReferentiels && <NavLink to="/parametres">Réglages</NavLink>}
      </nav>
      <IndicateurConnexion />
      <main className="contenu">
        <Outlet />
      </main>
    </div>
  );
}
