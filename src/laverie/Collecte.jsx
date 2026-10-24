import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { messageErreur } from '../lib/erreurs.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { base } from '../hors-ligne/base.js';
import { lignesOrganisation, parNom, useLocal } from '../hors-ligne/local.js';
import Scanner from '../identification/Scanner.jsx';
import Rafale from '../identification/Rafale.jsx';
import { signaler } from '../identification/retour.js';
import { nouvelId } from '../identification/codes.js';
import { evenement, operation, operer } from '../journal/journal.js';
import CompteRendu from './Envoi.jsx';
import { codeVisible, envoyerPourLus, vetementsDuLot } from './donnees.js';
import { TOURNEE_EN_COURS, trouverSac } from './sacs.js';

// Collecte au poste : choisir le sac, ouvrir sa tournée, y mettre les vêtements, l'expédier.
export default function Collecte() {
  const { organisation } = useOrganisation();
  const [parametres, setParametres] = useSearchParams();
  const sacs = useLocal(async () => (await lignesOrganisation('sacs', organisation.id)).sort(parNom), [organisation.id], []);
  const sites = useLocal(async () => (await lignesOrganisation('sites', organisation.id)).sort(parNom), [organisation.id], []);
  const tournees = useLocal(
    () =>
      base.lots
        .where('[organisation_id+type]')
        .equals([organisation.id, 'sac_collecte'])
        .filter((l) => TOURNEE_EN_COURS.includes(l.statut))
        .toArray(),
    [organisation.id],
    [],
  );
  const [siteOuverture, setSiteOuverture] = useState('');
  const [destination, setDestination] = useState('');
  const [resultat, setResultat] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const sacId = parametres.get('sac');
  const sac = sacs.find((s) => s.id === sacId) ?? null;
  const tournee = tournees.find((t) => t.sac_id === sacId) ?? null;

  const contenu = useLocal(
    async () => (tournee?.statut === 'ouvert' ? vetementsDuLot(tournee.id, 'collecte') : []),
    [tournee?.id, tournee?.statut],
    [],
  );

  useEffect(() => {
    if (sac) setSiteOuverture(sac.site_id ?? '');
  }, [sac?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function choisir(id) {
    setResultat(null);
    setParametres(id ? { sac: id } : {});
  }

  function scannerSac(lecture) {
    const trouve = trouverSac(sacs, lecture);
    signaler(trouve ? 'trouve' : 'inconnu');
    if (trouve) choisir(trouve.id);
    else setResultat({ texte: `Aucun sac ne porte le code ${lecture.valeur}.`, rejets: [] });
  }

  async function executer(action) {
    setEnvoi(true);
    try {
      setResultat(await action());
    } catch (e) {
      setResultat({ texte: messageErreur(e), rejets: [] });
    } finally {
      setEnvoi(false);
    }
  }

  const ouvrir = () =>
    executer(async () => {
      const [r] = await operer(organisation.id, [operation('ouvrir_sac', nouvelId(), { sac_id: sac.id, site_id: siteOuverture || null })]);
      return r.statut === 'rejete' ? { texte: r.motif, rejets: [] } : { texte: 'Tournée ouverte : scannez les vêtements à mettre dans le sac.' };
    });

  async function mettreDansLeSac({ lus }) {
    const b = await envoyerPourLus(organisation.id, lus, (l) =>
      evenement('collecte', l.vetementId, { lotId: tournee.id, lecteurId: l.lecture.lecteur_id }),
    );
    setResultat(b);
    return b.refuses;
  }

  const expedier = () =>
    executer(async () => {
      const [r] = await operer(organisation.id, [operation('expedier_sac', tournee.id, { site_destination_id: destination })]);
      return r.statut === 'rejete' ? { texte: r.motif, rejets: [] } : { texte: `Sac expédié avec ${contenu.length} vêtement(s).` };
    });

  if (!sac) {
    const actifs = sacs.filter((s) => s.actif);
    return (
      <section className="pile">
        <p>
          <Link to="/laverie">← Laverie</Link>
        </p>
        <h1>Collecte</h1>
        <p className="texte-secondaire">Scannez le sac, ou choisissez-le.</p>
        <Scanner onLecture={scannerSac} />
        <CompteRendu resultat={resultat} />
        <ul className="liste">
          {actifs.map((s) => {
            const t = tournees.find((x) => x.sac_id === s.id);
            return (
              <li key={s.id}>
                <button type="button" className={`ligne-liste ${s.circuit === 'contamine' ? 'ligne-contaminee' : ''}`} onClick={() => choisir(s.id)}>
                  <span className="ligne-titre">
                    {s.nom}
                    {s.circuit === 'contamine' && <span className="jeton-etat etat-chaud">Contaminé</span>}
                  </span>
                  <span className="ligne-detail">{t ? (t.statut === 'ouvert' ? 'Tournée ouverte' : 'Expédié, en route') : 'Disponible'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {actifs.length === 0 && (
          <p className="message">
            Aucun sac déclaré. <Link to="/parametres/sacs">Paramètres → Sacs</Link>
          </p>
        )}
      </section>
    );
  }

  const postes = sites.filter((s) => s.actif && ['poste', 'magasin'].includes(s.type));
  const laveries = sites.filter((s) => s.actif && ['laverie_interne', 'laverie_externe'].includes(s.type));

  return (
    <section className="pile">
      <p>
        <button type="button" className="bouton bouton-discret" onClick={() => choisir(null)}>
          ← Autre sac
        </button>
      </p>
      <div className={`carte ${sac.circuit === 'contamine' ? 'carte-alerte etat-chaud' : ''}`}>
        <p className="etiquette">Sac de collecte</p>
        <h1>{sac.nom}</h1>
        <p className="statut-ligne">
          <span className={`jeton-etat etat-${sac.circuit === 'contamine' ? 'chaud' : 'info'}`}>
            {sac.circuit === 'contamine' ? 'Circuit contaminé' : 'Circuit standard'}
          </span>
          {tournee && <span className="jeton-etat etat-veille">{tournee.statut === 'ouvert' ? 'Tournée ouverte' : 'Expédié'}</span>}
        </p>
      </div>

      <CompteRendu resultat={resultat} />

      {!tournee && (
        <div className="carte formulaire">
          <label>
            <span>Poste</span>
            <select value={siteOuverture} onChange={(e) => setSiteOuverture(e.target.value)}>
              <option value="">—</option>
              {postes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="bouton bouton-principal bouton-large" disabled={envoi} onClick={ouvrir}>
            Ouvrir une tournée
          </button>
        </div>
      )}

      {tournee?.statut === 'expedie' && (
        <p className="message">
          Ce sac est en route vers {sites.find((s) => s.id === tournee.site_destination_id)?.nom ?? 'la laverie'} ({tournee.quantite_attendue} vêtement(s)).
        </p>
      )}

      {tournee?.statut === 'ouvert' && (
        <>
          <Rafale contexte={{ ecran: 'collecte' }} onValider={mettreDansLeSac} libelleValider="Mettre dans le sac" />
          <div className="carte">
            <h2>Dans le sac ({contenu.length})</h2>
            <ul className="liste">
              {contenu.map((v) => (
                <li key={v.id} className="ligne-liste ligne-statique">
                  <span className="ligne-titre">{v.article?.designation}</span>
                  <span className="ligne-detail mono">{codeVisible(v)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="carte formulaire">
            <label>
              <span>Laverie de destination</span>
              <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                <option value="">Choisir…</option>
                {laveries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="bouton bouton-principal bouton-large" disabled={!destination || envoi || contenu.length === 0} onClick={expedier}>
              Fermer et expédier le sac ({contenu.length})
            </button>
          </div>
        </>
      )}
    </section>
  );
}
