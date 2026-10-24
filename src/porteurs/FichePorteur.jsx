import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { ETAT_STATUT, STATUTS_VETEMENT } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import { useLignes } from '../referentiels/useLignes.js';
import { useEnLigne } from '../connexion/useConnexion.js';
import { bilan, emettre, evenement } from '../journal/journal.js';
import { codeVetement } from '../vetements/ListeVetements.jsx';
import { dotations } from './dotations.js';

const CHAMPS_VETEMENT = 'id, statut, contamine, taille, numero_serie, nominatif, site_id, article:articles(designation), identifiants(valeur, actif)';
const FINS = ['restitution', 'reforme', 'perte', 'attribution'];
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-BE') : '');

// Départ : ce qu'on peut faire de chaque vêtement encore lié au porteur.
function issueDepart(v) {
  if (['en_service', 'en_stock'].includes(v.statut)) return 'restituer';
  if (v.statut === 'perdu') return 'reformer'; // perdu : seule la réforme le détache
  return 'attendre'; // en laverie : se libère à son retour
}

export default function FichePorteur({ porteurId, monEspace = false }) {
  const { organisation } = useOrganisation();
  const { voitNoms, gerePorteurs } = useDroits();
  const enLigne = useEnLigne();
  const { lignes: sites } = useLignes('sites', { ordre: 'nom' });
  const [porteur, setPorteur] = useState(undefined);
  const [vetements, setVetements] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [depart, setDepart] = useState(null); // { [vetementId]: 'restituer' | 'reformer' }
  const [siteRetour, setSiteRetour] = useState('');
  const [motif, setMotif] = useState('Départ du porteur');
  const [envoi, setEnvoi] = useState(false);
  const [confirmerAnonymat, setConfirmerAnonymat] = useState(false);

  const charger = useCallback(async () => {
    const p = await supabase
      .from(voitNoms ? 'porteurs' : 'porteurs_anonymises')
      .select(voitNoms ? '*' : 'id, matricule, casier, site_id, actif')
      .eq('id', porteurId)
      .maybeSingle();
    if (p.error) {
      setErreur(p.error);
      return;
    }
    setPorteur(p.data);
    if (!p.data) return;
    const [v, a] = await Promise.all([
      supabase.from('vetements').select(CHAMPS_VETEMENT).eq('porteur_id', porteurId).order('numero_serie'),
      supabase
        .from('evenements')
        .select('id, numero, vetement_id, survenu_le, annule_par')
        .eq('organisation_id', organisation.id)
        .eq('type', 'attribution')
        .eq('donnees->>porteur_id', porteurId)
        .is('annule_par', null)
        .order('numero', { ascending: false }),
    ]);
    setVetements(v.data ?? []);
    const attributions = a.data ?? [];
    const ids = [...new Set(attributions.map((x) => x.vetement_id))];
    if (!ids.length) {
      setHistorique([]);
      return;
    }
    const [suivants, details] = await Promise.all([
      supabase.from('evenements').select('id, numero, vetement_id, type, survenu_le').in('vetement_id', ids).in('type', FINS).is('annule_par', null),
      supabase.from('vetements').select(CHAMPS_VETEMENT).in('id', ids),
    ]);
    const parId = Object.fromEntries((details.data ?? []).map((x) => [x.id, x]));
    setHistorique(dotations(attributions, suivants.data ?? []).map((d) => ({ ...d, vetement: parId[d.vetement_id] })));
  }, [porteurId, voitNoms, organisation.id]);

  useEffect(() => {
    if (enLigne) charger();
  }, [charger, enLigne]);

  function commencerDepart() {
    setMessage(null);
    setSiteRetour(porteur.site_id ?? '');
    setDepart(
      Object.fromEntries(
        vetements.filter((v) => issueDepart(v) !== 'attendre').map((v) => [v.id, issueDepart(v) === 'reformer' ? 'reformer' : 'restituer']),
      ),
    );
  }

  async function validerDepart() {
    setEnvoi(true);
    try {
      const evts = Object.entries(depart).map(([id, choix]) =>
        choix === 'reformer'
          ? evenement('reforme', id, { donnees: { motif: motif.trim() || 'Départ du porteur' } })
          : evenement('restitution', id, { siteId: siteRetour || null, donnees: { liberer: true } }),
      );
      const b = bilan(await emettre(organisation.id, evts));
      setMessage(
        b.rejets.length
          ? { type: 'erreur', texte: `${b.acceptes} enregistré(s), ${b.rejets.length} refusé(s) : ${b.rejets.map((r) => r.motif).join(' ; ')}` }
          : { type: 'info', texte: `${b.acceptes} vêtement(s) restitué(s) ou réformé(s).` },
      );
      setDepart(null);
      await charger();
    } catch (e) {
      setMessage({ type: 'erreur', texte: messageErreur(e) });
    } finally {
      setEnvoi(false);
    }
  }

  async function anonymiser() {
    setEnvoi(true);
    const { data, error } = await supabase.rpc('anonymiser_porteur', { org: organisation.id, porteur: porteurId });
    setEnvoi(false);
    setConfirmerAnonymat(false);
    if (error) setMessage({ type: 'erreur', texte: messageErreur(error) });
    else {
      setMessage({ type: 'info', texte: `Porteur anonymisé : il apparaît désormais sous le code ${data}.` });
      await charger();
    }
  }

  if (!enLigne) return <p className="message">La fiche porteur se consulte en ligne.</p>;
  if (erreur) return <p className="message message-erreur">{messageErreur(erreur)}</p>;
  if (porteur === undefined) return <p className="carte">Chargement…</p>;
  if (porteur === null) {
    return (
      <p className="message">
        {monEspace ? 'Aucune fiche porteur n’est reliée à votre compte : demandez-le à votre administrateur.' : 'Porteur introuvable.'}
      </p>
    );
  }

  const nom = [porteur.prenom, porteur.nom].filter(Boolean).join(' ');
  const nomSite = (id) => sites.find((s) => s.id === id)?.nom ?? '';
  const anonymise = !!porteur.anonymise_le;
  const enLaverie = vetements.filter((v) => issueDepart(v) === 'attendre');

  return (
    <section className="pile">
      {!monEspace && (
        <p>
          <Link to="/parametres/porteurs">← Porteurs</Link>
        </p>
      )}
      {message && <p className={`message message-${message.type}`}>{message.texte}</p>}

      <div className="carte">
        <p className="etiquette">{monEspace ? 'Mes vêtements' : 'Porteur'}</p>
        <h1>
          <span className="mono">{porteur.matricule}</span>
          {nom && ` — ${nom}`}
        </h1>
        <p className="statut-ligne">
          {anonymise ? (
            <span className="jeton-etat etat-froid">Anonymisé le {date(porteur.anonymise_le)}</span>
          ) : (
            !porteur.actif && <span className="jeton-etat etat-froid">Inactif</span>
          )}
        </p>
        <dl className="proprietes">
          <dt>Poste</dt>
          <dd>{nomSite(porteur.site_id) || '—'}</dd>
          <dt>Casier</dt>
          <dd className="mono">{porteur.casier || '—'}</dd>
        </dl>
        {gerePorteurs && !monEspace && !anonymise && (
          <div className="rangee-actions">
            <Link to={`/parametres/porteurs?modifier=${porteur.id}`} className="bouton">
              Modifier
            </Link>
            {!depart && (
              <button type="button" className="bouton bouton-danger" onClick={commencerDepart}>
                Départ du porteur
              </button>
            )}
          </div>
        )}
      </div>

      {depart && (
        <div className="carte carte-alerte etat-veille formulaire">
          <h2>Départ du porteur</h2>
          <p>
            Chaque vêtement est restitué (il redevient banalisé et réattribuable, même s’il était nominatif) ou réformé. Le
            porteur pourra ensuite être anonymisé.
          </p>
          {Object.keys(depart).length === 0 && <p className="texte-secondaire">Aucun vêtement à restituer maintenant.</p>}
          <ul className="liste">
            {vetements
              .filter((v) => issueDepart(v) !== 'attendre')
              .map((v) => (
                <li key={v.id} className="ligne-liste ligne-statique">
                  <span className="ligne-titre">
                    {v.article?.designation} <span className="mono">{codeVetement(v) || v.numero_serie}</span>
                  </span>
                  <span className="rangee-actions">
                    {(issueDepart(v) === 'reformer' ? [['reformer', 'Réformer (perdu)']] : [['restituer', 'Restituer'], ['reformer', 'Réformer']]).map(([valeur, libelle]) => (
                      <label key={valeur} className="champ-case">
                        <input
                          type="radio"
                          name={`depart-${v.id}`}
                          checked={depart[v.id] === valeur}
                          onChange={() => setDepart({ ...depart, [v.id]: valeur })}
                        />
                        <span>{libelle}</span>
                      </label>
                    ))}
                  </span>
                </li>
              ))}
          </ul>
          {enLaverie.length > 0 && (
            <p className="message">
              {enLaverie.length} vêtement(s) en laverie : à restituer ou réformer à leur retour (
              {enLaverie.map((v) => codeVetement(v) || v.numero_serie).join(', ')}).
            </p>
          )}
          <label>
            <span>Site où les vêtements restitués sont rangés</span>
            <select value={siteRetour} onChange={(e) => setSiteRetour(e.target.value)}>
              <option value="">— inchangé —</option>
              {sites
                .filter((s) => s.actif)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
            </select>
          </label>
          {Object.values(depart).includes('reformer') && (
            <label>
              <span>Motif de réforme</span>
              <input value={motif} onChange={(e) => setMotif(e.target.value)} />
            </label>
          )}
          <div className="rangee-actions">
            <button type="button" className="bouton bouton-principal" disabled={envoi || Object.keys(depart).length === 0} onClick={validerDepart}>
              Valider ({Object.keys(depart).length})
            </button>
            <button type="button" className="bouton" onClick={() => setDepart(null)} disabled={envoi}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="carte">
        <h2>{monEspace ? 'Vêtements en ma possession' : 'Vêtements actuels'} ({vetements.length})</h2>
        {vetements.length === 0 && <p className="texte-secondaire">Aucun vêtement.</p>}
        <ul className="liste">
          {vetements.map((v) => (
            <li key={v.id}>
              <Link to={`/vetements/${v.id}`} className={`ligne-liste ${v.contamine ? 'ligne-contaminee' : ''}`}>
                <span className="ligne-titre">
                  {v.article?.designation}
                  {v.taille && <span className="texte-secondaire"> · {v.taille}</span>}
                  <span className={`jeton-etat etat-${ETAT_STATUT[v.statut]}`}>{STATUTS_VETEMENT[v.statut]}</span>
                  {v.nominatif && <span className="badge">Nominatif</span>}
                </span>
                <span className="ligne-detail mono">{codeVetement(v) || v.numero_serie}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="carte">
        <h2>Historique de dotation ({historique.length})</h2>
        {historique.length === 0 && <p className="texte-secondaire">Aucune attribution enregistrée.</p>}
        <ul className="liste">
          {historique.map((d) => (
            <li key={d.id} className="ligne-liste ligne-statique">
              <span className="ligne-titre">
                {d.vetement ? (
                  <Link to={`/vetements/${d.vetement_id}`}>
                    {d.vetement.article?.designation} <span className="mono">{codeVetement(d.vetement) || d.vetement.numero_serie}</span>
                  </Link>
                ) : (
                  <span className="texte-secondaire">Vêtement non visible</span>
                )}
              </span>
              <span className="ligne-detail mono">
                {date(d.survenu_le)} → {d.fin ? `${date(d.fin.survenu_le)} (${{ restitution: 'restitué', reforme: 'réformé', perte: 'perdu', attribution: 'réattribué' }[d.fin.type]})` : 'en cours'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {gerePorteurs && !monEspace && !anonymise && (
        <div className="carte formulaire">
          <h2>Anonymiser</h2>
          <p className="texte-secondaire">
            Après le départ : le nom, le prénom, le casier et le lien au compte sont effacés ; le matricule est remplacé par un code
            neutre. L’historique des vêtements reste entier. Irréversible. Possible quand plus aucun vêtement n’est lié au porteur.
          </p>
          {confirmerAnonymat ? (
            <div className="rangee-actions">
              <button type="button" className="bouton bouton-danger" disabled={envoi} onClick={anonymiser}>
                Confirmer l’anonymisation
              </button>
              <button type="button" className="bouton" onClick={() => setConfirmerAnonymat(false)}>
                Annuler
              </button>
            </div>
          ) : (
            <button type="button" className="bouton bouton-danger" disabled={vetements.length > 0} onClick={() => setConfirmerAnonymat(true)}>
              Anonymiser ce porteur
            </button>
          )}
          {vetements.length > 0 && <p className="aide">Encore {vetements.length} vêtement(s) lié(s) : faites d’abord le départ.</p>}
        </div>
      )}
    </section>
  );
}
