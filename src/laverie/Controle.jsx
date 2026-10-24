import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { STATUTS_VETEMENT } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Scanner from '../identification/Scanner.jsx';
import { traiterLecture } from '../identification/traiterLecture.js';
import { emettre, evenement } from '../journal/journal.js';
import CompteRendu from './Envoi.jsx';
import { CHAMPS_VETEMENT, codeVisible } from './donnees.js';
import { ChoixSiteTravail, useSiteTravail } from './SiteTravail.jsx';

const MOTIFS = {
  a_reparer: ['Couture', 'Fermeture', 'Bande réfléchissante', 'Accroc'],
  reforme: ['Déchirure', 'Brûlure', 'Usure', 'Contamination non traitable', 'Fin de vie'],
};

// Seuil atteint pour un vêtement (limite de passages ou âge), calculé pour l'affichage ;
// la base refait le calcul à l'ingestion du contrôle.
async function etatSeuil(v) {
  const [compteurs, limitesArticle, limitesVetement, article] = await Promise.all([
    supabase.from('compteurs').select('traitement_id, passages, traitement:traitements(libelle)').eq('vetement_id', v.id),
    supabase.from('articles_limites').select('traitement_id, limite').eq('article_id', v.article_id),
    supabase.from('vetements_limites').select('traitement_id, limite').eq('vetement_id', v.id),
    supabase.from('articles').select('duree_vie_mois').eq('id', v.article_id).maybeSingle(),
  ]);
  const limites = Object.fromEntries((limitesArticle.data ?? []).map((l) => [l.traitement_id, l.limite]));
  for (const l of limitesVetement.data ?? []) limites[l.traitement_id] = l.limite;
  const lignes = (compteurs.data ?? []).filter((c) => c.passages > 0).map((c) => ({ ...c, limite: limites[c.traitement_id] }));
  const depasse = lignes.filter((c) => c.limite && c.passages >= c.limite).map((c) => c.traitement?.libelle);
  return { lignes, depasse, dureeVie: article.data?.duree_vie_mois };
}

export default function Controle() {
  const { organisation } = useOrganisation();
  const travail = useSiteTravail();
  const [aControler, setAControler] = useState([]);
  const [aReparer, setAReparer] = useState([]);
  const [courant, setCourant] = useState(null); // { v, seuil }
  const [verdict, setVerdict] = useState(null);
  const [renforce, setRenforce] = useState(false);
  const [motif, setMotif] = useState('');
  const [resultat, setResultat] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    if (!travail.siteId) return;
    const { data } = await supabase
      .from('vetements')
      .select(CHAMPS_VETEMENT)
      .eq('organisation_id', organisation.id)
      .eq('site_id', travail.siteId)
      .in('statut', ['traite', 'a_reparer'])
      .order('derniere_lecture_le');
    setAControler((data ?? []).filter((v) => v.statut === 'traite'));
    setAReparer((data ?? []).filter((v) => v.statut === 'a_reparer'));
  }, [organisation.id, travail.siteId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ouvrir(v) {
    setResultat(null);
    setVerdict(null);
    setRenforce(false);
    setMotif('');
    setCourant({ v, seuil: await etatSeuil(v) });
  }

  async function scanner(lecture) {
    const r = await traiterLecture(lecture, { organisationId: organisation.id, contexte: { mode: 'unitaire', ecran: 'controle' } });
    if (r.statut !== 'trouve') {
      setResultat({ texte: r.statut === 'erreur' ? 'Vérifiez la connexion.' : `Code ${lecture.valeur} : vêtement inconnu ou non accessible.`, rejets: [] });
      return;
    }
    const { data: v } = await supabase.from('vetements').select(CHAMPS_VETEMENT).eq('id', r.vetementId).single();
    if (v.statut !== 'traite') {
      setResultat({ texte: `${codeVisible(v)} : statut « ${STATUTS_VETEMENT[v.statut]} », pas en attente de contrôle.`, rejets: [] });
      return;
    }
    ouvrir(v);
  }

  async function envoyer(type, v, donnees = {}) {
    setEnvoi(true);
    try {
      const [r] = await emettre(organisation.id, [evenement(type, v.id, { donnees })]);
      if (r.statut === 'rejete') {
        setResultat({ texte: r.motif, rejets: [] });
        return;
      }
      setResultat({ texte: `${codeVisible(v)} : ${type === 'reparation' ? 'réparé, à recontrôler' : 'contrôle enregistré'}.` });
      setCourant(null);
      await charger();
    } catch (e) {
      setResultat({ texte: messageErreur(e), rejets: [] });
    } finally {
      setEnvoi(false);
    }
  }

  const renforceExige = courant && (courant.v.contamine || courant.seuil.depasse.length > 0);
  const pret = verdict && (verdict === 'conforme' ? !renforceExige || renforce : motif.trim());

  return (
    <section className="pile">
      <p>
        <Link to="/laverie">← Laverie</Link>
      </p>
      <h1>Contrôle</h1>
      <ChoixSiteTravail travail={travail} />
      <CompteRendu resultat={resultat} />

      {courant ? (
        <div className={`carte formulaire ${renforceExige ? 'carte-alerte etat-chaud' : ''}`}>
          <p className="etiquette">Contrôle après traitement</p>
          <h2>
            {courant.v.article?.designation} <span className="mono">{codeVisible(courant.v)}</span>
          </h2>
          <p className="statut-ligne">
            {courant.v.contamine && <span className="jeton-etat etat-chaud">Contaminé</span>}
            {courant.seuil.depasse.length > 0 && <span className="jeton-etat etat-chaud">Limite atteinte : {courant.seuil.depasse.join(', ')}</span>}
          </p>
          {courant.seuil.lignes.length > 0 && (
            <p className="texte-secondaire mono">
              {courant.seuil.lignes.map((c) => `${c.traitement?.libelle} ${c.passages}/${c.limite ?? '—'}`).join(' · ')}
            </p>
          )}
          <div className="grille-actions">
            {[
              ['conforme', 'Conforme'],
              ['a_reparer', 'À réparer'],
              ['reforme', 'À réformer'],
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={verdict === v}
                className={`bouton ${verdict === v ? 'bouton-principal' : ''} ${v === 'reforme' ? 'bouton-danger' : ''}`}
                onClick={() => {
                  setVerdict(v);
                  setMotif('');
                }}
              >
                {l}
              </button>
            ))}
          </div>
          {verdict === 'conforme' && (
            <label className="champ-case">
              <input type="checkbox" checked={renforce} onChange={(e) => setRenforce(e.target.checked)} />
              <span>
                Contrôle renforcé effectué
                {renforceExige && <strong> — obligatoire ({courant.v.contamine ? 'vêtement contaminé' : 'limite atteinte'})</strong>}
              </span>
            </label>
          )}
          {(verdict === 'a_reparer' || verdict === 'reforme') && (
            <label>
              <span>
                Motif<span className="requis"> *</span>
              </span>
              <input list={`motifs-${verdict}`} value={motif} onChange={(e) => setMotif(e.target.value)} />
              <datalist id={`motifs-${verdict}`}>
                {MOTIFS[verdict].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
          )}
          <div className="rangee-actions">
            <button
              type="button"
              className="bouton bouton-principal"
              disabled={!pret || envoi}
              onClick={() => envoyer('controle', courant.v, { verdict, renforce, ...(motif.trim() ? { motif: motif.trim() } : {}) })}
            >
              Enregistrer le contrôle
            </button>
            <button type="button" className="bouton" onClick={() => setCourant(null)} disabled={envoi}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        travail.siteId && <Scanner onLecture={scanner} />
      )}

      {!travail.siteId && <p className="message">Choisissez la laverie où vous travaillez.</p>}

      {!courant && aControler.length > 0 && (
        <div className="carte">
          <h2>À contrôler ({aControler.length})</h2>
          <ul className="liste">
            {aControler.map((v) => (
              <li key={v.id}>
                <button type="button" className={`ligne-liste ${v.contamine ? 'ligne-contaminee' : ''}`} onClick={() => ouvrir(v)}>
                  <span className="ligne-titre">
                    {v.article?.designation}
                    {v.contamine && <span className="jeton-etat etat-chaud">Contaminé</span>}
                  </span>
                  <span className="ligne-detail mono">{codeVisible(v)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!courant && aReparer.length > 0 && (
        <div className="carte">
          <h2>À réparer ({aReparer.length})</h2>
          <ul className="liste">
            {aReparer.map((v) => (
              <li key={v.id} className="ligne-liste ligne-statique">
                <span className="ligne-titre">{v.article?.designation}</span>
                <span className="ligne-detail mono">{codeVisible(v)}</span>
                <button type="button" className="bouton bouton-discret" disabled={envoi} onClick={() => envoyer('reparation', v)}>
                  Réparé
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
