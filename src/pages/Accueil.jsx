import { Link } from 'react-router-dom';
import { ROLES } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';

export default function Accueil() {
  const { organisation, role } = useOrganisation();
  const { voitReferentiels } = useDroits();
  return (
    <section className="carte">
      <h1>{organisation.nom}</h1>
      <p>
        Connecté en tant que <strong>{ROLES[role] ?? role}</strong>.
      </p>
      <div className="pile">
        <Link to="/scan" className="bouton bouton-principal bouton-large">
          Scanner un vêtement
        </Link>
        {voitReferentiels && (
          <Link to="/parametres" className="bouton bouton-large">
            Paramètres de la zone
          </Link>
        )}
      </div>
      <p className="texte-secondaire">Enrôlement, laverie et alertes arrivent avec les jalons suivants.</p>
    </section>
  );
}
