import { useEnLigne, useFileAttente } from '../connexion/useConnexion.js';

export default function IndicateurConnexion() {
  const enLigne = useEnLigne();
  const enAttente = useFileAttente();
  return (
    <div className={`indicateur ${enLigne ? 'en-ligne' : 'hors-ligne'}`} role="status" aria-live="polite">
      <span className="pastille" aria-hidden="true" />
      <span>{enLigne ? 'En ligne' : 'Hors ligne'}</span>
      <span className="separateur" aria-hidden="true">·</span>
      <span>
        {enAttente === 0 ? 'Rien en attente' : `${enAttente} en attente`}
      </span>
    </div>
  );
}
