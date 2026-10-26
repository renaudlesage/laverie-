import { Link } from 'react-router-dom';
import { useDroits } from '../organisation/useDroits.js';
import Icone from '../composants/Icone.jsx';

const ENTREES = [
  { chemin: 'sites', icone: 'sites', titre: 'Sites', detail: 'Postes, magasins, laveries', droit: 'voitReferentiels' },
  { chemin: 'traitements', icone: 'traitements', titre: 'Traitements', detail: 'Lavage, séchage, nettoyage à sec, décontamination…', droit: 'voitReferentiels' },
  { chemin: 'articles', icone: 'articles', titre: 'Articles', detail: 'Catalogue, limites par traitement, notices', droit: 'voitReferentiels' },
  { chemin: 'porteurs', icone: 'porteurs', titre: 'Porteurs', detail: 'Pompiers, matricules, casiers, import CSV', droit: 'voitReferentiels' },
  { chemin: 'lecteurs', icone: 'lecteurs', titre: 'Lecteurs', detail: 'Douchettes, caméras, NFC', droit: 'voitReferentiels' },
  { chemin: 'sacs', icone: 'sacs', titre: 'Sacs de collecte', detail: 'Sacs standard et contaminés, leurs codes', droit: 'voitReferentiels' },
  { chemin: 'membres', icone: 'membres', titre: 'Membres', detail: 'Comptes, rôles, invitations', droit: 'estAdmin' },
  { chemin: 'organisation', icone: 'organisation', titre: 'Organisation', detail: 'Nom de la zone, règle d’activation des articles, anti-doublon', droit: 'estAdmin' },
];

export default function Parametres() {
  const droits = useDroits();
  return (
    <section>
      <h1>Paramètres</h1>
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
    </section>
  );
}
