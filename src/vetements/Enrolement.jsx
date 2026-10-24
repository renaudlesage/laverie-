import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { apresEcritureDirecte } from '../hors-ligne/synchro.js';
import { messageErreur } from '../lib/erreurs.js';
import { TECHNOLOGIES } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useLignes } from '../referentiels/useLignes.js';
import Champ from '../referentiels/Champ.jsx';
import { formaterCode, nouvelId } from '../identification/codes.js';
import { normaliser } from '../identification/normalisation.js';
import AjoutIdentifiant from './AjoutIdentifiant.jsx';

const URL_PUBLIQUE = import.meta.env.VITE_URL_PUBLIQUE || window.location.origin;

export default function Enrolement() {
  const { organisation } = useOrganisation();
  const navigate = useNavigate();
  const [parametres] = useSearchParams();
  const { lignes: articles, chargement } = useLignes('articles', { ordre: 'designation' });
  const { lignes: sites } = useLignes('sites', { ordre: 'nom' });
  const [valeurs, setValeurs] = useState({ article_id: null, taille: '', numero_serie: '', nominatif: false, site_id: null, mis_en_service_le: '' });
  const [identifiants, setIdentifiants] = useState([]);
  // Identifiants des événements produits sur l'appareil : stables si l'envoi est répété.
  const [ids] = useState(() => ({ evenement: nouvelId(), vetement: nouvelId() }));
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState(null);

  // Identifiant inconnu venant du scan : proposé d'office (technologie demandée si la douchette ne la donne pas).
  const initial = useMemo(() => {
    const valeur = parametres.get('valeur');
    if (!valeur) return null;
    const technologie = parametres.get('technologie');
    return normaliser({ technologie, valeur_brute: valeur }, { urlPublique: URL_PUBLIQUE });
  }, [parametres]);

  const actifs = articles.filter((a) => a.actif);
  const champs = [
    {
      nom: 'article_id',
      libelle: 'Article',
      type: 'selection',
      requis: true,
      options: actifs.map((a) => ({ valeur: a.id, libelle: [a.designation, a.reference].filter(Boolean).join(' — ') })),
    },
    { nom: 'taille', libelle: 'Taille' },
    { nom: 'numero_serie', libelle: 'N° de série' },
    { nom: 'site_id', libelle: 'Site', type: 'selection', options: sites.filter((s) => s.actif).map((s) => ({ valeur: s.id, libelle: s.nom })) },
    { nom: 'mis_en_service_le', libelle: 'Mis en service le', typeSaisie: 'date' },
    { nom: 'nominatif', libelle: 'Vêtement nominatif (attitré à un pompier)', type: 'case' },
  ];

  async function enroler(e) {
    e.preventDefault();
    setEnvoi(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('enroler_vetement', {
      org: organisation.id,
      p: {
        evenement_id: ids.evenement,
        vetement_id: ids.vetement,
        ...valeurs,
        survenu_le: new Date().toISOString(),
        identifiants: identifiants.map(({ evenement_id, technologie, valeur }) => ({ evenement_id, technologie, valeur })),
      },
    });
    setEnvoi(false);
    if (error) {
      setMessage({ type: 'erreur', texte: messageErreur(error) });
      return;
    }
    await apresEcritureDirecte(organisation.id, [data.vetement_id]);
    const aImprimer = identifiants.filter((i) => i.genere).map((i) => i.valeur);
    navigate(`/vetements/${data.vetement_id}`, { state: { enrole: true, aImprimer } });
  }

  if (!chargement && actifs.length === 0) {
    return (
      <section className="carte">
        <h1>Enrôler un vêtement</h1>
        <p className="message message-erreur">Aucun article actif : un article s’active avec ses limites par traitement et sa notice.</p>
        <Link to="/parametres/articles" className="bouton">
          Aller aux articles
        </Link>
      </section>
    );
  }

  return (
    <section className="pile">
      <form className="carte formulaire" onSubmit={enroler}>
        <p className="etiquette">Enrôlement</p>
        <h1>Nouveau vêtement</h1>
        {champs.map((c) => (
          <Champ key={c.nom} champ={c} valeur={valeurs[c.nom]} onChange={(v) => setValeurs((x) => ({ ...x, [c.nom]: v }))} />
        ))}

        <h2>Identifiants</h2>
        {identifiants.length === 0 ? (
          <p className="texte-secondaire">Aucun pour l’instant. Un vêtement peut porter plusieurs supports (QR, code-barres, NFC).</p>
        ) : (
          <ul className="liste">
            {identifiants.map((i) => (
              <li key={i.evenement_id} className="ligne-liste ligne-statique">
                <span className="ligne-titre">
                  <span className="mono">{i.genere ? formaterCode(i.valeur) : i.valeur}</span>
                  {i.genere && <span className="badge badge-veille">À imprimer</span>}
                </span>
                <span className="ligne-detail">{TECHNOLOGIES[i.technologie]}</span>
                <button
                  type="button"
                  className="bouton bouton-discret"
                  onClick={() => setIdentifiants((l) => l.filter((x) => x.evenement_id !== i.evenement_id))}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
        <AjoutIdentifiant
          initial={initial}
          exclure={identifiants}
          contexte={{ ecran: 'enrolement' }}
          onAjout={(i) => setIdentifiants((l) => [...l, { ...i, evenement_id: nouvelId() }])}
        />

        {message && <p className="message message-erreur">{message.texte}</p>}
        <button type="submit" className="bouton bouton-principal bouton-large" disabled={envoi || !valeurs.article_id}>
          {envoi ? 'Enrôlement…' : 'Enrôler le vêtement'}
        </button>
      </form>
    </section>
  );
}
