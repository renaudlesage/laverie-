import { Link } from 'react-router-dom';
import { ROLES } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import TableauDeBord from '../alertes/TableauDeBord.jsx';

export default function Accueil() {
  const { organisation, role } = useOrganisation();
  const { voitReferentiels, enrole, inventaire, voitVetements, rapports } = useDroits();
  return (
    <section className="pile">
      <div className="carte">
        <h1>{organisation.nom}</h1>
        <p>
          Connecté en tant que <strong>{ROLES[role] ?? role}</strong>.
        </p>
        <div className="pile">
          <Link to="/scan" className="bouton bouton-principal bouton-large">
            Scanner un vêtement
          </Link>
          {role === 'porteur' && (
            <Link to="/mes-vetements" className="bouton bouton-large">
              Mes vêtements
            </Link>
          )}
          {voitVetements && (
            <Link to="/vetements" className="bouton bouton-large">
              Rechercher un vêtement
            </Link>
          )}
          {rapports && (
            <Link to="/rapports" className="bouton bouton-large">
              Rapports
            </Link>
          )}
          {inventaire && (
            <Link to="/inventaire" className="bouton bouton-large">
              Faire un inventaire
            </Link>
          )}
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
      </div>
      {role !== 'porteur' && <TableauDeBord />}
    </section>
  );
}
