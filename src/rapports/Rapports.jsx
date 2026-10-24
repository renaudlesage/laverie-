import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { ecrireCsv } from '../lib/csv.js';
import { STATUTS_VETEMENT } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useLignes } from '../referentiels/useLignes.js';
import { useEnLigne } from '../connexion/useConnexion.js';
import { telecharger } from '../vetements/ficheVie.js';
import { regrouperFinDeVie, totauxParTraitement } from './calculs.js';

const jour = (d) => d.toISOString().slice(0, 10);
const debutAnnee = () => `${new Date().getFullYear()}-01-01`;
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-BE') : '');
const TYPES_LAVERIE = ['laverie_interne', 'laverie_externe'];

function Periode({ debut, fin, onChange }) {
  return (
    <div className="grille-champs">
      <label>
        <span>Du</span>
        <input type="date" value={debut} max={fin} onChange={(e) => onChange({ debut: e.target.value, fin })} />
      </label>
      <label>
        <span>Au</span>
        <input type="date" value={fin} min={debut} onChange={(e) => onChange({ debut, fin: e.target.value })} />
      </label>
    </div>
  );
}

function Tableau({ colonnes, lignes, vide = 'Aucune donnée.' }) {
  if (!lignes.length) return <p className="texte-secondaire">{vide}</p>;
  return (
    <div className="tableau-defilant">
      <table className="tableau-rapport">
        <thead>
          <tr>
            {colonnes.map(([, titre, num]) => (
              <th key={titre} className={num ? 'nombre' : ''}>
                {titre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i}>
              {colonnes.map(([cle, titre, num]) => (
                <td key={titre} className={num ? 'nombre mono' : ''}>
                  {typeof cle === 'function' ? cle(l) : l[cle] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const exporterCsv = (nom, colonnes, lignes) =>
  telecharger(
    nom,
    ecrireCsv(
      colonnes.map(([, titre]) => titre),
      lignes.map((l) => colonnes.map(([cle]) => (typeof cle === 'function' ? cle(l, true) : l[cle]))),
    ),
  );

function Passages() {
  const { organisation } = useOrganisation();
  const [periode, setPeriode] = useState({ debut: debutAnnee(), fin: jour(new Date()) });
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    supabase.rpc('rapport_passages', { org: organisation.id, ...periode }).then(({ data, error }) => {
      setErreur(error);
      setDonnees(data);
    });
  }, [organisation.id, periode]);

  const colsParc = [['article', 'Article'], ['traitement', 'Traitement'], ['vetements', 'Vêtements', 1], ['passages', 'Passages', 1], ['moyenne', 'Moyenne', 1], ['maximum', 'Maximum', 1], ['limite', 'Limite', 1]];
  const colsPeriode = [['article', 'Article'], ['traitement', 'Traitement'], ['vetements', 'Vêtements', 1], ['passages', 'Passages', 1]];

  return (
    <>
      <div className="carte">
        <div className="entete-section">
          <h2>Passages de la période</h2>
          {donnees?.periode?.length > 0 && (
            <button type="button" className="bouton bouton-discret sans-impression" onClick={() => exporterCsv(`passages-${periode.debut}-${periode.fin}.csv`, colsPeriode, donnees.periode)}>
              CSV
            </button>
          )}
        </div>
        <div className="sans-impression">
          <Periode {...periode} onChange={setPeriode} />
        </div>
        <p className="texte-secondaire">
          Du {dateFr(periode.debut)} au {dateFr(periode.fin)} : passages comptés à la clôture des lots.
          {donnees && ` Total : ${donnees.periode.reduce((a, l) => a + l.passages, 0)}.`}
        </p>
        {erreur && <p className="message message-erreur">{messageErreur(erreur)}</p>}
        {donnees && <Tableau colonnes={colsPeriode} lignes={donnees.periode} vide="Aucun passage sur la période." />}
      </div>
      <div className="carte">
        <div className="entete-section">
          <h2>État du parc</h2>
          {donnees?.parc?.length > 0 && (
            <button type="button" className="bouton bouton-discret sans-impression" onClick={() => exporterCsv(`parc-${jour(new Date())}.csv`, colsParc, donnees.parc)}>
              CSV
            </button>
          )}
        </div>
        <p className="texte-secondaire">Compteurs actuels des vêtements en circulation (réformés et perdus exclus).</p>
        {donnees && <Tableau colonnes={colsParc} lignes={donnees.parc} />}
      </div>
    </>
  );
}

function FinDeVie() {
  const { organisation } = useOrganisation();
  const [horizon, setHorizon] = useState(6);
  const [seuil, setSeuil] = useState(80);
  const [lignes, setLignes] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    supabase.rpc('rapport_fin_de_vie', { org: organisation.id, horizon_mois: horizon, seuil_pct: seuil }).then(({ data, error }) => {
      setErreur(error);
      setLignes(data ?? []);
    });
  }, [organisation.id, horizon, seuil]);

  const colsDetail = [
    [(l) => (l.code || l.numero_serie || '—'), 'Code'],
    ['article', 'Article'],
    ['taille', 'Taille'],
    [(l) => STATUTS_VETEMENT[l.statut], 'Statut'],
    ['site', 'Site'],
    ['porteur', 'Porteur'],
    [(l) => (l.usure_pct != null ? `${l.usure_pct} %` : '—'), 'Usure', 1],
    ['traitement', 'Traitement le plus usé'],
    [(l) => dateFr(l.fin_age), 'Fin de vie (âge)', 1],
  ];
  const colsSynthese = [['article', 'Article'], ['taille', 'Taille'], ['nombre', 'À renouveler', 1]];
  const synthese = lignes ? regrouperFinDeVie(lignes) : [];

  return (
    <>
      <div className="carte">
        <h2>À renouveler</h2>
        <div className="grille-champs sans-impression">
          <label>
            <span>Usure à partir de (%)</span>
            <input type="number" min="1" max="200" value={seuil} onChange={(e) => setSeuil(Number(e.target.value) || 80)} />
          </label>
          <label>
            <span>Fin de vie (âge) dans les (mois)</span>
            <input type="number" min="0" max="60" value={horizon} onChange={(e) => setHorizon(Number(e.target.value) || 0)} />
          </label>
        </div>
        <p className="texte-secondaire">
          Vêtements dont l’usure (passages / limite) atteint {seuil} %, ou dont la durée de vie se termine dans les {horizon} mois.
          Pour préparer les commandes de remplacement.
        </p>
        {erreur && <p className="message message-erreur">{messageErreur(erreur)}</p>}
        {lignes && <Tableau colonnes={colsSynthese} lignes={synthese} vide="Rien à renouveler." />}
      </div>
      {lignes?.length > 0 && (
        <div className="carte">
          <div className="entete-section">
            <h2>Détail ({lignes.length})</h2>
            <button type="button" className="bouton bouton-discret sans-impression" onClick={() => exporterCsv(`fin-de-vie-${jour(new Date())}.csv`, colsDetail, lignes)}>
              CSV
            </button>
          </div>
          <Tableau
            colonnes={[[(l, brut) => (brut ? l.code || l.numero_serie : <Link to={`/vetements/${l.vetement_id}`}>{l.code || l.numero_serie || '—'}</Link>), 'Code'], ...colsDetail.slice(1)]}
            lignes={lignes}
          />
        </div>
      )}
    </>
  );
}

function ActiviteLaverie() {
  const { organisation, adhesion } = useOrganisation();
  const { lignes: sites } = useLignes('sites', { ordre: 'nom' });
  const laveries = sites.filter((s) => TYPES_LAVERIE.includes(s.type));
  const impose = adhesion?.role === 'laverie_externe' ? adhesion.site_id : null;
  const [choisi, setChoisi] = useState('');
  const siteId = impose ?? (choisi || laveries.find((s) => s.type === 'laverie_externe')?.id || laveries[0]?.id || '');
  const aujourdhui = new Date();
  const [periode, setPeriode] = useState({
    debut: jour(new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() - 1, 1)),
    fin: jour(new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 0)),
  });
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    if (!siteId) return;
    supabase.rpc('rapport_laverie', { org: organisation.id, site: siteId, ...periode }).then(({ data, error }) => {
      setErreur(error);
      setDonnees(data);
    });
  }, [organisation.id, siteId, periode]);

  const site = sites.find((s) => s.id === siteId);
  const totaux = donnees ? totauxParTraitement(donnees.lots) : [];
  const colsLots = [
    [(l) => new Date(l.cloture_le).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' }), 'Clôturé le'],
    ['traitement', 'Traitement'],
    [(l) => (l.circuit === 'contamine' ? 'contaminé' : 'standard'), 'Circuit'],
    ['programme', 'Programme'],
    ['machine', 'Machine'],
    ['passages', 'Vêtements', 1],
  ];

  return (
    <div className="carte">
      <div className="entete-section">
        <h2>Activité {site ? `— ${site.nom}` : ''}</h2>
        {donnees?.lots?.length > 0 && (
          <button
            type="button"
            className="bouton bouton-discret sans-impression"
            onClick={() => exporterCsv(`activite-${(site?.nom ?? 'laverie').replace(/[^\w-]+/g, '_')}-${periode.debut}-${periode.fin}.csv`, colsLots, donnees.lots)}
          >
            CSV
          </button>
        )}
      </div>
      <div className="sans-impression">
        {!impose && (
          <label>
            <span>Laverie</span>
            <select value={siteId} onChange={(e) => setChoisi(e.target.value)}>
              {laveries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </label>
        )}
        <Periode {...periode} onChange={setPeriode} />
      </div>
      <p className="texte-secondaire">
        Du {dateFr(periode.debut)} au {dateFr(periode.fin)}. Pour vérifier une facture : lots clôturés et nombre de vêtements traités
        (passages comptés), sacs et vêtements reçus.
      </p>
      {erreur && <p className="message message-erreur">{messageErreur(erreur)}</p>}
      {donnees && (
        <>
          <ul className="tuiles">
            <li>
              <span className="etiquette">Sacs reçus</span>
              <strong>{donnees.sacs_recus}</strong>
            </li>
            <li>
              <span className="etiquette">Vêtements reçus</span>
              <strong>{donnees.vetements_recus}</strong>
            </li>
            <li>
              <span className="etiquette">Lots clôturés</span>
              <strong>{donnees.lots.length}</strong>
            </li>
            <li>
              <span className="etiquette">Lots avortés</span>
              <strong>{donnees.avortes}</strong>
            </li>
          </ul>
          <h3>Par traitement</h3>
          <Tableau colonnes={[['traitement', 'Traitement'], ['lots', 'Lots', 1], ['passages', 'Vêtements traités', 1]]} lignes={totaux} vide="Aucun lot clôturé sur la période." />
          <h3>Lots</h3>
          <Tableau colonnes={colsLots} lignes={donnees.lots} vide="Aucun lot clôturé sur la période." />
        </>
      )}
    </div>
  );
}

const ONGLETS = [
  ['passages', 'Passages'],
  ['fin-de-vie', 'Fin de vie'],
  ['laverie', 'Activité laverie'],
];

// Rapports : passages, vêtements à renouveler, activité d'une laverie. Export CSV ; « Imprimer » pour un PDF.
export default function Rapports() {
  const { role } = useOrganisation();
  const enLigne = useEnLigne();
  const [parametres, setParametres] = useSearchParams();
  const externe = role === 'laverie_externe';
  const onglets = externe ? ONGLETS.filter(([o]) => o === 'laverie') : ONGLETS;
  const onglet = onglets.some(([o]) => o === parametres.get('vue')) ? parametres.get('vue') : onglets[0][0];

  return (
    <section className="pile">
      <div className="entete-section">
        <h1>Rapports</h1>
        <button type="button" className="bouton sans-impression" onClick={() => window.print()}>
          Imprimer / PDF
        </button>
      </div>
      {!enLigne && <p className="message">Les rapports se consultent en ligne.</p>}
      {onglets.length > 1 && (
        <div className="filtres sans-impression" role="tablist">
          {onglets.map(([o, libelle]) => (
            <button key={o} type="button" role="tab" aria-selected={onglet === o} className={`bouton ${onglet === o ? 'bouton-principal' : ''}`} onClick={() => setParametres({ vue: o })}>
              {libelle}
            </button>
          ))}
        </div>
      )}
      {enLigne && onglet === 'passages' && <Passages />}
      {enLigne && onglet === 'fin-de-vie' && <FinDeVie />}
      {enLigne && onglet === 'laverie' && <ActiviteLaverie />}
    </section>
  );
}
