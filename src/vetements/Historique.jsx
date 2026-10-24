import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { TECHNOLOGIES } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import { emettre, evenement } from '../journal/journal.js';

export const LIBELLES_EVENEMENTS = {
  enrolement: 'Enrôlement',
  tag_pose: 'Identifiant posé',
  tag_retire: 'Identifiant retiré',
  attribution: 'Attribution',
  restitution: 'Restitution',
  contamination: 'Contamination déclarée',
  collecte: 'Collecte',
  reception: 'Réception en laverie',
  ajout_lot: 'Ajout à un lot',
  retrait_lot: 'Retrait d’un lot',
  traitement: 'Traitement',
  controle: 'Contrôle',
  reparation: 'Réparation',
  livraison: 'Livraison',
  vu_en_inventaire: 'Vu en inventaire',
  perte: 'Déclaré perdu',
  retrouve: 'Retrouvé',
  reforme: 'Réforme',
  annulation: 'Annulation',
};

const VERDICTS = { conforme: 'conforme', a_reparer: 'à réparer', reforme: 'à réformer' };
const NON_ANNULABLES = ['enrolement', 'tag_pose', 'tag_retire', 'annulation'];

// Événements d'un même instant (une même opération) : ordre logique de l'opération.
const RANG = { enrolement: 0, tag_retire: 1, tag_pose: 2 };
function chronologieInverse(a, b) {
  const t = new Date(b.survenu_le) - new Date(a.survenu_le);
  return t || (RANG[b.type] ?? 1) - (RANG[a.type] ?? 1) || b.numero - a.numero;
}

export function detailEvenement(e, porteurs = {}) {
  const d = e.donnees ?? {};
  switch (e.type) {
    case 'tag_pose':
      return `${TECHNOLOGIES[d.technologie] ?? ''} ${d.valeur ?? ''}`;
    case 'tag_retire':
      return `${TECHNOLOGIES[d.technologie] ?? ''} ${d.valeur ?? ''} — ${d.motif ?? ''}`;
    case 'attribution':
      return porteurs[d.porteur_id] ? `Porteur ${porteurs[d.porteur_id]}` : 'Porteur attribué';
    case 'controle':
      return `Verdict : ${VERDICTS[d.verdict] ?? d.verdict}${d.renforce ? ' (contrôle renforcé)' : ''}`;
    case 'perte':
    case 'reforme':
      return d.motif ?? '';
    case 'annulation':
      return `Annule : ${LIBELLES_EVENEMENTS[d.type_annule] ?? 'événement'} — ${d.motif ?? ''}`;
    default:
      return '';
  }
}

// Journal du vêtement, du plus récent au plus ancien. Le journal ne se modifie pas :
// une erreur se corrige en annulant le dernier événement, avec un motif.
export default function Historique({ vetementId, version, onChange }) {
  const { organisation } = useOrganisation();
  const { enrole } = useDroits();
  const [evenements, setEvenements] = useState(null);
  const [porteurs, setPorteurs] = useState({});
  const [erreur, setErreur] = useState(null);
  const [aAnnuler, setAAnnuler] = useState(null);
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      const { data, error } = await supabase
        .from('evenements')
        .select('id, numero, type, survenu_le, source, donnees, annule_par, site:sites(nom)')
        .eq('vetement_id', vetementId)
        .order('numero', { ascending: false });
      if (annule) return;
      setErreur(error);
      const liste = (data ?? []).sort(chronologieInverse);
      setEvenements(liste);
      const ids = [...new Set(liste.map((e) => e.donnees?.porteur_id).filter(Boolean))];
      if (ids.length) {
        const r = await supabase.from('porteurs_anonymises').select('id, matricule').in('id', ids);
        if (!annule) setPorteurs(Object.fromEntries((r.data ?? []).map((p) => [p.id, p.matricule])));
      }
    })();
    return () => {
      annule = true;
    };
  }, [vetementId, version]);

  // Seul le dernier événement de statut non annulé s'annule (règle de la base).
  const annulable = evenements
    ?.filter((e) => !e.annule_par && !NON_ANNULABLES.includes(e.type))
    .reduce((dernier, e) => (!dernier || e.numero > dernier.numero ? e : dernier), null);

  async function annuler() {
    setEnvoi(true);
    setErreur(null);
    try {
      const [r] = await emettre(organisation.id, [
        evenement('annulation', vetementId, { donnees: { evenement_id: aAnnuler.id, motif: motif.trim() } }),
      ]);
      if (r.statut === 'rejete') setErreur({ message: r.motif });
      else {
        setAAnnuler(null);
        onChange?.(`Événement annulé : ${LIBELLES_EVENEMENTS[aAnnuler.type]}.`);
      }
    } catch (e) {
      setErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="carte">
      <h2>Historique</h2>
      {erreur && <p className="message message-erreur">{messageErreur(erreur)}</p>}
      {evenements?.length === 0 && <p className="texte-secondaire">Aucun événement visible.</p>}
      <ol className="historique">
        {evenements?.map((e) => (
          <li key={e.id} className={e.annule_par ? 'annule' : ''}>
            <span className="mono historique-date">
              {new Date(e.survenu_le).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
            <span className="historique-type">
              {LIBELLES_EVENEMENTS[e.type] ?? e.type}
              {e.source !== 'app' && <span className="badge">{e.source}</span>}
              {e.annule_par && <span className="badge">Annulé</span>}
            </span>
            {(detailEvenement(e, porteurs) || e.site) && (
              <span className="historique-detail">{[detailEvenement(e, porteurs), e.site?.nom].filter(Boolean).join(' · ')}</span>
            )}
            {enrole && annulable?.id === e.id && aAnnuler?.id !== e.id && (
              <button
                type="button"
                className="bouton bouton-discret historique-annuler"
                onClick={() => {
                  setAAnnuler(e);
                  setMotif('');
                }}
              >
                Annuler
              </button>
            )}
            {aAnnuler?.id === e.id && (
              <div className="historique-annulation formulaire">
                <label>
                  <span>
                    Motif de l’annulation<span className="requis"> *</span>
                  </span>
                  <input value={motif} onChange={(ev) => setMotif(ev.target.value)} placeholder="Ex. : mauvais vêtement scanné" />
                </label>
                <div className="rangee-actions">
                  <button type="button" className="bouton bouton-danger" disabled={!motif.trim() || envoi} onClick={annuler}>
                    Annuler l’événement
                  </button>
                  <button type="button" className="bouton" onClick={() => setAAnnuler(null)} disabled={envoi}>
                    Retour
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      {enrole && <p className="texte-secondaire">Une erreur se corrige en annulant le dernier événement ; l’historique garde la trace.</p>}
    </div>
  );
}
