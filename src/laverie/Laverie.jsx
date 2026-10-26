import { Link } from 'react-router-dom';
import { useDroits } from '../organisation/useDroits.js';
import Icone from '../composants/Icone.jsx';

const ENTREES = [
  { chemin: 'collecte', icone: 'collecte', titre: 'Collecte', detail: 'Remplir un sac au poste, puis l’expédier', droit: 'collecte' },
  { chemin: 'reception', icone: 'reception', titre: 'Réception', detail: 'Réceptionner un sac : attendus, lus, écarts', droit: 'gestesLaverie' },
  { chemin: 'lots', icone: 'lots', titre: 'Lots de traitement', detail: 'Constituer, clôturer (comptage) ou avorter', droit: 'gestesLaverie' },
  { chemin: 'controle', icone: 'controle', titre: 'Contrôle', detail: 'Conforme, à réparer, à réformer', droit: 'gestesLaverie' },
  { chemin: 'livraison', icone: 'livraison', titre: 'Livraison', detail: 'Rendre au poste ou au pompier', droit: 'livre' },
];

export default function Laverie() {
  const droits = useDroits();
  return (
    <section>
      <h1>Laverie</h1>
      <ul className="liste">
        {ENTREES.filter((e) => droits[e.droit]).map((e) => (
          <li key={e.chemin}>
            <Link to={e.chemin} className="ligne-liste ligne-avec-icone">
              <Icone nom={e.icone} taille={26} />
              <span className="ligne-textes">
                <span className="ligne-titre">{e.titre}</span>
                <span className="ligne-detail">{e.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="texte-secondaire">
        Circuit contaminé : sac et lot dédiés, jamais mélangés au circuit standard ; contrôle renforcé avant tout retour en service.
      </p>
    </section>
  );
}
