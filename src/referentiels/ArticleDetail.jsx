import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import Champ from './Champ.jsx';

const CHAMPS = [
  { nom: 'designation', libelle: 'Désignation', requis: true },
  { nom: 'fabricant', libelle: 'Fabricant' },
  { nom: 'reference', libelle: 'Référence fabricant' },
  { nom: 'norme', libelle: 'Norme' },
  { nom: 'duree_vie_mois', libelle: 'Durée de vie (mois)', type: 'nombre', min: 1 },
];

export default function ArticleDetail() {
  const { id } = useParams();
  const { organisation } = useOrganisation();
  const { estAdmin } = useDroits();
  const [article, setArticle] = useState(null);
  const [valeurs, setValeurs] = useState({});
  const [traitements, setTraitements] = useState([]);
  const [limites, setLimites] = useState({}); // traitement_id → { id?, limite, seuil_alerte_pct }
  const [message, setMessage] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    const [a, t, l] = await Promise.all([
      supabase.from('articles').select('*').eq('id', id).single(),
      supabase.from('traitements').select('*').eq('organisation_id', organisation.id).order('cree_le'),
      supabase.from('articles_limites').select('*').eq('article_id', id),
    ]);
    const erreur = a.error ?? t.error ?? l.error;
    if (erreur) {
      setMessage({ type: 'erreur', texte: messageErreur(erreur) });
      return;
    }
    setArticle(a.data);
    setValeurs(Object.fromEntries(CHAMPS.map((c) => [c.nom, a.data[c.nom]])));
    setTraitements(t.data);
    setLimites(
      Object.fromEntries(
        l.data.map((x) => [x.traitement_id, { id: x.id, limite: x.limite, seuil_alerte_pct: x.seuil_alerte_pct }]),
      ),
    );
  }, [id, organisation.id]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function executer(action, succes) {
    setEnvoi(true);
    setMessage(null);
    const erreur = await action();
    setEnvoi(false);
    if (erreur) {
      setMessage({ type: 'erreur', texte: messageErreur(erreur) });
    } else {
      setMessage({ type: 'info', texte: succes });
    }
    await charger();
  }

  function enregistrerFiche(e) {
    e.preventDefault();
    const maj = { ...valeurs };
    for (const k of Object.keys(maj)) if (typeof maj[k] === 'string') maj[k] = maj[k].trim() || null;
    return executer(async () => (await supabase.from('articles').update(maj).eq('id', id)).error, 'Fiche enregistrée.');
  }

  function enregistrerLimites(e) {
    e.preventDefault();
    return executer(async () => {
      const aEcrire = [];
      const aSupprimer = [];
      for (const t of traitements) {
        const l = limites[t.id];
        if (l?.limite) {
          aEcrire.push({
            organisation_id: organisation.id,
            article_id: id,
            traitement_id: t.id,
            limite: l.limite,
            seuil_alerte_pct: l.seuil_alerte_pct ?? 80,
          });
        } else if (l?.id) {
          aSupprimer.push(l.id);
        }
      }
      if (aEcrire.length) {
        const { error } = await supabase.from('articles_limites').upsert(aEcrire, { onConflict: 'article_id,traitement_id' });
        if (error) return error;
      }
      if (aSupprimer.length) {
        const { error } = await supabase.from('articles_limites').delete().in('id', aSupprimer);
        if (error) return error;
      }
      return null;
    }, 'Limites enregistrées.');
  }

  function televerserNotice(e) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    if (fichier.type !== 'application/pdf') {
      setMessage({ type: 'erreur', texte: 'La notice doit être un fichier PDF.' });
      return;
    }
    const chemin = `${organisation.id}/${id}.pdf`;
    return executer(async () => {
      const envoiFichier = await supabase.storage
        .from('notices')
        .upload(chemin, fichier, { upsert: true, contentType: 'application/pdf' });
      if (envoiFichier.error) return envoiFichier.error;
      return (await supabase.from('articles').update({ notice_chemin: chemin }).eq('id', id)).error;
    }, 'Notice enregistrée.');
  }

  async function ouvrirNotice() {
    const { data, error } = await supabase.storage.from('notices').createSignedUrl(article.notice_chemin, 300);
    if (error) setMessage({ type: 'erreur', texte: messageErreur(error) });
    else window.open(data.signedUrl, '_blank', 'noopener');
  }

  function basculerActivation() {
    const actif = !article.actif;
    return executer(
      async () => (await supabase.from('articles').update({ actif }).eq('id', id)).error,
      actif ? 'Article activé.' : 'Article désactivé.',
    );
  }

  if (!article) {
    return <section className="carte">{message ? <p className={`message message-${message.type}`}>{message.texte}</p> : 'Chargement…'}</section>;
  }

  const limitesEnregistrees = Object.values(limites).filter((l) => l.id).length;
  // Règle de l'organisation (Paramètres → Organisation) ; la base la revérifie.
  const tousTraitements = organisation.reglages?.activation_limites === 'tous_traitements';
  const sansLimite = traitements.filter((t) => t.actif && !limites[t.id]?.id);
  const conditions = [
    { ok: !!article.notice_chemin, texte: 'Notice fabricant jointe' },
    tousTraitements
      ? {
          ok: sansLimite.length === 0,
          texte: sansLimite.length
            ? `Une limite pour chaque traitement actif — manquante : ${sansLimite.map((t) => t.libelle).join(', ')}`
            : 'Une limite pour chaque traitement actif',
        }
      : { ok: limitesEnregistrees > 0, texte: 'Au moins une limite de traitement enregistrée' },
  ];

  return (
    <section className="pile">
      <p>
        <Link to="/parametres/articles">← Articles</Link>
      </p>

      {message && <p className={`message message-${message.type}`}>{message.texte}</p>}

      <div className="carte">
        <h1>
          {article.designation} {article.actif ? <span className="badge badge-ok">Actif</span> : <span className="badge">Inactif</span>}
        </h1>
        <ul className="conditions">
          {conditions.map((c) => (
            <li key={c.texte} className={c.ok ? 'ok' : 'manquant'}>
              {c.ok ? '✓' : '✗'} {c.texte}
            </li>
          ))}
        </ul>
        {estAdmin && (
          <button
            type="button"
            className={`bouton ${article.actif ? '' : 'bouton-principal'}`}
            onClick={basculerActivation}
            disabled={envoi || (!article.actif && conditions.some((c) => !c.ok))}
          >
            {article.actif ? 'Désactiver' : 'Activer l’article'}
          </button>
        )}
      </div>

      <form className="carte formulaire" onSubmit={enregistrerFiche}>
        <h2>Fiche</h2>
        {CHAMPS.map((c) => (
          <Champ
            key={c.nom}
            champ={c}
            valeur={valeurs[c.nom]}
            desactive={!estAdmin}
            onChange={(v) => setValeurs((x) => ({ ...x, [c.nom]: v }))}
          />
        ))}
        {estAdmin && (
          <button type="submit" className="bouton bouton-principal" disabled={envoi}>
            Enregistrer la fiche
          </button>
        )}
      </form>

      <form className="carte formulaire" onSubmit={enregistrerLimites}>
        <h2>Limites par traitement</h2>
        <p className="texte-secondaire">
          Nombre maximal de passages selon la notice du fabricant. Laisser vide si le traitement ne s’applique pas.
          Le seuil d’alerte déclenche « fin de vie proche ».
        </p>
        <table className="tableau-limites">
          <thead>
            <tr>
              <th>Traitement</th>
              <th>Limite</th>
              <th>Alerte à (%)</th>
            </tr>
          </thead>
          <tbody>
            {traitements.map((t) => {
              const l = limites[t.id] ?? {};
              const maj = (champ, v) => setLimites((x) => ({ ...x, [t.id]: { ...l, [champ]: v } }));
              return (
                <tr key={t.id} className={t.actif ? '' : 'inactif'}>
                  <th scope="row">{t.libelle}</th>
                  <td>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      aria-label={`Limite ${t.libelle}`}
                      value={l.limite ?? ''}
                      disabled={!estAdmin}
                      onChange={(e) => maj('limite', e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="100"
                      aria-label={`Seuil d'alerte ${t.libelle}`}
                      value={l.seuil_alerte_pct ?? 80}
                      disabled={!estAdmin || !l.limite}
                      onChange={(e) => maj('seuil_alerte_pct', e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {estAdmin && (
          <button type="submit" className="bouton bouton-principal" disabled={envoi}>
            Enregistrer les limites
          </button>
        )}
      </form>

      <div className="carte">
        <h2>Notice fabricant</h2>
        {article.notice_chemin ? (
          <button type="button" className="bouton" onClick={ouvrirNotice}>
            Ouvrir la notice (PDF)
          </button>
        ) : (
          <p className="texte-secondaire">Aucune notice jointe.</p>
        )}
        {estAdmin && (
          <label className="bouton">
            {article.notice_chemin ? 'Remplacer la notice' : 'Joindre la notice (PDF)'}
            <input type="file" accept="application/pdf" onChange={televerserNotice} hidden disabled={envoi} />
          </label>
        )}
      </div>
    </section>
  );
}
