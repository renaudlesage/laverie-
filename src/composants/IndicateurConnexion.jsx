import { Link } from 'react-router-dom';
import { useSynchro } from '../connexion/useConnexion.js';

export default function IndicateurConnexion() {
  const { enLigne, enAttente, conflits, enCours, erreur } = useSynchro();
  return (
    <Link to="/synchronisation" className={`indicateur ${enLigne ? 'en-ligne' : 'hors-ligne'}`} role="status" aria-live="polite">
      <span className="pastille" aria-hidden="true" />
      <span>{enLigne ? (enCours ? 'Synchronisation' : 'En ligne') : 'Hors ligne'}</span>
      <span className="separateur" aria-hidden="true">·</span>
      <span>{enAttente === 0 ? 'Rien en attente' : `${enAttente} en attente`}</span>
      {conflits > 0 && (
        <>
          <span className="separateur" aria-hidden="true">·</span>
          <span className="indicateur-conflits">
            {conflits} conflit{conflits > 1 ? 's' : ''}
          </span>
        </>
      )}
      {enLigne && erreur && enAttente > 0 && (
        <>
          <span className="separateur" aria-hidden="true">·</span>
          <span className="indicateur-conflits">Envoi interrompu</span>
        </>
      )}
    </Link>
  );
}
