import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { ETAT_STATUT, STATUTS_VETEMENT, TECHNOLOGIES } from '../lib/libelles.js';
import { useDroits } from '../organisation/useDroits.js';

// Fiche vêtement (M3 : identité, statut, compteurs, identifiants).
// L'historique, les actions selon le statut et l'export arrivent au jalon M5.
export default function FicheVetement() {
  const { id } = useParams();
  const { voitNoms } = useDroits();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      const v = await supabase
        .from('vetements')
        .select('*, article:articles(id, designation, fabricant, reference, duree_vie_mois), site:sites(nom)')
        .eq('id', id)
        .maybeSingle();
      if (v.error || !v.data) {
        if (!annule) setErreur(v.error ? messageErreur(v.error) : 'Vêtement introuvable ou non accessible.');
        return;
      }
      const [compteurs, limitesArticle, limitesVetement, identifiants, traitements, porteur] = await Promise.all([
        supabase.from('compteurs').select('traitement_id, passages').eq('vetement_id', id),
        supabase.from('articles_limites').select('traitement_id, limite, seuil_alerte_pct').eq('article_id', v.data.article_id),
        supabase.from('vetements_limites').select('traitement_id, limite').eq('vetement_id', id),
        supabase.from('identifiants').select('*').eq('vetement_id', id).order('pose_le', { ascending: false }),
        supabase.from('traitements').select('id, libelle').eq('organisation_id', v.data.organisation_id).order('cree_le'),
        v.data.porteur_id
          ? supabase
              .from(voitNoms ? 'porteurs' : 'porteurs_anonymises')
              .select(voitNoms ? 'matricule, nom, prenom, casier' : 'matricule, casier')
              .eq('id', v.data.porteur_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (annule) return;
      setDonnees({
        vetement: v.data,
        compteurs: compteurs.data ?? [],
        limitesArticle: limitesArticle.data ?? [],
        limitesVetement: limitesVetement.data ?? [],
        identifiants: identifiants.data ?? [],
        traitements: traitements.data ?? [],
        porteur: porteur.data,
      });
    })();
    return () => {
      annule = true;
    };
  }, [id, voitNoms]);

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
  const passages = Object.fromEntries(donnees.compteurs.map((c) => [c.traitement_id, c.passages]));
  const limites = Object.fromEntries(donnees.limitesArticle.map((l) => [l.traitement_id, l]));
  for (const l of donnees.limitesVetement) limites[l.traitement_id] = { ...limites[l.traitement_id], limite: l.limite, surcharge: true };
  const lignes = donnees.traitements
    .filter((t) => limites[t.id] || passages[t.id])
    .map((t) => {
      const l = limites[t.id];
      const n = passages[t.id] ?? 0;
      const etat = !l ? '' : n >= l.limite ? 'chaud' : n >= (l.limite * (l.seuil_alerte_pct ?? 80)) / 100 ? 'veille' : 'ok';
      return { t, l, n, etat };
    });

  return (
    <section className="pile">
      <p>
        <Link to="/scan">← Scanner</Link>
      </p>

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
        <ul className="liste">
          {donnees.identifiants.map((i) => (
            <li key={i.id} className="ligne-liste ligne-statique">
              <span className="ligne-titre">
                <span className="mono">{i.valeur}</span>
                {!i.actif && <span className="badge">Retiré</span>}
              </span>
              <span className="ligne-detail">
                {TECHNOLOGIES[i.technologie]} · posé le {new Date(i.pose_le).toLocaleDateString('fr-BE')}
                {i.actif && ` · ${i.passages_depuis_pose} passage(s) depuis la pose`}
                {i.motif_retrait && ` · ${i.motif_retrait}`}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="texte-secondaire">Historique et actions (attribution, contamination, réforme…) : jalon M5.</p>
    </section>
  );
}
