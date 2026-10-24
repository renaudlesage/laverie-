import { useState } from 'react';
import { Link } from 'react-router-dom';
import { messageErreur } from '../lib/erreurs.js';
import { ecrireCsv } from '../lib/csv.js';
import { STATUTS_VETEMENT, TYPES_SITE } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import Rafale from '../identification/Rafale.jsx';
import { bilan, emettre, evenement } from '../journal/journal.js';
import { base } from '../hors-ligne/base.js';
import { enrichir, lignesOrganisation, parNom, useLocal } from '../hors-ligne/local.js';
import { telecharger } from '../vetements/ficheVie.js';
import CompteRendu from '../laverie/Envoi.jsx';
import { codeVisible } from '../laverie/donnees.js';
import { ecartsInventaire } from './ecarts.js';

// Sur un site, un vêtement est attendu s'il y est rattaché et n'est ni en route (collecté),
// ni sorti du parc (réformé, perdu).
const HORS_INVENTAIRE = ['collecte', 'reforme', 'perdu'];

export async function attendusSurSite(organisationId, siteId) {
  const liste = await base.vetements.where('organisation_id').equals(organisationId).filter((v) => v.site_id === siteId && !HORS_INVENTAIRE.includes(v.statut)).toArray();
  return enrichir(liste);
}

// Inventaire d'un site : scan en rafale, puis écarts entre attendus et présents.
// Fonctionne hors ligne (index local) ; chaque vêtement lu reçoit un événement « vu en inventaire ».
export default function Inventaire() {
  const { organisation } = useOrganisation();
  const { enrole } = useDroits();
  const sites = useLocal(async () => (await lignesOrganisation('sites', organisation.id)).filter((s) => s.actif).sort(parNom), [organisation.id], []);
  const [siteId, setSiteId] = useState('');
  const [rapport, setRapport] = useState(null); // { site, quand, presents, enPlus, manquants, perdusRetrouves }
  const [resultat, setResultat] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const attendus = useLocal(async () => (siteId ? attendusSurSite(organisation.id, siteId) : []), [organisation.id, siteId], []);
  const site = sites.find((s) => s.id === siteId);

  async function valider({ lus }) {
    try {
      const reponses = await emettre(
        organisation.id,
        lus.map((l) => evenement('vu_en_inventaire', l.vetementId, { siteId, lecteurId: l.lecture?.lecteur_id })),
      );
      const b = bilan(reponses);
      const ecarts = ecartsInventaire(attendus, lus);
      setRapport({
        site,
        quand: new Date(),
        ...ecarts,
        perdusRetrouves: ecarts.enPlus.filter((l) => l.vetement?.statut === 'perdu'),
      });
      setResultat({ ...b, texte: `Inventaire de ${site.nom} enregistré.` });
      return lus.filter((_, i) => reponses[i]?.statut === 'rejete').map((l) => l.vetementId);
    } catch (e) {
      setResultat({ texte: messageErreur(e), rejets: [] });
      return false;
    }
  }

  async function agirSurTous(type, vetementIds, donnees) {
    setEnvoi(true);
    try {
      const b = bilan(
        await emettre(
          organisation.id,
          vetementIds.map((id) => evenement(type, id, { siteId: type === 'retrouve' ? siteId : null, donnees })),
        ),
      );
      setResultat({ ...b, texte: type === 'perte' ? 'Manquants déclarés perdus.' : 'Vêtements retrouvés remis en stock.' });
      setRapport((r) => ({
        ...r,
        ...(type === 'perte' ? { manquantsTraites: true } : { perdusRetrouves: [] }),
      }));
    } catch (e) {
      setResultat({ texte: messageErreur(e), rejets: [] });
    } finally {
      setEnvoi(false);
    }
  }

  function exporter() {
    const lignes = [
      ...rapport.presents.map((v) => ['Présent', codeVisible(v), v.article?.designation, v.taille, STATUTS_VETEMENT[v.statut]]),
      ...rapport.enPlus.map((l) => ['En plus', l.lecture?.valeur, l.vetement?.article?.designation, l.vetement?.taille, STATUTS_VETEMENT[l.vetement?.statut]]),
      ...rapport.manquants.map((v) => ['Manquant', codeVisible(v), v.article?.designation, v.taille, STATUTS_VETEMENT[v.statut]]),
    ];
    const jour = rapport.quand.toISOString().slice(0, 10);
    telecharger(`inventaire-${rapport.site.nom.replace(/[^\w-]+/g, '_')}-${jour}.csv`, ecrireCsv(['Résultat', 'Code', 'Article', 'Taille', 'Statut'], lignes));
  }

  if (rapport) {
    const motif = `Inventaire du ${rapport.quand.toLocaleDateString('fr-BE')} — ${rapport.site.nom}`;
    return (
      <section className="pile">
        <h1>Inventaire — {rapport.site.nom}</h1>
        <CompteRendu resultat={resultat} />
        <ul className="tuiles">
          <li className="etat-ok">
            <span className="etiquette">Présents</span>
            <strong>{rapport.presents.length}</strong>
          </li>
          <li className={rapport.enPlus.length ? 'etat-veille' : ''}>
            <span className="etiquette">En plus</span>
            <strong>{rapport.enPlus.length}</strong>
          </li>
          <li className={rapport.manquants.length ? 'etat-chaud' : ''}>
            <span className="etiquette">Manquants</span>
            <strong>{rapport.manquants.length}</strong>
          </li>
        </ul>

        {rapport.manquants.length > 0 && (
          <div className="carte">
            <h2>Manquants ({rapport.manquants.length})</h2>
            <ul className="liste">
              {rapport.manquants.map((v) => (
                <li key={v.id}>
                  <Link to={`/vetements/${v.id}`} className="ligne-liste">
                    <span className="ligne-titre">
                      {v.article?.designation} <span className="mono">{codeVisible(v)}</span>
                    </span>
                    <span className="ligne-detail">{STATUTS_VETEMENT[v.statut]}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {enrole && !rapport.manquantsTraites && (
              <button
                type="button"
                className="bouton bouton-danger"
                disabled={envoi}
                onClick={() => agirSurTous('perte', rapport.manquants.map((v) => v.id), { motif })}
              >
                Déclarer les {rapport.manquants.length} manquant(s) perdus
              </button>
            )}
            <p className="aide">Un vêtement déclaré perdu par erreur se remet en stock avec « Retrouvé ».</p>
          </div>
        )}

        {rapport.enPlus.length > 0 && (
          <div className="carte">
            <h2>Trouvés en plus ({rapport.enPlus.length})</h2>
            <p className="texte-secondaire">Rattachés à un autre site ou perdus : ils sont maintenant enregistrés sur {rapport.site.nom}.</p>
            <ul className="liste">
              {rapport.enPlus.map((l) => (
                <li key={l.vetementId}>
                  <Link to={`/vetements/${l.vetementId}`} className="ligne-liste">
                    <span className="ligne-titre">
                      {l.vetement?.article?.designation} <span className="mono">{l.lecture?.valeur}</span>
                    </span>
                    <span className="ligne-detail">{STATUTS_VETEMENT[l.vetement?.statut]}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {enrole && rapport.perdusRetrouves.length > 0 && (
              <button type="button" className="bouton" disabled={envoi} onClick={() => agirSurTous('retrouve', rapport.perdusRetrouves.map((l) => l.vetementId))}>
                Remettre en stock les {rapport.perdusRetrouves.length} perdu(s) retrouvé(s)
              </button>
            )}
          </div>
        )}

        <div className="rangee-actions">
          <button type="button" className="bouton" onClick={exporter}>
            Exporter le rapport (CSV)
          </button>
          <button
            type="button"
            className="bouton bouton-principal"
            onClick={() => {
              setRapport(null);
              setResultat(null);
            }}
          >
            Nouvel inventaire
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="pile">
      <h1>Inventaire</h1>
      <label className="choix-site">
        <span className="etiquette">Site inventorié</span>
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">Choisir…</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom} ({TYPES_SITE[s.type] ?? s.type})
            </option>
          ))}
        </select>
      </label>
      <CompteRendu resultat={resultat} />
      {siteId ? (
        <>
          <p className="texte-secondaire">
            {attendus.length} vêtement(s) attendu(s) sur ce site (en route et sortis du parc exclus). Scannez tout ce qui s’y trouve,
            casiers compris, puis validez.
          </p>
          <Rafale key={siteId} attendus={attendus.map((v) => v.id)} contexte={{ ecran: 'inventaire', site_id: siteId }} onValider={valider} libelleValider="Valider l’inventaire" />
        </>
      ) : (
        <p className="message">Choisissez le site à inventorier.</p>
      )}
    </section>
  );
}
