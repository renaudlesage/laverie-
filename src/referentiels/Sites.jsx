import EcranReferentiel from './EcranReferentiel.jsx';
import { options, TYPES_SITE } from '../lib/libelles.js';
import { useDroits } from '../organisation/useDroits.js';

const champs = [
  { nom: 'nom', libelle: 'Nom', requis: true },
  { nom: 'type', libelle: 'Type', type: 'selection', options: options(TYPES_SITE), requis: true },
  { nom: 'adresse', libelle: 'Adresse', type: 'zone' },
  { nom: 'actif', libelle: 'Actif', type: 'case' },
];

export default function Sites() {
  const { estAdmin } = useDroits();
  return (
    <EcranReferentiel
      titre="Sites"
      table="sites"
      ordre="nom"
      champs={champs}
      valeursInitiales={{ actif: true }}
      peutModifier={estAdmin}
      resume={(s) => ({ titre: s.nom, detail: TYPES_SITE[s.type] })}
    />
  );
}
