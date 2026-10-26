import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Chargement from '../composants/Chargement.jsx';
import { base } from '../hors-ligne/base.js';
import { useLocal } from '../hors-ligne/local.js';
import { useSortie } from '../hors-ligne/useSortie.js';
import Icone from '../composants/Icone.jsx';

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
  const { utilisateur } = useAuth();
  const { sortir, enCours: sortie } = useSortie();
  // Écritures pas encore envoyées, par zone (prestataire multi-zones).
  const enAttente = useLocal(
    async () => {
      const parZone = {};
      await base.file
        .filter((i) => i.utilisateur_id === utilisateur?.id && !['lecture', 'signalement'].includes(i.genre))
        .each((i) => (parZone[i.organisation_id] = (parZone[i.organisation_id] ?? 0) + 1));
      return parZone;
    },
    [utilisateur?.id],
    {},
  );
  const { adhesions, organisation, chargement, erreur, recharger, choisir, estPlateforme, zonesSuspendues } = useOrganisation();
  const navigate = useNavigate();
  const location = useLocation();
  const destination = location.state?.depuis?.pathname ?? '/';

  if (chargement) return <Chargement />;
  if (adhesions.length === 1 && organisation && !estPlateforme) return <Navigate to={destination} replace />;

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
              <span className="choix-detail">
                {[m.role === 'support' ? 'Accès support (lecture seule)' : LIBELLES_ROLE[m.role] ?? m.role, m.site?.nom].filter(Boolean).join(' · ')}
                {enAttente[m.organisation.id] ? ` · ${enAttente[m.organisation.id]} en attente d’envoi` : ''}
              </span>
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
        {zonesSuspendues > 0 && (
          <p className="message message-erreur">
            {zonesSuspendues === 1 ? 'Une de vos zones est suspendue' : `${zonesSuspendues} de vos zones sont suspendues`} : contactez le
            support de la plateforme.
          </p>
        )}
        {corps}
        {estPlateforme && (
          <Link to="/plateforme" className="bouton bouton-large">
            <Icone nom="plateforme" taille={24} />
            Espace Plateforme (gestion des clients)
          </Link>
        )}
        <div className="rangee-actions">
          <button type="button" className="bouton" onClick={recharger}>
            <Icone nom="actualiser" />
            Actualiser
          </button>
          <button type="button" className="bouton bouton-discret" onClick={sortir} disabled={sortie}>
            {sortie ? 'Déconnexion…' : 'Déconnexion'}
          </button>
        </div>
      </div>
    </div>
  );
}
