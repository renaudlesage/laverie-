import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { ETAT_NIVEAU, TYPES_ALERTE } from '../lib/libelles.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useEnLigne } from '../connexion/useConnexion.js';
import { abonnerChangements } from '../hors-ligne/synchro.js';

const GROUPES = { fin_de_vie: ['seuil_atteint', 'age_maximal'] };
const ACQUITTENT = ['admin', 'gestionnaire', 'operateur_laverie'];
const date = (iso) => new Date(iso).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' });

function codeVetement(v) {
  return v?.identifiants?.find((i) => i.actif)?.valeur ?? v?.numero_serie ?? v?.id?.slice(0, 8) ?? '';
}

// Alertes ouvertes (et récemment fermées), filtrables par type ; acquittement par les rôles opérationnels.
export default function Alertes() {
  const { utilisateur } = useAuth();
  const { organisation, role } = useOrganisation();
  const enLigne = useEnLigne();
  const [parametres, setParametres] = useSearchParams();
  const [alertes, setAlertes] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [fermees, setFermees] = useState(false);
  const type = parametres.get('type');
  const groupe = parametres.get('groupe');
  const types = groupe ? GROUPES[groupe] : type ? [type] : null;

  const charger = useCallback(async () => {
    let q = supabase
      .from('alertes')
      .select('id, type, niveau, message, ouverte_le, close_le, close_par, vetement:vetements(id, numero_serie, statut, article:articles(designation), identifiants(valeur, actif))')
      .eq('organisation_id', organisation.id)
      .order('ouverte_le', { ascending: false })
      .limit(300);
    if (types) q = q.in('type', types);
    q = fermees ? q.gte('ouverte_le', new Date(Date.now() - 30 * 86400000).toISOString()) : q.is('close_le', null);
    const { data, error } = await q;
    setErreur(error);
    setAlertes(data ?? []);
  }, [organisation.id, fermees, types?.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enLigne) return undefined;
    charger();
    let minuterie = null;
    const arret = abonnerChangements((table) => {
      if (table !== 'alertes') return;
      clearTimeout(minuterie);
      minuterie = setTimeout(charger, 800);
    });
    return () => {
      clearTimeout(minuterie);
      arret();
    };
  }, [charger, enLigne]);

  async function acquitter(a) {
    const { error } = await supabase
      .from('alertes')
      .update({ close_le: new Date().toISOString(), close_par: utilisateur.id })
      .eq('id', a.id);
    if (error) setErreur(error);
    else charger();
  }

  const filtre = (valeur) => setParametres(valeur ? { type: valeur } : {});

  return (
    <section className="pile">
      <p>
        <Link to="/">← Accueil</Link>
      </p>
      <h1>Alertes</h1>
      {!enLigne && <p className="message">Les alertes se consultent en ligne.</p>}

      <div className="filtres" role="group" aria-label="Type d’alerte">
        <button type="button" className={`bouton ${!types ? 'bouton-principal' : ''}`} onClick={() => filtre(null)}>
          Toutes
        </button>
        {Object.entries(TYPES_ALERTE).map(([t, l]) => (
          <button key={t} type="button" className={`bouton ${types?.length === 1 && types[0] === t ? 'bouton-principal' : ''}`} onClick={() => filtre(t)}>
            {l}
          </button>
        ))}
      </div>
      <label className="champ-case">
        <input type="checkbox" checked={fermees} onChange={(e) => setFermees(e.target.checked)} />
        <span>Afficher aussi les alertes fermées (30 derniers jours)</span>
      </label>

      {erreur && <p className="message message-erreur">{messageErreur(erreur)}</p>}
      {alertes?.length === 0 && <p className="texte-secondaire">Aucune alerte.</p>}
      <ul className="liste">
        {alertes?.map((a) => (
          <li key={a.id} className={`carte alerte etat-${a.close_le ? 'froid' : ETAT_NIVEAU[a.niveau]}`}>
            <p className="statut-ligne">
              <span className={`jeton-etat etat-${a.close_le ? 'froid' : ETAT_NIVEAU[a.niveau]}`}>{TYPES_ALERTE[a.type] ?? a.type}</span>
              {a.close_le && <span className="badge">{a.close_par ? 'Acquittée' : 'Résolue'}</span>}
            </p>
            <p className="sans-marge">{a.message}</p>
            {a.vetement && (
              <p className="sans-marge">
                <Link to={`/vetements/${a.vetement.id}`}>
                  {a.vetement.article?.designation} <span className="mono">{codeVetement(a.vetement)}</span>
                </Link>
              </p>
            )}
            <p className="texte-secondaire mono sans-marge">
              {date(a.ouverte_le)}
              {a.close_le && ` → ${date(a.close_le)}`}
            </p>
            {!a.close_le && ACQUITTENT.includes(role) && (
              <div className="rangee-actions">
                <button type="button" className="bouton" onClick={() => acquitter(a)}>
                  Acquitter
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="texte-secondaire">
        Une alerte se ferme d’elle-même quand sa cause disparaît (réforme, tag remplacé, retour du vêtement…). Acquittée, elle ne se rouvre pas pour la même cause.
      </p>
    </section>
  );
}
