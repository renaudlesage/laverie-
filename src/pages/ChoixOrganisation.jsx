import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Chargement from '../composants/Chargement.jsx';

const LIBELLES_ROLE = {
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  porteur: 'Porteur',
  operateur_laverie: 'Opérateur laverie',
  laverie_externe: 'Laverie externe',
  auditeur: 'Auditeur',
};

// Table absente : le schéma (jalon M1) n'est pas encore installé.
function schemaAbsent(erreur) {
  return erreur && ['42P01', 'PGRST205', 'PGRST200'].includes(erreur.code);
}

export default function ChoixOrganisation() {
  const { utilisateur, deconnexion } = useAuth();
  const { adhesions, organisation, chargement, erreur, recharger, choisir } = useOrganisation();
  const navigate = useNavigate();
  const location = useLocation();
  const destination = location.state?.depuis?.pathname ?? '/';

  if (chargement) return <Chargement />;
  if (adhesions.length === 1 && organisation) return <Navigate to={destination} replace />;

  let corps;
  if (erreur) {
    corps = schemaAbsent(erreur) ? (
      <p className="message message-info">
        La base n'est pas encore initialisée : exécutez les migrations du jalon M1 dans le SQL Editor de Supabase.
      </p>
    ) : (
      <p className="message message-erreur">Impossible de charger vos organisations ({erreur.message}).</p>
    );
  } else if (adhesions.length === 0) {
    corps = (
      <p className="message message-info">
        Votre compte ({utilisateur?.email}) n'est rattaché à aucune organisation. Demandez à votre administrateur de vous ajouter dans « Paramètres → Membres », puis touchez « Actualiser ».
      </p>
    );
  } else {
    corps = (
      <ul className="liste-choix">
        {adhesions.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className={`bouton bouton-choix ${m.organisation.id === organisation?.id ? 'actif' : ''}`}
              onClick={() => {
                choisir(m.organisation.id);
                navigate(destination, { replace: true });
              }}
            >
              <span className="choix-titre">{m.organisation.nom}</span>
              <span className="choix-detail">{LIBELLES_ROLE[m.role] ?? m.role}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="page-centree">
      <div className="carte">
        <h1>Choisir l'organisation</h1>
        {corps}
        <div className="rangee-actions">
          <button type="button" className="bouton" onClick={recharger}>
            Actualiser
          </button>
          <button type="button" className="bouton bouton-discret" onClick={deconnexion}>
            Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}
