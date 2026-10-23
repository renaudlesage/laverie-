import { Link } from 'react-router-dom';
import { useDroits } from '../organisation/useDroits.js';

const ENTREES = [
  { chemin: 'sites', titre: 'Sites', detail: 'Postes, magasins, laveries', droit: 'voitReferentiels' },
  { chemin: 'traitements', titre: 'Traitements', detail: 'Lavage, séchage, nettoyage à sec, décontamination…', droit: 'voitReferentiels' },
  { chemin: 'articles', titre: 'Articles', detail: 'Catalogue, limites par traitement, notices', droit: 'voitReferentiels' },
  { chemin: 'porteurs', titre: 'Porteurs', detail: 'Pompiers, matricules, casiers, import CSV', droit: 'voitReferentiels' },
  { chemin: 'lecteurs', titre: 'Lecteurs', detail: 'Douchettes, caméras, NFC', droit: 'voitReferentiels' },
  { chemin: 'membres', titre: 'Membres', detail: 'Comptes, rôles, invitations', droit: 'estAdmin' },
];

export default function Parametres() {
  const droits = useDroits();
  return (
    <section>
      <h1>Paramètres</h1>
      <ul className="liste">
        {ENTREES.filter((e) => droits[e.droit]).map((e) => (
          <li key={e.chemin}>
            <Link to={e.chemin} className="ligne-liste">
              <span className="ligne-titre">{e.titre}</span>
              <span className="ligne-detail">{e.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
