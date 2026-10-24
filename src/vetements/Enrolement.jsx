import { Link, useSearchParams } from 'react-router-dom';
import { TECHNOLOGIES } from '../lib/libelles.js';

// Point d'entrée de l'enrôlement depuis un identifiant inconnu. Le formulaire arrive au jalon M4 ;
// l'identifiant est déjà conservé dans lectures_brutes.
export default function Enrolement() {
  const [parametres] = useSearchParams();
  const valeur = parametres.get('valeur');
  const technologie = parametres.get('technologie');
  return (
    <section className="carte">
      <p className="etiquette">Enrôlement</p>
      <h1>Nouveau vêtement</h1>
      {valeur && (
        <p>
          Identifiant à associer : <span className="mono">{valeur}</span>
          <br />
          <span className="texte-secondaire">{TECHNOLOGIES[technologie] ?? 'Technologie à préciser'}</span>
        </p>
      )}
      <p className="message">Le formulaire d'enrôlement arrive au jalon M4. Cette lecture est conservée et pourra être reprise.</p>
      <Link to="/scan" className="bouton">
        Retour au scan
      </Link>
    </section>
  );
}
