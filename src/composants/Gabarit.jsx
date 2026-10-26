import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import IndicateurConnexion from './IndicateurConnexion.jsx';
import BoutonTheme from './BoutonTheme.jsx';
import { useSortie } from '../hors-ligne/useSortie.js';
import { appliquerIcones, urlLogo } from '../lib/logo.js';
import Icone from './Icone.jsx';

export default function Gabarit() {
  const { organisation, adhesions, adhesion, recharger, oublier } = useOrganisation();
  const { voitReferentiels, livre, support, estPlateforme } = useDroits();
  const navigate = useNavigate();

  async function quitterSupport() {
    await supabase.rpc('fermer_support', { org: organisation.id });
    oublier();
    await recharger();
    navigate('/plateforme');
  }
  const { sortir, enCours: sortie } = useSortie();
  // Icône de l'application et de l'onglet : le logo de la zone ouverte.
  useEffect(() => {
    appliquerIcones(organisation?.id, organisation?.logo_le);
  }, [organisation?.id, organisation?.logo_le]);
  const logo = organisation && urlLogo(organisation.id, organisation.logo_le);

  return (
    <div className="gabarit">
      <header className="entete">
        <div className="entete-identite">
          {logo && <img className="logo-zone" src={logo} alt="" />}
          <div className="entete-titre">
            <Link to="/" className="marque">Suivi linge</Link>
            {organisation && <span className="organisation-courante">{organisation.nom}</span>}
          </div>
        </div>
        <div className="entete-actions">
          {estPlateforme && (
            <Link to="/plateforme" className="bouton bouton-discret" title="Plateforme"><Icone nom="plateforme" /><span className="libelle-icone">Plateforme</span></Link>
          )}
          {adhesions.length > 1 && (
            <Link to="/organisation" className="bouton bouton-discret" title="Changer de zone"><Icone nom="changer" /><span className="libelle-icone">Changer</span></Link>
          )}
          <BoutonTheme />
          <button type="button" className="bouton bouton-discret" onClick={sortir} disabled={sortie} title="Déconnexion">
            <Icone nom="sortie" />
            <span className="libelle-icone">{sortie ? 'Déconnexion…' : 'Déconnexion'}</span>
          </button>
        </div>
      </header>
      <nav className="navigation" aria-label="Navigation principale">
        <NavLink to="/" end><Icone nom="accueil" taille={22} />Accueil</NavLink>
        <NavLink to="/scan"><Icone nom="scanner" taille={22} />Scanner</NavLink>
        {livre && <NavLink to="/laverie"><Icone nom="laverie" taille={22} />Laverie</NavLink>}
        {voitReferentiels && <NavLink to="/parametres"><Icone nom="reglages" taille={22} />Réglages</NavLink>}
      </nav>
      {support && (
        <div className="bandeau-support" role="status">
          <span>
            Accès support en lecture seule, tracé — jusqu’à{' '}
            {new Date(adhesion.support_fin).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button type="button" className="bouton bouton-discret" onClick={quitterSupport}>
            <Icone nom="sortie" />
            Quitter
          </button>
        </div>
      )}
      <IndicateurConnexion />
      <main className="contenu">
        <Outlet />
      </main>
    </div>
  );
}
