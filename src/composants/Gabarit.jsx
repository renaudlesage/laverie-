import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import IndicateurConnexion from './IndicateurConnexion.jsx';
import BoutonTheme from './BoutonTheme.jsx';
import { useSynchro } from '../connexion/useConnexion.js';
import { toutEffacer } from '../hors-ligne/base.js';
import { lireEtat, synchroniser } from '../hors-ligne/synchro.js';

export default function Gabarit() {
  const { deconnexion } = useAuth();
  const { organisation, adhesions } = useOrganisation();
  const { voitReferentiels, livre } = useDroits();
  const { enLigne } = useSynchro();
  const [sortie, setSortie] = useState(false);

  // L'appareil peut être partagé : l'index local et la file sont effacés à la déconnexion.
  async function sortir() {
    setSortie(true);
    if (enLigne) await synchroniser(); // ce qui peut partir part avant de tout effacer
    const { enAttente, tracesEnAttente } = lireEtat();
    const nonEnvoyes = enAttente + tracesEnAttente;
    if (
      nonEnvoyes > 0 &&
      !window.confirm(
        `${nonEnvoyes} écriture(s) ne sont pas encore envoyées${enLigne ? '' : ' (hors ligne)'} et seront perdues. Se déconnecter quand même ?`,
      )
    ) {
      setSortie(false);
      return;
    }
    await toutEffacer();
    await deconnexion();
  }

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
          <button type="button" className="bouton bouton-discret" onClick={sortir} disabled={sortie}>
            {sortie ? 'Déconnexion…' : 'Déconnexion'}
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
