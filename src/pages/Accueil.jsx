import { Link } from 'react-router-dom';
import { ROLES } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';

export default function Accueil() {
  const { organisation, role } = useOrganisation();
  const { voitReferentiels, enrole } = useDroits();
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
        {enrole && (
          <>
            <Link to="/enrolement" className="bouton bouton-large">
              Enrôler un vêtement
            </Link>
            <Link to="/etiquettes" className="bouton bouton-large">
              Imprimer des étiquettes QR
            </Link>
            <Link to="/vetements/import" className="bouton bouton-large">
              Importer l’existant (CSV)
            </Link>
          </>
        )}
        {voitReferentiels && (
          <Link to="/parametres" className="bouton bouton-large">
            Paramètres de la zone
          </Link>
        )}
      </div>
      <p className="texte-secondaire">Laverie, alertes et tableau de bord arrivent avec les jalons suivants.</p>
    </section>
  );
}
