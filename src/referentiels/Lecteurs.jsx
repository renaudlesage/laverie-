import EcranReferentiel from './EcranReferentiel.jsx';
import { MODES_LECTEUR, options, TECHNOLOGIES, TYPES_LECTEUR } from '../lib/libelles.js';
import { useDroits } from '../organisation/useDroits.js';
import { useLignes } from './useLignes.js';

export default function Lecteurs() {
  const { estAdmin } = useDroits();
  const { lignes: sites } = useLignes('sites', { ordre: 'nom' });
  const nomsSites = Object.fromEntries(sites.map((s) => [s.id, s.nom]));

  const champs = [
    { nom: 'nom', libelle: 'Nom', requis: true, aide: 'Ex. « Douchette comptoir laverie ».' },
    { nom: 'type', libelle: 'Type', type: 'selection', options: options(TYPES_LECTEUR), requis: true },
    {
      nom: 'technologie_defaut',
      libelle: 'Technologie lue',
      type: 'selection',
      options: options(TECHNOLOGIES),
      aide: 'Pour une douchette : ce qu’elle lit (code-barres, QR…). Vide si plusieurs.',
    },
    { nom: 'site_id', libelle: 'Site', type: 'selection', options: sites.map((s) => ({ valeur: s.id, libelle: s.nom })) },
    { nom: 'mode', libelle: 'Mode', type: 'selection', options: options(MODES_LECTEUR), requis: true },
    { nom: 'actif', libelle: 'Actif', type: 'case' },
  ];

  return (
    <EcranReferentiel
      titre="Lecteurs"
      table="lecteurs"
      ordre="nom"
      champs={champs}
      valeursInitiales={{ type: 'clavier', mode: 'unitaire', actif: true }}
      peutModifier={estAdmin}
      resume={(l) => ({
        titre: l.nom,
        detail: [TYPES_LECTEUR[l.type], nomsSites[l.site_id]].filter(Boolean).join(' · '),
      })}
    />
  );
}
