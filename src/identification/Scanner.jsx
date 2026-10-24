import { useEffect, useRef, useState } from 'react';
import { TECHNOLOGIES as LIBELLES_TECHNOLOGIES } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useLignes } from '../referentiels/useLignes.js';
import { demarrerCamera } from './camera.js';
import { demarrerNfc, nfcDisponible } from './nfc.js';
import { normaliser } from './normalisation.js';
import { signaler } from './retour.js';
import { useClavier } from './useClavier.js';

const URL_PUBLIQUE = import.meta.env.VITE_URL_PUBLIQUE || window.location.origin;
const ANTI_DOUBLON_MS = 2000;

function cleLecteur(organisationId) {
  return `suivi-linge.lecteur.${organisationId}`;
}

function lireLecteurMemorise(organisationId) {
  try {
    return localStorage.getItem(cleLecteur(organisationId));
  } catch {
    return null;
  }
}

// Type de lecteur déclaré correspondant à chaque source.
const TYPE_PAR_SOURCE = { clavier: 'clavier', saisie: 'clavier', camera: 'camera', nfc: 'nfc_web' };

// Composant de scan partagé par tous les écrans : caméra, NFC, douchette (clavier) et saisie.
// onLecture({ technologie, valeur, valeur_brute, lecteur_id, lu_le, source }) reçoit des
// lectures normalisées et débarrassées des doublons immédiats.
export default function Scanner({ onLecture, actif = true }) {
  const { organisation } = useOrganisation();
  const { lignes: lecteurs } = useLignes('lecteurs', { ordre: 'nom' });
  const [lecteurId, setLecteurId] = useState(() => lireLecteurMemorise(organisation.id));
  const [camera, setCamera] = useState(false);
  const [nfc, setNfc] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [alerte, setAlerte] = useState(null);
  const video = useRef(null);
  const derniers = useRef(new Map());
  const rappel = useRef(onLecture);
  rappel.current = onLecture;

  const lecteursActifs = lecteurs.filter((l) => l.actif);
  const lecteur = lecteursActifs.find((l) => l.id === lecteurId) ?? null;
  const fenetre = Number(organisation.reglages?.anti_doublon_ms) || ANTI_DOUBLON_MS;

  function recevoir(brute) {
    const profil = lecteur && lecteur.type === TYPE_PAR_SOURCE[brute.source] ? lecteur : null;
    const technologie = brute.technologie ?? profil?.technologie_defaut ?? null;
    const normalisee = normaliser({ technologie, valeur_brute: brute.valeur_brute }, { urlPublique: URL_PUBLIQUE });
    if (!normalisee) {
      signaler('erreur');
      setAlerte(`Lecture illisible : « ${String(brute.valeur_brute).slice(0, 40)} »`);
      return;
    }
    // Anti-doublon : même valeur, même lecteur, dans la fenêtre réglable de l'organisation.
    const cle = `${profil?.id ?? brute.source}|${normalisee.valeur}`;
    const maintenant = Date.now();
    if (maintenant - (derniers.current.get(cle) ?? 0) < fenetre) return;
    derniers.current.set(cle, maintenant);
    setAlerte(null);
    rappel.current({
      ...normalisee,
      valeur_brute: brute.valeur_brute,
      lecteur_id: profil?.id ?? null,
      lu_le: new Date(maintenant).toISOString(),
      source: brute.source,
    });
  }
  const recevoirRef = useRef(recevoir);
  recevoirRef.current = recevoir;

  useClavier((brute) => recevoirRef.current(brute), actif);

  useEffect(() => {
    if (!camera || !actif) return undefined;
    let arreter = null;
    let annule = false;
    demarrerCamera(video.current, (brute) => recevoirRef.current(brute))
      .then((stop) => (annule ? stop() : (arreter = stop)))
      .catch((e) => {
        setCamera(false);
        setAlerte(
          e?.name === 'NotAllowedError'
            ? 'Accès à la caméra refusé : autorisez-le dans les réglages du navigateur.'
            : 'Caméra indisponible sur cet appareil.',
        );
      });
    return () => {
      annule = true;
      arreter?.();
    };
  }, [camera, actif]);

  useEffect(() => {
    if (!nfc || !actif) return undefined;
    let arreter = null;
    let annule = false;
    demarrerNfc((brute) => recevoirRef.current(brute), setAlerte)
      .then((stop) => (annule ? stop() : (arreter = stop)))
      .catch((e) => {
        setNfc(false);
        setAlerte(e?.name === 'NotAllowedError' ? 'Accès au NFC refusé.' : 'NFC indisponible : activez-le dans les réglages du téléphone.');
      });
    return () => {
      annule = true;
      arreter?.();
    };
  }, [nfc, actif]);

  function choisirLecteur(id) {
    setLecteurId(id || null);
    try {
      if (id) localStorage.setItem(cleLecteur(organisation.id), id);
      else localStorage.removeItem(cleLecteur(organisation.id));
    } catch {
      // Stockage indisponible : le choix vaut pour la session.
    }
  }

  // Pas de <form> : le scanner peut être placé dans un formulaire (enrôlement).
  function validerSaisie() {
    if (!saisie.trim()) return;
    recevoir({ technologie: null, valeur_brute: saisie, source: 'saisie' });
    setSaisie('');
  }

  const profilClavier = lecteur?.type === 'clavier' ? lecteur : null;

  return (
    <div className="scanner">
      <div className="scanner-sources">
        <button
          type="button"
          className={`bouton bouton-source ${camera ? 'actif' : ''}`}
          aria-pressed={camera}
          onClick={() => setCamera((c) => !c)}
        >
          {camera ? 'Arrêter la caméra' : 'Caméra'}
        </button>
        {nfcDisponible && (
          <button
            type="button"
            className={`bouton bouton-source ${nfc ? 'actif' : ''}`}
            aria-pressed={nfc}
            onClick={() => setNfc((n) => !n)}
          >
            {nfc ? 'Arrêter le NFC' : 'NFC'}
          </button>
        )}
      </div>

      {camera && (
        <div className="scanner-video">
          <video ref={video} muted playsInline />
          <div className="scanner-viseur" aria-hidden="true" />
        </div>
      )}
      {nfc && <p className="scanner-etat">Approchez le tag NFC du dos du téléphone.</p>}

      <p className="scanner-etat">
        <span className="etiquette">Douchette</span>{' '}
        {profilClavier
          ? `prête — ${profilClavier.nom}${profilClavier.technologie_defaut ? ` (${LIBELLES_TECHNOLOGIES[profilClavier.technologie_defaut]})` : ''}`
          : 'prête — technologie déduite de la valeur'}
      </p>

      <div className="scanner-saisie">
        <input
          aria-label="Saisir un code"
          placeholder="Saisir un code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              validerSaisie();
            }
          }}
        />
        <button type="button" className="bouton" onClick={validerSaisie}>
          OK
        </button>
      </div>

      {alerte && <p className="message message-erreur">{alerte}</p>}

      {lecteursActifs.length > 0 && (
        <details className="scanner-lecteur">
          <summary>Lecteur de cet appareil : {lecteur ? lecteur.nom : 'non précisé'}</summary>
          <select aria-label="Lecteur de cet appareil" value={lecteurId ?? ''} onChange={(e) => choisirLecteur(e.target.value)}>
            <option value="">Non précisé</option>
            {lecteursActifs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </select>
        </details>
      )}
    </div>
  );
}
