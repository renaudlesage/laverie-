import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { ecrireCsv } from '../lib/csv.js';
import { ETAT_STATUT, STATUTS_VETEMENT } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import { useLignes } from '../referentiels/useLignes.js';
import { useEnLigne } from '../connexion/useConnexion.js';
import { telecharger } from './ficheVie.js';

const PAGE = 50;
const CHAMPS = 'id, statut, contamine, taille, numero_serie, site_id, porteur_id, article:articles(designation), identifiants(valeur, actif)';
const FILTRES = ['q', 'article', 'statut', 'site', 'porteur', 'contamine'];

// Texte saisi sûr pour un filtre PostgREST (pas de séparateurs de syntaxe).
const nettoyer = (texte) => texte.replace(/[,()%*\\]/g, ' ').trim();

export function codeVetement(v) {
  return v.identifiants?.find((i) => i.actif)?.valeur ?? '';
}

// Recherche des vêtements : code (tag), n° de série, article, statut, site, porteur. Les filtres
// sont dans l'adresse : une recherche se partage ou se met en favori.
export default function ListeVetements() {
  const { organisation } = useOrganisation();
  const { voitNoms } = useDroits();
  const enLigne = useEnLigne();
  const [parametres, setParametres] = useSearchParams();
  const filtres = Object.fromEntries(FILTRES.map((f) => [f, parametres.get(f) ?? '']));
  const [saisie, setSaisie] = useState({ q: filtres.q, porteur: filtres.porteur });
  const { lignes: articles } = useLignes('articles', { ordre: 'designation' });
  const { lignes: sites } = useLignes('sites', { ordre: 'nom' });
  const [resultat, setResultat] = useState(null); // { lignes, total }
  const [porteurs, setPorteurs] = useState({});
  const [limite, setLimite] = useState(PAGE);
  const [erreur, setErreur] = useState(null);
  const [export_, setExport] = useState(false);

  const cle = FILTRES.map((f) => filtres[f]).join('|');

  // Construit la requête selon les filtres : { q } (emballée, sinon `await` l'exécuterait),
  // ou null si aucun vêtement ne peut correspondre.
  const requete = useCallback(
    async (colonnes, options) => {
      let q = supabase.from('vetements').select(colonnes, options).eq('organisation_id', organisation.id);
      if (filtres.article) q = q.eq('article_id', filtres.article);
      if (filtres.statut) q = q.eq('statut', filtres.statut);
      if (filtres.site) q = q.eq('site_id', filtres.site);
      if (filtres.contamine) q = q.eq('contamine', true);
      const texte = nettoyer(filtres.q);
      if (texte) {
        const { data } = await supabase
          .from('identifiants')
          .select('vetement_id')
          .eq('organisation_id', organisation.id)
          .ilike('valeur', `%${texte}%`)
          .limit(500);
        const ids = [...new Set((data ?? []).map((i) => i.vetement_id))];
        q = q.or([`numero_serie.ilike.%${texte}%`, `taille.ilike.${texte}`, ids.length && `id.in.(${ids.join(',')})`].filter(Boolean).join(','));
      }
      const matricule = nettoyer(filtres.porteur);
      if (matricule) {
        const { data } = await supabase
          .from('porteurs_anonymises')
          .select('id')
          .eq('organisation_id', organisation.id)
          .ilike('matricule', `%${matricule}%`)
          .limit(500);
        if (!data?.length) return null;
        q = q.in('porteur_id', data.map((p) => p.id));
      }
      return { q: q.order('numero_serie', { nullsFirst: false }).order('id') };
    },
    [organisation.id, cle], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!enLigne) return;
    let annule = false;
    (async () => {
      const r = await requete(CHAMPS, { count: 'exact' });
      if (!r) {
        if (!annule) setResultat({ lignes: [], total: 0 });
        return;
      }
      const { data, error, count } = await r.q.range(0, limite - 1);
      if (annule) return;
      setErreur(error);
      setResultat({ lignes: data ?? [], total: count ?? 0 });
      const ids = [...new Set((data ?? []).map((v) => v.porteur_id).filter(Boolean))];
      if (ids.length) {
        const r = await supabase
          .from(voitNoms ? 'porteurs' : 'porteurs_anonymises')
          .select(voitNoms ? 'id, matricule, nom, prenom' : 'id, matricule')
          .in('id', ids);
        if (!annule) setPorteurs(Object.fromEntries((r.data ?? []).map((p) => [p.id, p])));
      }
    })();
    return () => {
      annule = true;
    };
  }, [requete, limite, enLigne, voitNoms]);

  function filtrer(changement) {
    const suivant = { ...filtres, ...changement };
    setLimite(PAGE);
    setParametres(Object.fromEntries(Object.entries(suivant).filter(([, v]) => v)), { replace: true });
  }

  const nomSite = (id) => sites.find((s) => s.id === id)?.nom ?? '';
  const libellePorteur = (p) => (p ? [p.matricule, [p.prenom, p.nom].filter(Boolean).join(' ')].filter(Boolean).join(' — ') : '');

  async function exporter() {
    setExport(true);
    try {
      const r0 = await requete(CHAMPS);
      const { data, error } = r0 ? await r0.q.range(0, 4999) : { data: [] };
      if (error) throw error;
      const ids = [...new Set(data.map((v) => v.porteur_id).filter(Boolean))];
      const r = ids.length ? await supabase.from('porteurs_anonymises').select('id, matricule').in('id', ids) : { data: [] };
      const matricules = Object.fromEntries((r.data ?? []).map((p) => [p.id, p.matricule]));
      const csv = ecrireCsv(
        ['Code', 'Article', 'Taille', 'N° de série', 'Statut', 'Contaminé', 'Site', 'Porteur (matricule)'],
        data.map((v) => [
          codeVetement(v), v.article?.designation, v.taille, v.numero_serie, STATUTS_VETEMENT[v.statut], v.contamine ? 'oui' : '',
          nomSite(v.site_id), matricules[v.porteur_id] ?? '',
        ]),
      );
      telecharger(`vetements-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } catch (e) {
      setErreur(e);
    } finally {
      setExport(false);
    }
  }

  return (
    <section className="pile">
      <h1>Vêtements</h1>
      {!enLigne && <p className="message">La recherche se fait en ligne. Hors ligne, scannez le vêtement.</p>}

      <form
        className="carte formulaire"
        onSubmit={(e) => {
          e.preventDefault();
          filtrer({ q: saisie.q.trim(), porteur: saisie.porteur.trim() });
        }}
      >
        <label>
          <span>Code, n° de série ou taille</span>
          <input type="search" value={saisie.q} onChange={(e) => setSaisie({ ...saisie, q: e.target.value })} placeholder="Ex. : TEST000012, SN-…" />
        </label>
        <div className="grille-champs">
          <label>
            <span>Article</span>
            <select value={filtres.article} onChange={(e) => filtrer({ article: e.target.value })}>
              <option value="">Tous</option>
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.designation}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Statut</span>
            <select value={filtres.statut} onChange={(e) => filtrer({ statut: e.target.value })}>
              <option value="">Tous</option>
              {Object.entries(STATUTS_VETEMENT).map(([s, l]) => (
                <option key={s} value={s}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Site</span>
            <select value={filtres.site} onChange={(e) => filtrer({ site: e.target.value })}>
              <option value="">Tous</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Porteur (matricule)</span>
            <input value={saisie.porteur} onChange={(e) => setSaisie({ ...saisie, porteur: e.target.value })} placeholder="Ex. : T004" />
          </label>
        </div>
        <label className="champ-case">
          <input type="checkbox" checked={!!filtres.contamine} onChange={(e) => filtrer({ contamine: e.target.checked ? '1' : '' })} />
          <span>Contaminés seulement</span>
        </label>
        <div className="rangee-actions">
          <button type="submit" className="bouton bouton-principal">
            Rechercher
          </button>
          {FILTRES.some((f) => filtres[f]) && (
            <button
              type="button"
              className="bouton"
              onClick={() => {
                setSaisie({ q: '', porteur: '' });
                setParametres({}, { replace: true });
              }}
            >
              Effacer les filtres
            </button>
          )}
        </div>
      </form>

      {erreur && <p className="message message-erreur">{messageErreur(erreur)}</p>}
      {resultat && (
        <div className="entete-section">
          <p className="etiquette sans-marge">{resultat.total} vêtement(s)</p>
          {resultat.total > 0 && (
            <button type="button" className="bouton bouton-discret" disabled={export_} onClick={exporter}>
              {export_ ? 'Export…' : 'Exporter (CSV)'}
            </button>
          )}
        </div>
      )}
      <ul className="liste">
        {resultat?.lignes.map((v) => (
          <li key={v.id}>
            <Link to={`/vetements/${v.id}`} className={`ligne-liste ${v.contamine ? 'ligne-contaminee' : ''}`}>
              <span className="ligne-titre">
                {v.article?.designation}
                {v.taille && <span className="texte-secondaire"> · {v.taille}</span>}
                <span className={`jeton-etat etat-${ETAT_STATUT[v.statut]}`}>{STATUTS_VETEMENT[v.statut]}</span>
                {v.contamine && <span className="jeton-etat etat-chaud">Contaminé</span>}
              </span>
              <span className="ligne-detail">
                <span className="mono">{codeVetement(v) || v.numero_serie || v.id.slice(0, 8)}</span>
                {[nomSite(v.site_id), libellePorteur(porteurs[v.porteur_id])].filter(Boolean).map((t) => ` · ${t}`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {resultat && resultat.lignes.length < resultat.total && (
        <button type="button" className="bouton" onClick={() => setLimite((n) => n + PAGE)}>
          Afficher plus ({resultat.total - resultat.lignes.length} restants)
        </button>
      )}
    </section>
  );
}
