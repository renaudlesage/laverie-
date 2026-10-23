import { useNavigate } from 'react-router-dom';
import EcranReferentiel from './EcranReferentiel.jsx';
import { useDroits } from '../organisation/useDroits.js';

const champs = [
  { nom: 'designation', libelle: 'Désignation', requis: true },
  { nom: 'fabricant', libelle: 'Fabricant' },
  { nom: 'reference', libelle: 'Référence fabricant' },
  { nom: 'norme', libelle: 'Norme', aide: 'Ex. EN 469.' },
  { nom: 'duree_vie_mois', libelle: 'Durée de vie (mois)', type: 'nombre', min: 1 },
];

export default function Articles() {
  const { estAdmin } = useDroits();
  const navigate = useNavigate();
  return (
    <EcranReferentiel
      titre="Articles"
      table="articles"
      ordre="designation"
      champs={champs}
      peutModifier={estAdmin}
      ouvrir={(a) => navigate(`/parametres/articles/${a.id}`)}
      apresEnregistrement={(a, cree) => cree && navigate(`/parametres/articles/${a.id}`)}
      resume={(a) => ({
        titre: a.designation,
        detail: [a.fabricant, a.reference, a.actif ? 'Actif' : 'Inactif — limites et notice requises'].filter(Boolean).join(' · '),
      })}
    />
  );
}
