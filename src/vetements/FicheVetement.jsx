import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { ETAT_STATUT, STATUTS_VETEMENT, TECHNOLOGIES } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import { formaterCode, nouvelId } from '../identification/codes.js';
import { normaliserCodeApp } from '../identification/normalisation.js';
import AjoutIdentifiant from './AjoutIdentifiant.jsx';
import ActionsVetement from './ActionsVetement.jsx';
import Historique, { detailEvenement, LIBELLES_EVENEMENTS } from './Historique.jsx';
import { ficheVieCsv, telecharger } from './ficheVie.js';

const MOTIFS = ['Perdu', 'Illisible', 'Usé', 'Endommagé', 'Décousu'];

// Fiche vêtement : identité, statut, compteurs, identifiants (pose, retrait, remplacement), historique.
// Les actions selon le statut (attribution, contamination, réforme…) arrivent au jalon M5.
export default function FicheVetement() {
  const { id } = useParams();
  const location = useLocation();
  const { organisation } = useOrganisation();
  const { voitNoms, enrole } = useDroits();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [action, setAction] = useState(null); // null | { type: 'ajout' } | { type: 'retrait' | 'remplacement', identifiant }
  const [motif, setMotif] = useState('');
  const [motifLibre, setMotifLibre] = useState('');
  const [message, setMessage] = useState(location.state?.enrole ? { type: 'info', texte: 'Vêtement enrôlé.' } : null);
  const [envoi, setEnvoi] = useState(false);
  const [version, setVersion] = useState(0);

  const charger = useCallback(async () => {
    const v = await supabase
      .from('vetements')
      .select('*, article:articles(id, designation, fabricant, reference, duree_vie_mois), site:sites(nom)')
      .eq('id', id)
      .maybeSingle();
    if (v.error || !v.data) {
      setErreur(v.error ? messageErreur(v.error) : 'Vêtement introuvable ou non accessible.');
      return;
    }
    const [compteurs, limitesArticle, limitesVetement, identifiants, traitements, porteur] = await Promise.all([
      supabase.from('compteurs').select('traitement_id, passages').eq('vetement_id', id),
      supabase.from('articles_limites').select('traitement_id, limite, seuil_alerte_pct').eq('article_id', v.data.article_id),
      supabase.from('vetements_limites').select('traitement_id, limite').eq('vetement_id', id),
      supabase.from('identifiants').select('*').eq('vetement_id', id).order('actif', { ascending: false }).order('pose_le', { ascending: false }),
      supabase.from('traitements').select('id, libelle').eq('organisation_id', v.data.organisation_id).order('cree_le'),
      v.data.porteur_id
        ? supabase
            .from(voitNoms ? 'porteurs' : 'porteurs_anonymises')
            .select(voitNoms ? 'matricule, nom, prenom, casier' : 'matricule, casier')
            .eq('id', v.data.porteur_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setDonnees({
      vetement: v.data,
      compteurs: compteurs.data ?? [],
      limitesArticle: limitesArticle.data ?? [],
      limitesVetement: limitesVetement.data ?? [],
      identifiants: identifiants.data ?? [],
      traitements: traitements.data ?? [],
      porteur: porteur.data,
    });
    setVersion((n) => n + 1);
  }, [id, voitNoms]);

  useEffect(() => {
    charger();
  }, [charger]);

  function ouvrir(nouvelle) {
    setAction(nouvelle);
    setMotif('');
    setMotifLibre('');
    setMessage(null);
  }

  async function appeler(fonction, p, succes) {
    setEnvoi(true);
    const { error } = await supabase.rpc(fonction, { org: organisation.id, p: { ...p, survenu_le: new Date().toISOString() } });
    setEnvoi(false);
    if (error) {
      setMessage({ type: 'erreur', texte: messageErreur(error) });
      return false;
    }
    setAction(null);
    setMessage({ type: 'info', texte: succes });
    await charger();
    return true;
  }

  const motifRetenu = motif === 'Autre' ? motifLibre.trim() : motif;

  function poser(identifiant) {
    return appeler(
      'poser_tag',
      { evenement_id: nouvelId(), vetement_id: id, technologie: identifiant.technologie, valeur: identifiant.valeur },
      `Identifiant ${identifiant.valeur} posé.`,
    );
  }

  function retirer() {
    return appeler(
      'retirer_tag',
      { evenement_id: nouvelId(), identifiant_id: action.identifiant.id, motif: motifRetenu },
      `Identifiant ${action.identifiant.valeur} retiré.`,
    );
  }

  function remplacer(nouveau) {
    return appeler(
      'remplacer_tag',
      {
        evenement_retrait_id: nouvelId(),
        evenement_pose_id: nouvelId(),
        identifiant_id: action.identifiant.id,
        motif: motifRetenu,
        technologie: nouveau.technologie,
        valeur: nouveau.valeur,
      },
      `Identifiant ${action.identifiant.valeur} remplacé par ${nouveau.valeur}.`,
    );
  }

  // Passages par traitement, comparés aux limites effectives (surcharge par vêtement prioritaire).
  function lignesCompteurs() {
    const passages = Object.fromEntries(donnees.compteurs.map((c) => [c.traitement_id, c.passages]));
    const limites = Object.fromEntries(donnees.limitesArticle.map((l) => [l.traitement_id, l]));
    for (const l of donnees.limitesVetement) limites[l.traitement_id] = { ...limites[l.traitement_id], limite: l.limite, surcharge: true };
    return donnees.traitements
      .filter((t) => limites[t.id] || passages[t.id])
      .map((t) => {
        const l = limites[t.id];
        const n = passages[t.id] ?? 0;
        const etat = !l ? '' : n >= l.limite ? 'chaud' : n >= (l.limite * (l.seuil_alerte_pct ?? 80)) / 100 ? 'veille' : 'ok';
        return { t, l, n, etat };
      });
  }

  // La confirmation n'apparaît qu'une fois la fiche rechargée : jamais d'état périmé à l'écran.
  async function apresAction(texte) {
    await charger();
    setMessage({ type: 'info', texte });
  }

  async function exporter() {
    const { vetement: v, porteur } = donnees;
    const [evts, porteursEvts] = await Promise.all([
      supabase.from('evenements').select('numero, type, survenu_le, source, donnees, annule_par, site:sites(nom)').eq('vetement_id', id).order('numero'),
      supabase.from('porteurs_anonymises').select('id, matricule'),
    ]);
    const matricules = Object.fromEntries((porteursEvts.data ?? []).map((p) => [p.id, p.matricule]));
    const date = (d) => (d ? new Date(d).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' }) : '');
    const nomsTraitements = Object.fromEntries(donnees.traitements.map((t) => [t.id, t.libelle]));
    const contenu = ficheVieCsv({
      fiche: [
        ['Organisation', organisation.nom],
        ['Article', v.article?.designation],
        ['Référence', v.article?.reference],
        ['Taille', v.taille],
        ['N° de série', v.numero_serie],
        ['Statut', STATUTS_VETEMENT[v.statut]],
        ['Contaminé', v.contamine ? 'oui' : 'non'],
        ['Site', v.site?.nom],
        ['Porteur (matricule)', porteur?.matricule],
        ['Mis en service le', v.mis_en_service_le ? new Date(v.mis_en_service_le).toLocaleDateString('fr-BE') : ''],
        ['Identifiant interne', v.id],
        ['Exporté le', date(new Date())],
      ],
      compteurs: lignesCompteurs().map(({ t, l, n }) => ({ traitement: t.libelle, passages: n, limite: l?.limite ?? '' })),
      identifiants: donnees.identifiants.map((i) => ({
        technologie: TECHNOLOGIES[i.technologie],
        valeur: i.valeur,
        pose_le: date(i.pose_le),
        retire_le: date(i.retire_le),
        motif: i.motif_retrait,
      })),
      evenements: (evts.data ?? []).map((e) => ({
        date: date(e.survenu_le),
        evenement: LIBELLES_EVENEMENTS[e.type] ?? e.type,
        detail: detailEvenement(e, matricules) || (e.type === 'traitement' ? nomsTraitements[e.donnees?.traitement_id] ?? '' : ''),
        site: e.site?.nom,
        source: e.source,
        annule: !!e.annule_par,
      })),
    });
    telecharger(`fiche-de-vie-${(v.numero_serie || v.id.slice(0, 8)).replace(/[^\w-]+/g, '_')}.csv`, contenu);
  }

  if (erreur) {
    return (
      <section className="carte">
        <p className="message message-erreur">{erreur}</p>
        <Link to="/scan">← Scanner</Link>
      </section>
    );
  }
  if (!donnees) return <section className="carte">Chargement…</section>;

  const { vetement: v, porteur } = donnees;
  const lignes = lignesCompteurs();
  const actifs = donnees.identifiants.filter((i) => i.actif);
  const retires = donnees.identifiants.filter((i) => !i.actif);
  const codesImprimables = actifs.filter((i) => i.technologie === 'qr' && normaliserCodeApp(i.valeur) === i.valeur).map((i) => i.valeur);
  const modifiable = enrole && v.statut !== 'reforme';

  return (
    <section className="pile">
      <p>
        <Link to="/scan">← Scanner</Link>
      </p>

      {message && <p className={`message message-${message.type}`}>{message.texte}</p>}
      {location.state?.aImprimer?.length > 0 && (
        <Link to={`/etiquettes?codes=${location.state.aImprimer.join(',')}`} className="bouton bouton-principal bouton-large">
          Imprimer {location.state.aImprimer.length > 1 ? 'les étiquettes' : 'l’étiquette'} QR
        </Link>
      )}

      <div className="carte">
        <p className="etiquette">Vêtement</p>
        <h1>{v.article?.designation}</h1>
        <p className="statut-ligne">
          <span className={`jeton-etat etat-${ETAT_STATUT[v.statut]}`}>{STATUTS_VETEMENT[v.statut]}</span>
          {v.contamine && <span className="jeton-etat etat-chaud">Contaminé</span>}
          {v.controle_renforce && <span className="jeton-etat etat-veille">Contrôle renforcé</span>}
        </p>
        <dl className="proprietes">
          {v.taille && (
            <>
              <dt>Taille</dt>
              <dd>{v.taille}</dd>
            </>
          )}
          {v.numero_serie && (
            <>
              <dt>N° de série</dt>
              <dd className="mono">{v.numero_serie}</dd>
            </>
          )}
          <dt>Site</dt>
          <dd>{v.site?.nom ?? '—'}</dd>
          <dt>Porteur</dt>
          <dd>
            {porteur ? (
              <>
                <span className="mono">{porteur.matricule}</span>
                {porteur.nom && ` — ${[porteur.prenom, porteur.nom].filter(Boolean).join(' ')}`}
                {porteur.casier && ` · casier ${porteur.casier}`}
              </>
            ) : v.nominatif ? (
              'Nominatif, non attribué'
            ) : (
              '—'
            )}
          </dd>
          {v.mis_en_service_le && (
            <>
              <dt>En service depuis</dt>
              <dd className="mono">{new Date(v.mis_en_service_le).toLocaleDateString('fr-BE')}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="carte">
        <h2>Passages</h2>
        {lignes.length === 0 ? (
          <p className="texte-secondaire">Aucune limite définie pour cet article.</p>
        ) : (
          <table className="tableau-compteurs">
            <thead>
              <tr>
                <th>Traitement</th>
                <th>Passages</th>
                <th>Limite</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(({ t, l, n, etat }) => (
                <tr key={t.id}>
                  <th scope="row">{t.libelle}</th>
                  <td className={`mono compteur etat-${etat}`}>{n}</td>
                  <td className="mono">
                    {l?.limite ?? '—'}
                    {l?.surcharge && <span className="texte-secondaire"> *</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="carte">
        <h2>Identifiants</h2>
        {actifs.length === 0 && <p className="texte-secondaire">Aucun identifiant actif : ce vêtement ne peut pas être scanné.</p>}
        <ul className="liste">
          {actifs.map((i) => (
            <li key={i.id} className="ligne-liste ligne-statique">
              <span className="ligne-titre">
                <span className="mono">{i.valeur}</span>
              </span>
              <span className="ligne-detail">
                {TECHNOLOGIES[i.technologie]} · posé le {new Date(i.pose_le).toLocaleDateString('fr-BE')} · {i.passages_depuis_pose} passage(s)
                depuis la pose
              </span>
              {modifiable && !action && (
                <span className="rangee-actions">
                  <button type="button" className="bouton bouton-discret" onClick={() => ouvrir({ type: 'remplacement', identifiant: i })}>
                    Remplacer
                  </button>
                  <button type="button" className="bouton bouton-discret" onClick={() => ouvrir({ type: 'retrait', identifiant: i })}>
                    Retirer
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>

        {action && action.type !== 'ajout' && (
          <div className="carte carte-alerte etat-veille formulaire">
            <h2>
              {action.type === 'retrait' ? 'Retirer' : 'Remplacer'} <span className="mono">{action.identifiant.valeur}</span>
            </h2>
            <label>
              <span>
                Motif<span className="requis"> *</span>
              </span>
              <select value={motif} onChange={(e) => setMotif(e.target.value)}>
                <option value="">Choisir…</option>
                {MOTIFS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value="Autre">Autre…</option>
              </select>
            </label>
            {motif === 'Autre' && (
              <label>
                <span>Préciser</span>
                <input value={motifLibre} onChange={(e) => setMotifLibre(e.target.value)} />
              </label>
            )}
            {action.type === 'retrait' ? (
              <button type="button" className="bouton bouton-danger" disabled={!motifRetenu || envoi} onClick={retirer}>
                Retirer l’identifiant
              </button>
            ) : motifRetenu ? (
              <>
                <p className="texte-secondaire">Scannez le nouveau tag ou générez un nouveau QR :</p>
                <AjoutIdentifiant exclure={actifs} contexte={{ ecran: 'remplacement_tag' }} onAjout={remplacer} />
              </>
            ) : (
              <p className="texte-secondaire">Choisissez d’abord le motif.</p>
            )}
            <button type="button" className="bouton" onClick={() => setAction(null)} disabled={envoi}>
              Annuler
            </button>
          </div>
        )}

        {action?.type === 'ajout' && (
          <div className="pile">
            <AjoutIdentifiant exclure={actifs} contexte={{ ecran: 'ajout_tag' }} onAjout={poser} />
            <button type="button" className="bouton" onClick={() => setAction(null)}>
              Annuler
            </button>
          </div>
        )}

        {!action && (
          <div className="rangee-actions">
            {modifiable && (
              <button type="button" className="bouton" onClick={() => ouvrir({ type: 'ajout' })}>
                Ajouter un identifiant
              </button>
            )}
            {codesImprimables.length > 0 && (
              <Link to={`/etiquettes?codes=${codesImprimables.join(',')}`} className="bouton">
                Imprimer l’étiquette QR
              </Link>
            )}
          </div>
        )}

        {retires.length > 0 && (
          <details className="identifiants-retires">
            <summary>Identifiants retirés ({retires.length})</summary>
            <ul className="liste">
              {retires.map((i) => (
                <li key={i.id} className="ligne-liste ligne-statique">
                  <span className="ligne-titre">
                    <span className="mono">{i.technologie === 'qr' && normaliserCodeApp(i.valeur) === i.valeur ? formaterCode(i.valeur) : i.valeur}</span>
                    <span className="badge">Retiré</span>
                  </span>
                  <span className="ligne-detail">
                    {TECHNOLOGIES[i.technologie]} · du {new Date(i.pose_le).toLocaleDateString('fr-BE')} au{' '}
                    {new Date(i.retire_le).toLocaleDateString('fr-BE')} · {i.motif_retrait}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <ActionsVetement vetement={v} onFait={apresAction} />

      <Historique vetementId={id} version={version} onChange={apresAction} />

      <button type="button" className="bouton" onClick={exporter}>
        Exporter la fiche de vie (CSV)
      </button>
    </section>
  );
}
