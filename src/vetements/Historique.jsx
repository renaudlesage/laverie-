import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { TECHNOLOGIES } from '../lib/libelles.js';

const LIBELLES = {
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

const SOURCES = { import: 'import', passerelle: 'passerelle' };

// Événements d'un même instant (une même opération) : ordre logique de l'opération.
const RANG = { enrolement: 0, tag_retire: 1, tag_pose: 2 };
function chronologieInverse(a, b) {
  const t = new Date(b.survenu_le) - new Date(a.survenu_le);
  return t || (RANG[b.type] ?? 1) - (RANG[a.type] ?? 1);
}

function detail(e) {
  const d = e.donnees ?? {};
  if (e.type === 'tag_pose') return `${TECHNOLOGIES[d.technologie] ?? ''} ${d.valeur ?? ''}`;
  if (e.type === 'tag_retire') return `${TECHNOLOGIES[d.technologie] ?? ''} ${d.valeur ?? ''} — ${d.motif ?? ''}`;
  return '';
}

// Journal du vêtement, du plus récent au plus ancien (lecture seule : le journal ne se modifie pas).
export default function Historique({ vetementId, version }) {
  const [evenements, setEvenements] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    supabase
      .from('evenements')
      .select('id, type, survenu_le, source, donnees, annule_par, site:sites(nom)')
      .eq('vetement_id', vetementId)
      .order('survenu_le', { ascending: false })
      .then(({ data, error }) => {
        setErreur(error);
        setEvenements((data ?? []).sort(chronologieInverse));
      });
  }, [vetementId, version]);

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
              {LIBELLES[e.type] ?? e.type}
              {SOURCES[e.source] && <span className="badge">{SOURCES[e.source]}</span>}
              {e.annule_par && <span className="badge">Annulé</span>}
            </span>
            {(detail(e) || e.site) && (
              <span className="historique-detail">{[detail(e), e.site?.nom].filter(Boolean).join(' · ')}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
