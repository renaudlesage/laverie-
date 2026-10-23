import EcranReferentiel from './EcranReferentiel.jsx';
import { CIRCUITS_TRAITEMENT, options } from '../lib/libelles.js';
import { useDroits } from '../organisation/useDroits.js';

const champs = [
  {
    nom: 'code',
    libelle: 'Code',
    requis: true,
    creationSeulement: true,
    motif: '[a-z][a-z0-9_]*',
    aide: 'Minuscules, chiffres et _ ; ne change plus après création (ex. lavage_haute_temperature).',
  },
  { nom: 'libelle', libelle: 'Libellé', requis: true },
  {
    nom: 'circuit',
    libelle: 'Circuit',
    type: 'selection',
    options: options(CIRCUITS_TRAITEMENT),
    requis: true,
    aide: 'Un lot contaminé n’accepte que les traitements « Contaminé » ou « Les deux circuits », et inversement.',
  },
  { nom: 'actif', libelle: 'Actif', type: 'case' },
];

export default function Traitements() {
  const { estAdmin } = useDroits();
  return (
    <EcranReferentiel
      titre="Traitements"
      table="traitements"
      ordre="cree_le"
      champs={champs}
      valeursInitiales={{ circuit: 'standard', actif: true }}
      peutModifier={estAdmin}
      resume={(t) => ({ titre: t.libelle, detail: `${t.code} · ${CIRCUITS_TRAITEMENT[t.circuit]}` })}
    />
  );
}
