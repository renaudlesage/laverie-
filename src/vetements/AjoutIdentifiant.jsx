import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { TECHNOLOGIES } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Scanner from '../identification/Scanner.jsx';
import { genererCode } from '../identification/codes.js';
import { enregistrerLectureBrute } from '../identification/lecturesBrutes.js';
import { normaliserCodeApp, normaliserHex } from '../identification/normalisation.js';
import { resoudre } from '../identification/resolution.js';
import { signaler } from '../identification/retour.js';

const TECHNOLOGIES_SAISIE = ['qr', 'code_barres', 'datamatrix', 'nfc'];

// Capture d'un nouvel identifiant : scan (caméra, douchette, NFC, saisie) ou QR généré.
// Un identifiant déjà porté par un vêtement est refusé avant tout envoi.
//   onAjout({ technologie, valeur, genere }) ; exclure : valeurs déjà retenues dans le formulaire
//   initial : { valeur, technologie? } venu d'un scan inconnu (déjà tracé dans lectures_brutes)
export default function AjoutIdentifiant({ onAjout, exclure = [], contexte, initial = null }) {
  const { organisation } = useOrganisation();
  const [scan, setScan] = useState(false);
  const [enAttente, setEnAttente] = useState(null); // lecture sans technologie : à préciser
  const [message, setMessage] = useState(null);
  const initialTraite = useRef(false);

  async function verifierPuisAjouter(identifiant, lecture) {
    if (exclure.some((e) => e.technologie === identifiant.technologie && e.valeur === identifiant.valeur)) {
      signaler('erreur');
      setMessage({ type: 'erreur', texte: `${identifiant.valeur} est déjà dans la liste.` });
      return;
    }
    const r = await resoudre(identifiant, { client: supabase, organisationId: organisation.id });
    if (lecture) {
      await enregistrerLectureBrute({
        organisationId: organisation.id,
        lecture: { ...lecture, technologie: identifiant.technologie },
        vetementId: r.vetementId,
        contexte: { ...contexte, source: lecture.source, resultat: r.statut },
      });
    }
    if (r.statut === 'erreur') {
      signaler('erreur');
      setMessage({ type: 'erreur', texte: 'Vérification impossible : vérifiez la connexion.' });
      return;
    }
    if (r.statut !== 'inconnu') {
      signaler('erreur');
      setMessage({ type: 'erreur', texte: `${identifiant.valeur} est déjà porté par un vêtement : retirez-le d’abord de ce vêtement.` });
      return;
    }
    signaler('trouve');
    setMessage(null);
    setScan(false);
    onAjout(identifiant);
  }

  useEffect(() => {
    if (!initial || initialTraite.current) return;
    initialTraite.current = true;
    if (initial.technologie) verifierPuisAjouter({ technologie: initial.technologie, valeur: initial.valeur });
    else setEnAttente({ valeur: initial.valeur, dejaTrace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function recevoir(lecture) {
    if (!lecture.technologie) {
      setEnAttente(lecture); // douchette sans profil : on demande la technologie
      setScan(false);
      return;
    }
    verifierPuisAjouter({ technologie: lecture.technologie, valeur: lecture.valeur }, lecture);
  }

  // Technologie précisée à la main : la valeur prend la forme canonique de ce support.
  function preciser(technologie, lecture) {
    setEnAttente(null);
    let valeur = lecture.valeur;
    if (technologie === 'qr') valeur = normaliserCodeApp(valeur) ?? valeur;
    if (technologie === 'nfc') valeur = normaliserHex(valeur);
    if (!valeur) {
      signaler('erreur');
      setMessage({ type: 'erreur', texte: `« ${lecture.valeur} » n’est pas un UID NFC (hexadécimal attendu).` });
      return;
    }
    // Valeur venue d'un scan inconnu : déjà tracée, pas de seconde lecture brute.
    verifierPuisAjouter({ technologie, valeur }, lecture.dejaTrace ? null : lecture);
  }

  function generer() {
    verifierPuisAjouter({ technologie: 'qr', valeur: genererCode(), genere: true });
  }

  return (
    <div className="ajout-identifiant">
      {enAttente ? (
        <div className="carte carte-alerte etat-info">
          <p>
            Quel type de support porte <span className="mono">{enAttente.valeur}</span> ?
          </p>
          <div className="rangee-actions">
            {TECHNOLOGIES_SAISIE.map((t) => (
              <button
                key={t}
                type="button"
                className="bouton"
                onClick={() => preciser(t, enAttente)}
              >
                {TECHNOLOGIES[t]}
              </button>
            ))}
            <button type="button" className="bouton bouton-discret" onClick={() => setEnAttente(null)}>
              Annuler
            </button>
          </div>
        </div>
      ) : scan ? (
        <>
          <Scanner onLecture={recevoir} />
          <button type="button" className="bouton" onClick={() => setScan(false)}>
            Fermer le scan
          </button>
        </>
      ) : (
        <div className="rangee-actions">
          <button type="button" className="bouton" onClick={() => setScan(true)}>
            Scanner un tag
          </button>
          <button type="button" className="bouton" onClick={generer}>
            Générer un QR
          </button>
        </div>
      )}
      {message && <p className={`message message-${message.type}`}>{message.texte}</p>}
    </div>
  );
}
