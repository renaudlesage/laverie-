import { Link } from 'react-router-dom';
import EcranReferentiel from './EcranReferentiel.jsx';
import { options, TECHNOLOGIES } from '../lib/libelles.js';
import { useDroits } from '../organisation/useDroits.js';
import { genererCode } from '../identification/codes.js';
import { normaliser, normaliserCodeApp } from '../identification/normalisation.js';
import { useLignes } from './useLignes.js';

const URL_PUBLIQUE = import.meta.env.VITE_URL_PUBLIQUE || window.location.origin;
const CIRCUITS = { standard: 'Standard', contamine: 'Contaminé (sac dédié, visuellement distinct)' };

// Sacs de collecte : contenants réutilisables, identifiés par un code comme un vêtement.
export default function Sacs() {
  const { enrole } = useDroits();
  const { lignes: sites } = useLignes('sites', { ordre: 'nom' });
  const { lignes: sacs } = useLignes('sacs', { ordre: 'nom' });
  const nomsSites = Object.fromEntries(sites.map((s) => [s.id, s.nom]));
  const qrImprimables = sacs.filter((s) => s.actif && s.technologie === 'qr' && normaliserCodeApp(s.code) === s.code).map((s) => s.code);

  const champs = [
    { nom: 'nom', libelle: 'Nom ou numéro', requis: true, aide: 'Ex. « Sac P1-03 ».' },
    { nom: 'circuit', libelle: 'Circuit', type: 'selection', options: options(CIRCUITS), requis: true },
    {
      nom: 'technologie',
      libelle: 'Type de code',
      type: 'selection',
      options: options(TECHNOLOGIES).filter((o) => o.valeur !== 'uhf'),
      aide: 'QR généré par l’app (à imprimer), ou code-barres / NFC déjà présent sur le sac.',
    },
    { nom: 'code', libelle: 'Code', aide: 'Proposé pour un QR neuf ; sinon scannez le code du sac dans ce champ (douchette).' },
    { nom: 'site_id', libelle: 'Poste de rattachement', type: 'selection', options: sites.map((s) => ({ valeur: s.id, libelle: s.nom })) },
    { nom: 'actif', libelle: 'Actif', type: 'case' },
  ];

  // Le code prend la forme canonique de sa technologie, comme un identifiant de vêtement.
  function avantEnregistrement(v) {
    if (!v.code && !v.technologie) return { valeurs: {} };
    if (!v.code || !v.technologie) return { erreur: 'Renseignez à la fois le type de code et le code, ou aucun des deux.' };
    const n = normaliser({ technologie: v.technologie, valeur_brute: v.code }, { urlPublique: URL_PUBLIQUE });
    if (!n) return { erreur: 'Code non reconnu pour ce type (un UID NFC est hexadécimal).' };
    return { valeurs: { code: n.technologie === 'qr' ? normaliserCodeApp(n.valeur) ?? n.valeur : n.valeur } };
  }

  return (
    <EcranReferentiel
      titre="Sacs de collecte"
      table="sacs"
      ordre="nom"
      champs={champs}
      valeursInitiales={{ circuit: 'standard', technologie: 'qr', code: genererCode(), actif: true }}
      peutModifier={enrole}
      avantEnregistrement={avantEnregistrement}
      avantListe={
        qrImprimables.length > 0 && (
          <p>
            <Link to={`/etiquettes?codes=${qrImprimables.join(',')}`} className="bouton">
              Imprimer les étiquettes QR des sacs ({qrImprimables.length})
            </Link>
          </p>
        )
      }
      resume={(s) => ({
        titre: s.nom,
        detail: [s.circuit === 'contamine' ? 'Circuit contaminé' : 'Standard', s.code && `${TECHNOLOGIES[s.technologie]} ${s.code}`, nomsSites[s.site_id]]
          .filter(Boolean)
          .join(' · '),
      })}
    />
  );
}
