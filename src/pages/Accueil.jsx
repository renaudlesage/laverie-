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
      {voitReferentiels && (
        <p>
          <Link to="/parametres" className="bouton bouton-principal">
            Paramètres de la zone
          </Link>
        </p>
      )}
      <p className="texte-secondaire">Le scan et les écrans de laverie arrivent avec les jalons suivants.</p>
    </section>
  );
}
