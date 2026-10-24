import { useState } from 'react';
import { STATUTS_VETEMENT, TECHNOLOGIES } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Scanner from './Scanner.jsx';
import { signaler } from './retour.js';
import { traiterLecture } from './traiterLecture.js';

// Mode rafale : liste dédupliquée en direct, compteurs lus / attendus / inconnus, validation groupée.
//   attendus : identifiants de vêtements attendus (bordereau d'un sac), facultatif
//   onValider({ lus, inconnus }) : validation groupée, fournie par l'écran appelant. Renvoie la liste
//   des vêtements refusés (identifiants) : eux seuls restent affichés ; ou false pour tout garder.
export default function Rafale({ attendus = null, onValider, libelleValider = 'Valider', contexte }) {
  const { organisation } = useOrganisation();
  const [lus, setLus] = useState([]); // [{ vetementId, vetement, lecture }]
  const [inconnus, setInconnus] = useState([]); // [{ cle, lecture }]
  const [enCours, setEnCours] = useState(0);
  const [erreur, setErreur] = useState(null);

  async function recevoir(lecture) {
    setEnCours((n) => n + 1);
    const r = await traiterLecture(lecture, { organisationId: organisation.id, contexte: { mode: 'rafale', ...contexte } });
    setEnCours((n) => n - 1);
    if (r.statut === 'erreur') {
      setErreur('Résolution impossible : vérifiez la connexion.');
      return;
    }
    setErreur(null);
    if (r.statut === 'trouve') {
      const c = r.correspondances[0];
      setLus((l) => (l.some((x) => x.vetementId === r.vetementId) ? l : [{ vetementId: r.vetementId, vetement: c.vetement, lecture }, ...l]));
    } else if (r.statut === 'inconnu' || r.statut === 'ambigu') {
      const cle = `${lecture.technologie ?? '?'}|${lecture.valeur}`;
      setInconnus((l) => (l.some((x) => x.cle === cle) ? l : [{ cle, lecture, ambigu: r.statut === 'ambigu' }, ...l]));
    }
  }

  const attendusSet = attendus ? new Set(attendus) : null;
  const manquants = attendusSet ? [...attendusSet].filter((id) => !lus.some((l) => l.vetementId === id)).length : null;

  function retirer(vetementId) {
    setLus((l) => l.filter((x) => x.vetementId !== vetementId));
  }

  async function valider() {
    if (!onValider) return;
    const refuses = await onValider({ lus, inconnus });
    if (refuses === false) return;
    const garder = Array.isArray(refuses) ? refuses : [];
    signaler(garder.length ? 'erreur' : 'trouve');
    setLus((l) => l.filter((x) => garder.includes(x.vetementId)));
    setInconnus([]);
  }

  return (
    <div className="rafale">
      <Scanner onLecture={recevoir} />

      <ul className="compteurs-rafale" aria-live="polite">
        <li>
          <span className="etiquette">Lus</span>
          <strong>{lus.length}</strong>
        </li>
        <li>
          <span className="etiquette">Attendus</span>
          <strong>{attendusSet ? attendusSet.size : '—'}</strong>
        </li>
        <li className={inconnus.length ? 'etat-veille' : ''}>
          <span className="etiquette">Inconnus</span>
          <strong>{inconnus.length}</strong>
        </li>
        {manquants !== null && (
          <li className={manquants ? 'etat-chaud' : 'etat-ok'}>
            <span className="etiquette">Manquants</span>
            <strong>{manquants}</strong>
          </li>
        )}
      </ul>
      {enCours > 0 && <p className="texte-secondaire">Résolution en cours…</p>}
      {erreur && <p className="message message-erreur">{erreur}</p>}

      {inconnus.length > 0 && (
        <ul className="liste">
          {inconnus.map((i) => (
            <li key={i.cle} className="ligne-liste ligne-statique ligne-inconnue">
              <span className="ligne-titre">
                <span className="mono">{i.lecture.valeur}</span>
                <span className="badge badge-veille">{i.ambigu ? 'Ambigu' : 'Inconnu'}</span>
              </span>
              <span className="ligne-detail">{TECHNOLOGIES[i.lecture.technologie] ?? 'Technologie non précisée'}</span>
            </li>
          ))}
        </ul>
      )}

      <ul className="liste">
        {lus.map((l) => (
          <li key={l.vetementId} className="ligne-liste ligne-statique">
            <span className="ligne-titre">
              {l.vetement?.article?.designation ?? 'Vêtement'}
              {attendusSet && !attendusSet.has(l.vetementId) && <span className="badge badge-veille">En trop</span>}
            </span>
            <span className="ligne-detail">
              <span className="mono">{l.lecture.valeur}</span>
              {' · '}
              {STATUTS_VETEMENT[l.vetement?.statut] ?? ''}
              {l.vetement?.taille ? ` · taille ${l.vetement.taille}` : ''}
            </span>
            <button type="button" className="bouton bouton-discret" onClick={() => retirer(l.vetementId)}>
              Retirer
            </button>
          </li>
        ))}
      </ul>

      {onValider ? (
        <button type="button" className="bouton bouton-principal bouton-large" disabled={lus.length === 0} onClick={valider}>
          {libelleValider} ({lus.length})
        </button>
      ) : (
        lus.length + inconnus.length > 0 && (
          <button
            type="button"
            className="bouton"
            onClick={() => {
              setLus([]);
              setInconnus([]);
            }}
          >
            Vider la liste
          </button>
        )
      )}
    </div>
  );
}
