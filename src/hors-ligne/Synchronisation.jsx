import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useSynchro } from '../connexion/useConnexion.js';
import { LIBELLES_EVENEMENTS } from '../vetements/Historique.jsx';
import { codeVisible } from '../laverie/donnees.js';
import { base } from './base.js';
import { enrichir, useLocal } from './local.js';
import { classer, reessayer, synchroniser } from './synchro.js';
import { motifLisible } from './motifs.js';

export const LIBELLES_OPERATIONS = {
  ouvrir_sac: 'Ouverture d’une tournée de collecte',
  expedier_sac: 'Expédition d’un sac',
  receptionner_sac: 'Réception d’un sac',
  ouvrir_lot: 'Ouverture d’un lot',
  cloturer_lot: 'Clôture d’un lot',
  avorter_lot: 'Lot avorté',
};

const heure = (iso) => (iso ? new Date(iso).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'medium' }) : '—');

// Explication en clair des refus les plus fréquents après un travail hors ligne.
export function explication(conflit) {
  const m = conflit.motif ?? '';
  if (/« (ajout_lot|traitement) » depuis le statut « (traite|en_traitement|pret|a_reparer) »/.test(m)) {
    return 'Ce vêtement a été mis dans un autre lot ou traité depuis un autre appareil. Il n’est compté qu’une fois : rien à refaire, sauf erreur de tri.';
  }
  if (/depuis le statut/.test(m)) {
    return 'Le statut du vêtement a changé sur un autre appareil avant l’envoi de cette action. Vérifiez la fiche, puis refaites l’action si elle est toujours utile.';
  }
  if (/Mélange de circuits/.test(m)) return 'Circuits séparés : le vêtement n’a pas été accepté. Triez-le vers le bon sac ou le bon lot.';
  if (/pas été expédié/.test(m)) {
    return 'Le sac n’était pas (ou plus) en route vers une laverie au moment de l’envoi.';
  }
  return 'La base a refusé cette action. Corrigez si nécessaire, puis réessayez ou classez.';
}

function Conflit({ conflit, enLigne }) {
  const [envoi, setEnvoi] = useState(false);
  const c = conflit.charge;
  const vetement = useLocal(async () => {
    if (!c.vetement_id) return null;
    const v = await base.vetements.get(c.vetement_id);
    return v ? (await enrichir([v]))[0] : null;
  }, [c.vetement_id]);
  const libelle = conflit.genre === 'operation' ? LIBELLES_OPERATIONS[c.type] : LIBELLES_EVENEMENTS[c.type];

  async function agir(action) {
    setEnvoi(true);
    try {
      await action(conflit);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <li className="carte conflit">
      <p className="etiquette">
        {libelle ?? c.type} · {heure(c.survenu_le)}
      </p>
      {c.vetement_id && (
        <p className="sans-marge">
          {vetement ? `${vetement.article.designation} ` : 'Vêtement '}
          <span className="mono">{vetement ? codeVisible(vetement) : c.vetement_id.slice(0, 8)}</span>
          {enLigne && (
            <>
              {' · '}
              <Link to={`/vetements/${c.vetement_id}`}>Fiche</Link>
            </>
          )}
        </p>
      )}
      <p className="message message-erreur sans-marge">{motifLisible(conflit.motif)}</p>
      <p className="texte-secondaire">{explication(conflit)}</p>
      <div className="rangee-actions">
        <button type="button" className="bouton" disabled={envoi || !enLigne} onClick={() => agir(reessayer)}>
          Réessayer
        </button>
        <button type="button" className="bouton bouton-discret" disabled={envoi} onClick={() => agir(classer)}>
          Classer
        </button>
      </div>
    </li>
  );
}

// État de la synchronisation et conflits à résoudre (écritures refusées par la base après coup).
export default function Synchronisation() {
  const { utilisateur } = useAuth();
  const { organisation } = useOrganisation();
  const { enLigne, enAttente, tracesEnAttente, enCours, derniereSynchro, erreur, pret } = useSynchro();
  const cle = [utilisateur.id, organisation.id];
  const conflits = useLocal(() => base.conflits.where('[utilisateur_id+organisation_id]').equals(cle).reverse().sortBy('n'), [cle.join()], []);
  const file = useLocal(() => base.file.where('[utilisateur_id+organisation_id]').equals(cle).toArray(), [cle.join()], []);
  const index = useLocal(() => base.vetements.where('organisation_id').equals(organisation.id).count(), [organisation.id], 0);
  const parGenre = file.reduce((acc, i) => ({ ...acc, [i.genre]: (acc[i.genre] ?? 0) + 1 }), {});

  return (
    <section className="pile">
      <h1>Synchronisation</h1>
      <div className="carte">
        <dl className="proprietes">
          <dt>Connexion</dt>
          <dd>{enLigne ? 'En ligne' : 'Hors ligne'}</dd>
          <dt>En attente d’envoi</dt>
          <dd>
            {enAttente + tracesEnAttente === 0
              ? 'Rien'
              : [
                  parGenre.evenement && `${parGenre.evenement} événement(s)`,
                  parGenre.operation && `${parGenre.operation} opération(s) de lot`,
                  parGenre.lecture && `${parGenre.lecture} lecture(s)`,
                  parGenre.signalement && `${parGenre.signalement} alerte(s) de circuits`,
                ]
                  .filter(Boolean)
                  .join(', ')}
          </dd>
          <dt>Dernière synchronisation</dt>
          <dd className="mono">{heure(derniereSynchro)}</dd>
          <dt>Vêtements sur cet appareil</dt>
          <dd className="mono">{pret ? index : 'index en préparation…'}</dd>
        </dl>
        {erreur && enLigne && <p className="message message-erreur">Dernier envoi interrompu : {erreur}</p>}
        <button type="button" className="bouton bouton-principal" disabled={!enLigne || enCours} onClick={() => synchroniser()}>
          {enCours ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
        {!enLigne && (
          <p className="texte-secondaire">
            Hors ligne, le travail continue : les actions sont enregistrées sur l’appareil et partiront au retour du réseau.
          </p>
        )}
      </div>

      <h2>Conflits à résoudre ({conflits.length})</h2>
      {conflits.length === 0 ? (
        <p className="texte-secondaire">Aucun conflit : toutes les actions envoyées ont été acceptées.</p>
      ) : (
        <ul className="liste pile">
          {conflits.map((c) => (
            <Conflit key={c.n} conflit={c} enLigne={enLigne} />
          ))}
        </ul>
      )}
    </section>
  );
}
