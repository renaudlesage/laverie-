import { motifLisible } from '../hors-ligne/motifs.js';

// Compte rendu d'un envoi groupé d'événements ou d'opérations.
export default function CompteRendu({ resultat }) {
  if (!resultat) return null;
  const { acceptes, doublons, rejets, texte } = resultat;
  return (
    <div className={`message ${rejets?.length ? 'message-erreur' : ''}`} role="status">
      {texte && <p className="sans-marge">{texte}</p>}
      {acceptes !== undefined && (
        <p className="sans-marge">
          {acceptes} enregistré(s){resultat.enAttente ? ` (dont ${resultat.enAttente} en attente d’envoi)` : ''}
          {doublons ? `, ${doublons} déjà enregistré(s)` : ''}
          {rejets?.length ? `, ${rejets.length} refusé(s)` : ''}.
        </p>
      )}
      {rejets?.length > 0 && (
        <ul>
          {rejets.map((r) => (
            <li key={r.id}>
              {r.libelle ? `${r.libelle} : ` : ''}
              {motifLisible(r.motif)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
