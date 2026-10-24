import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useLignes } from '../referentiels/useLignes.js';
import Scanner from '../identification/Scanner.jsx';
import Rafale from '../identification/Rafale.jsx';
import { signaler } from '../identification/retour.js';
import { evenement, operation, operer } from '../journal/journal.js';
import CompteRendu from './Envoi.jsx';
import { codeVisible, envoyerPourLus, vetementsDuLot } from './donnees.js';
import { trouverSac } from './sacs.js';
import { ChoixSiteTravail, useSiteTravail } from './SiteTravail.jsx';

// Réception d'un sac : rapprochement attendus / lus, écarts signalés à la clôture de la réception.
export default function Reception() {
  const { organisation } = useOrganisation();
  const travail = useSiteTravail();
  const { lignes: sacs } = useLignes('sacs', { ordre: 'nom' });
  const [expedies, setExpedies] = useState([]);
  const [tournee, setTournee] = useState(null);
  const [attendus, setAttendus] = useState([]);
  const [resultat, setResultat] = useState(null);

  const charger = useCallback(async () => {
    if (!travail.siteId) return;
    const { data } = await supabase
      .from('lots')
      .select('*, sac:sacs(nom, circuit)')
      .eq('organisation_id', organisation.id)
      .eq('type', 'sac_collecte')
      .eq('statut', 'expedie')
      .eq('site_destination_id', travail.siteId)
      .order('ouvert_le');
    setExpedies(data ?? []);
  }, [organisation.id, travail.siteId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function choisir(t) {
    setResultat(null);
    setTournee(t);
    setAttendus(t ? await vetementsDuLot(t.id, 'collecte') : []);
  }

  function scannerSac(lecture) {
    const sac = trouverSac(sacs, lecture);
    const t = sac && expedies.find((x) => x.sac_id === sac.id);
    signaler(t ? 'trouve' : 'inconnu');
    if (t) choisir(t);
    else setResultat({ texte: sac ? `Le sac « ${sac.nom} » n’est pas attendu ici.` : `Aucun sac ne porte le code ${lecture.valeur}.`, rejets: [] });
  }

  async function receptionner({ lus, inconnus }) {
    try {
      const idsAttendus = new Set(attendus.map((v) => v.id));
      const b = await envoyerPourLus(organisation.id, lus, (l) =>
        evenement('reception', l.vetementId, { siteId: travail.siteId, lecteurId: l.lecture.lecteur_id }),
      );
      const enTrop = b.acceptes_ids.filter((id) => !idsAttendus.has(id)).length;
      const [r] = await operer(organisation.id, [
        operation('receptionner_sac', tournee.id, { en_trop: enTrop, inconnus: inconnus.length }),
      ]);
      const recus = new Set(b.acceptes_ids);
      const manquants = attendus.filter((v) => !recus.has(v.id));
      setResultat({
        ...b,
        texte:
          r.statut === 'rejete'
            ? r.motif
            : `Sac réceptionné. ${manquants.length ? `${manquants.length} manquant(s) signalé(s) : ${manquants.map(codeVisible).join(', ')}.` : 'Aucun manquant.'}${enTrop ? ` ${enTrop} en trop.` : ''}${inconnus.length ? ` ${inconnus.length} code(s) inconnu(s).` : ''}`,
      });
      setTournee(null);
      await charger();
      return b.refuses;
    } catch (e) {
      setResultat({ texte: messageErreur(e), rejets: [] });
      return false;
    }
  }

  return (
    <section className="pile">
      <p>
        <Link to="/laverie">← Laverie</Link>
      </p>
      <h1>Réception</h1>
      <ChoixSiteTravail travail={travail} />
      <CompteRendu resultat={resultat} />

      {!travail.siteId ? (
        <p className="message">Choisissez la laverie où vous travaillez.</p>
      ) : !tournee ? (
        <>
          <p className="texte-secondaire">Scannez le sac reçu, ou choisissez-le.</p>
          <Scanner onLecture={scannerSac} />
          <ul className="liste">
            {expedies.map((t) => (
              <li key={t.id}>
                <button type="button" className={`ligne-liste ${t.sac?.circuit === 'contamine' ? 'ligne-contaminee' : ''}`} onClick={() => choisir(t)}>
                  <span className="ligne-titre">
                    {t.sac?.nom}
                    {t.sac?.circuit === 'contamine' && <span className="jeton-etat etat-chaud">Contaminé</span>}
                  </span>
                  <span className="ligne-detail">{t.quantite_attendue} vêtement(s) attendu(s)</span>
                </button>
              </li>
            ))}
          </ul>
          {expedies.length === 0 && <p className="texte-secondaire">Aucun sac en route vers cette laverie.</p>}
        </>
      ) : (
        <>
          <div className={`carte ${tournee.sac?.circuit === 'contamine' ? 'carte-alerte etat-chaud' : ''}`}>
            <p className="etiquette">Sac reçu</p>
            <h2>{tournee.sac?.nom}</h2>
            <p className="texte-secondaire">Scannez chaque vêtement sorti du sac. Les manquants seront signalés à la validation.</p>
          </div>
          <Rafale attendus={attendus.map((v) => v.id)} contexte={{ ecran: 'reception' }} onValider={receptionner} libelleValider="Valider la réception" />
          <button type="button" className="bouton" onClick={() => choisir(null)}>
            Autre sac
          </button>
        </>
      )}
    </section>
  );
}
