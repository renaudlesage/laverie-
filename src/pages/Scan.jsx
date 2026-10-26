import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Rafale from '../identification/Rafale.jsx';
import ResultatInconnu from '../identification/ResultatInconnu.jsx';
import Scanner from '../identification/Scanner.jsx';
import { traiterLecture } from '../identification/traiterLecture.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Icone from '../composants/Icone.jsx';

const CLE_MODE = 'suivi-linge.mode-scan';

function lireMode() {
  try {
    return localStorage.getItem(CLE_MODE) === 'rafale' ? 'rafale' : 'unitaire';
  } catch {
    return 'unitaire';
  }
}

export default function Scan() {
  const { organisation } = useOrganisation();
  const navigate = useNavigate();
  const [mode, setMode] = useState(lireMode);
  const [resultat, setResultat] = useState(null); // { resultat, lecture }
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  function changerMode(m) {
    setMode(m);
    setResultat(null);
    try {
      localStorage.setItem(CLE_MODE, m);
    } catch {
      // Préférence non mémorisée.
    }
  }

  // Mode unitaire : un scan ouvre la fiche.
  async function recevoir(lecture) {
    setEnCours(true);
    setErreur(null);
    const r = await traiterLecture(lecture, { organisationId: organisation.id, contexte: { mode: 'unitaire', ecran: 'scan' } });
    setEnCours(false);
    if (r.statut === 'trouve') navigate(`/vetements/${r.vetementId}`);
    else if (r.statut === 'erreur') setErreur('Résolution impossible : vérifiez la connexion.');
    else setResultat({ resultat: r, lecture });
  }

  return (
    <section className="pile">
      <div className="entete-section">
        <h1>Scanner</h1>
      </div>
      <div className="onglets" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'unitaire'} className={mode === 'unitaire' ? 'actif' : ''} onClick={() => changerMode('unitaire')}>
          <Icone nom="unitaire" />
          Unitaire
        </button>
        <button type="button" role="tab" aria-selected={mode === 'rafale'} className={mode === 'rafale' ? 'actif' : ''} onClick={() => changerMode('rafale')}>
          <Icone nom="rafale" />
          Rafale
        </button>
      </div>

      {mode === 'unitaire' ? (
        <>
          <p className="texte-secondaire">Un scan ouvre la fiche du vêtement.</p>
          {resultat ? (
            <ResultatInconnu resultat={resultat.resultat} lecture={resultat.lecture} onFermer={() => setResultat(null)} />
          ) : (
            <Scanner onLecture={recevoir} actif={!enCours} />
          )}
          {enCours && <p className="texte-secondaire">Recherche…</p>}
          {erreur && <p className="message message-erreur">{erreur}</p>}
        </>
      ) : (
        <>
          <p className="texte-secondaire">Scannez une série : chaque vêtement n'est compté qu'une fois.</p>
          <Rafale contexte={{ ecran: 'scan' }} />
        </>
      )}
    </section>
  );
}
