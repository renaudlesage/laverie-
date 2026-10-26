import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import { useLignes } from '../referentiels/useLignes.js';
import { emettre, evenement } from '../journal/journal.js';
import Icone from '../composants/Icone.jsx';

// Actions possibles selon le statut (docs/CONCEPT.md §5). La base revérifie tout à l'ingestion.
const ACTIONS = {
  attribution: { libelle: 'Attribuer', depuis: ['en_stock'], droit: 'enrole' },
  restitution: { libelle: 'Restituer', depuis: ['en_service'], droit: 'enrole' },
  contamination: { libelle: 'Déclarer contaminé', depuis: ['en_service', 'en_stock', 'collecte', 'en_laverie'], droit: 'contamination', danger: true },
  retrouve: { libelle: 'Retrouvé', depuis: ['perdu'], droit: 'enrole' },
  perte: {
    libelle: 'Déclarer perdu',
    depuis: ['en_stock', 'en_service', 'a_decontaminer', 'collecte', 'en_laverie', 'en_traitement', 'traite', 'a_reparer', 'pret'],
    droit: 'enrole',
  },
  reforme: {
    libelle: 'Réformer',
    depuis: ['en_stock', 'en_service', 'a_decontaminer', 'collecte', 'en_laverie', 'en_traitement', 'traite', 'a_reparer', 'pret', 'perdu'],
    droit: 'enrole',
    danger: true,
  },
};

const MOTIFS_REFORME = ['Fin de vie (limite atteinte)', 'Âge maximal dépassé', 'Déchirure', 'Brûlure', 'Contamination non traitable', 'Taille inadaptée'];

function ChoixPorteur({ valeur, onChange }) {
  const { organisation } = useOrganisation();
  const [porteurs, setPorteurs] = useState([]);
  const [filtre, setFiltre] = useState('');
  useEffect(() => {
    supabase
      .from('porteurs')
      .select('id, matricule, nom, prenom, casier, site_id')
      .eq('organisation_id', organisation.id)
      .eq('actif', true)
      .order('matricule')
      .then(({ data }) => setPorteurs(data ?? []));
  }, [organisation.id]);
  const f = filtre.trim().toLowerCase();
  const visibles = porteurs
    .filter((p) => !f || [p.matricule, p.nom, p.prenom].some((x) => x?.toLowerCase().includes(f)))
    .slice(0, 8);
  return (
    <div className="choix-porteur">
      <label>
        <span>
          Porteur<span className="requis"> *</span>
        </span>
        <input placeholder="Matricule ou nom" value={filtre} onChange={(e) => setFiltre(e.target.value)} />
      </label>
      <ul className="liste">
        {visibles.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`ligne-liste ${valeur?.id === p.id ? 'selection' : ''}`}
              aria-pressed={valeur?.id === p.id}
              onClick={() => onChange(p)}
            >
              <span className="ligne-titre">
                <span className="mono">{p.matricule}</span> {[p.prenom, p.nom].filter(Boolean).join(' ')}
              </span>
              {p.casier && <span className="ligne-detail">Casier {p.casier}</span>}
            </button>
          </li>
        ))}
      </ul>
      {porteurs.length > 0 && visibles.length === 0 && <p className="texte-secondaire">Aucun porteur ne correspond.</p>}
    </div>
  );
}

export default function ActionsVetement({ vetement, onFait }) {
  const { organisation } = useOrganisation();
  const droits = useDroits();
  const { lignes: sites } = useLignes('sites', { ordre: 'nom', active: droits.enrole });
  const [action, setAction] = useState(null);
  const [porteur, setPorteur] = useState(null);
  const [site, setSite] = useState('');
  const [motif, setMotif] = useState('');
  const [motifLibre, setMotifLibre] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState(null);

  const permis = (a) =>
    a.droit === 'contamination' ? droits.enrole || droits.laverie : droits[a.droit];
  const possibles = Object.entries(ACTIONS).filter(
    ([type, a]) => a.depuis.includes(vetement.statut) && permis(a) && !(type === 'contamination' && vetement.contamine),
  );
  if (possibles.length === 0) return null;

  function ouvrir(type) {
    setAction(type);
    setPorteur(null);
    setSite(vetement.site_id ?? '');
    setMotif('');
    setMotifLibre('');
    setMessage(null);
  }

  const motifRetenu = motif === 'Autre' ? motifLibre.trim() : motif;
  const pret =
    action === 'attribution' ? !!porteur : action === 'reforme' ? !!motifRetenu : true;

  async function valider() {
    const donnees = {};
    let siteId = site || null;
    if (action === 'attribution') {
      donnees.porteur_id = porteur.id;
      siteId = porteur.site_id ?? siteId;
    }
    if (action === 'reforme' || action === 'perte') {
      if (motifRetenu) donnees.motif = motifRetenu;
    }
    setEnvoi(true);
    try {
      const [r] = await emettre(organisation.id, [evenement(action, vetement.id, { donnees, siteId })]);
      if (r.statut === 'rejete') {
        setMessage({ type: 'erreur', texte: r.motif });
        return;
      }
      setAction(null);
      onFait(`${ACTIONS[action].libelle} : enregistré.`);
    } catch (e) {
      setMessage({ type: 'erreur', texte: messageErreur(e) });
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="carte">
      <h2>Actions</h2>
      {!action ? (
        <div className="grille-actions">
          {possibles.map(([type, a]) => (
            <button key={type} type="button" className={`bouton ${a.danger ? 'bouton-danger' : ''}`} onClick={() => ouvrir(type)}>
              <Icone nom={type} />
              {a.libelle}
            </button>
          ))}
        </div>
      ) : (
        <div className="formulaire">
          <h3>{ACTIONS[action].libelle}</h3>
          {action === 'attribution' && <ChoixPorteur valeur={porteur} onChange={setPorteur} />}
          {['restitution', 'retrouve'].includes(action) && (
            <label>
              <span>Site</span>
              <select value={site} onChange={(e) => setSite(e.target.value)}>
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
          )}
          {action === 'contamination' && (
            <p className="message message-veille">
              Le vêtement passe en circuit contaminé : sac et lot dédiés, contrôle renforcé avant tout retour en service. Le numéro
              d’intervention n’est pas enregistré.
            </p>
          )}
          {(action === 'reforme' || action === 'perte') && (
            <>
              <label>
                <span>
                  Motif{action === 'reforme' && <span className="requis"> *</span>}
                </span>
                <select value={motif} onChange={(e) => setMotif(e.target.value)}>
                  <option value="">{action === 'reforme' ? 'Choisir…' : '—'}</option>
                  {(action === 'reforme' ? MOTIFS_REFORME : []).map((m) => (
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
              {action === 'reforme' && (
                <p className="texte-secondaire">
                  Sortie définitive : les identifiants sont désactivés, l’historique est conservé. Une réforme saisie par erreur s’annule depuis l’historique.
                </p>
              )}
            </>
          )}
          {message && <p className={`message message-${message.type}`}>{message.texte}</p>}
          <div className="rangee-actions">
            <button
              type="button"
              className={`bouton ${ACTIONS[action].danger ? 'bouton-danger' : 'bouton-principal'}`}
              disabled={!pret || envoi}
              onClick={valider}
            >
              {envoi ? 'Envoi…' : `Confirmer : ${ACTIONS[action].libelle.toLowerCase()}`}
            </button>
            <button type="button" className="bouton" onClick={() => setAction(null)} disabled={envoi}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
