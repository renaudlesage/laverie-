import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import ResultatInconnu from '../identification/ResultatInconnu.jsx';
import { normaliserCodeApp } from '../identification/normalisation.js';
import { traiterLecture } from '../identification/traiterLecture.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';

// QR ouvert par l'appareil photo du téléphone : ${VITE_URL_PUBLIQUE}/v/<code>.
// La route est protégée (session et organisation) : rien ne s'affiche sans autorisation.
export default function VetementParCode() {
  const { code } = useParams();
  const { organisation } = useOrganisation();
  const [etat, setEtat] = useState(null);
  const traite = useRef(false);

  useEffect(() => {
    if (traite.current) return; // StrictMode : une seule lecture tracée
    traite.current = true;
    const valeur = normaliserCodeApp(code) ?? code;
    const lecture = { technologie: 'qr', valeur, valeur_brute: code, lecteur_id: null, lu_le: new Date().toISOString(), source: 'url' };
    traiterLecture(lecture, { organisationId: organisation.id, contexte: { mode: 'unitaire', ecran: 'lien_qr' } }).then((resultat) =>
      setEtat({ resultat, lecture }),
    );
  }, [code, organisation.id]);

  if (!etat) return <section className="carte">Recherche du vêtement…</section>;
  if (etat.resultat.statut === 'trouve') return <Navigate to={`/vetements/${etat.resultat.vetementId}`} replace />;
  if (etat.resultat.statut === 'erreur') {
    return (
      <section className="carte">
        <p className="message message-erreur">Recherche impossible : vérifiez la connexion et rouvrez le lien.</p>
      </section>
    );
  }
  return <ResultatInconnu resultat={etat.resultat} lecture={etat.lecture} onFermer={() => window.history.back()} />;
}
