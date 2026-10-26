import { Link } from 'react-router-dom';
import { ROLES } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import TableauDeBord from '../alertes/TableauDeBord.jsx';
import Icone from '../composants/Icone.jsx';

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
            <Icone nom="scanner" taille={24} />
            Scanner un vêtement
          </Link>
          {role === 'porteur' && (
            <Link to="/mes-vetements" className="bouton bouton-large">
              <Icone nom="articles" taille={24} />
              Mes vêtements
            </Link>
          )}
          {voitVetements && (
            <Link to="/vetements" className="bouton bouton-large">
              <Icone nom="rechercher" taille={24} />
              Rechercher un vêtement
            </Link>
          )}
          {rapports && (
            <Link to="/rapports" className="bouton bouton-large">
              <Icone nom="rapports" taille={24} />
              Rapports
            </Link>
          )}
          {inventaire && (
            <Link to="/inventaire" className="bouton bouton-large">
              <Icone nom="inventaire" taille={24} />
              Faire un inventaire
            </Link>
          )}
          {enrole && (
            <>
              <Link to="/enrolement" className="bouton bouton-large">
                <Icone nom="enroler" taille={24} />
                Enrôler un vêtement
              </Link>
              <Link to="/etiquettes" className="bouton bouton-large">
                <Icone nom="etiquettes" taille={24} />
                Imprimer des étiquettes QR
              </Link>
              <Link to="/vetements/import" className="bouton bouton-large">
                <Icone nom="importer" taille={24} />
                Importer l’existant (CSV)
              </Link>
            </>
          )}
          {voitReferentiels && (
            <Link to="/parametres" className="bouton bouton-large">
              <Icone nom="reglages" taille={24} />
              Paramètres de la zone
            </Link>
          )}
        </div>
      </div>
      {role !== 'porteur' && <TableauDeBord />}
    </section>
  );
}
