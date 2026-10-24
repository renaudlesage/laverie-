import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Rafale from '../identification/Rafale.jsx';
import { emettre, evenement, operation, operer } from '../journal/journal.js';
import CompteRendu from './Envoi.jsx';
import { codeVisible, envoyerPourLus, vetementsDuLot } from './donnees.js';

// Un lot de traitement : constitution par scan, retrait, clôture (comptage) ou avortement.
export default function LotDetail() {
  const { id } = useParams();
  const { organisation } = useOrganisation();
  const [lot, setLot] = useState(null);
  const [contenu, setContenu] = useState([]);
  const [comptes, setComptes] = useState(0);
  const [resultat, setResultat] = useState(null);
  const [confirmation, setConfirmation] = useState(null); // 'cloturer' | 'avorter'
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    const { data } = await supabase.from('lots').select('*, traitement:traitements(libelle), site:sites!lots_organisation_id_site_id_fkey(nom)').eq('id', id).maybeSingle();
    setLot(data);
    if (data?.statut === 'ouvert') setContenu(await vetementsDuLot(id, 'en_traitement'));
    else {
      setContenu([]);
      const { count } = await supabase.from('evenements').select('id', { count: 'exact', head: true }).eq('lot_id', id).eq('type', 'traitement').is('annule_par', null);
      setComptes(count ?? 0);
    }
  }, [id]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouter({ lus }) {
    const b = await envoyerPourLus(organisation.id, lus, (l) => evenement('ajout_lot', l.vetementId, { lotId: id, lecteurId: l.lecture.lecteur_id }));
    setResultat(b);
    await charger();
    return b.refuses;
  }

  async function retirer(v) {
    const [r] = await emettre(organisation.id, [evenement('retrait_lot', v.id, { lotId: id })]);
    setResultat(r.statut === 'rejete' ? { texte: r.motif, rejets: [] } : { texte: `${codeVisible(v)} retiré du lot.` });
    await charger();
  }

  async function terminer() {
    setEnvoi(true);
    try {
      const type = confirmation === 'cloturer' ? 'cloturer_lot' : 'avorter_lot';
      const [r] = await operer(organisation.id, [operation(type, id, confirmation === 'avorter' ? { motif } : {})]);
      setResultat(
        r.statut === 'rejete'
          ? { texte: r.motif, rejets: [] }
          : {
              texte:
                confirmation === 'cloturer'
                  ? `Lot clôturé : ${contenu.length} passage(s) « ${lot.traitement?.libelle} » comptés.`
                  : 'Lot avorté : aucun passage compté, les vêtements reviennent en attente de traitement.',
            },
      );
      setConfirmation(null);
      await charger();
    } catch (e) {
      setResultat({ texte: messageErreur(e), rejets: [] });
    } finally {
      setEnvoi(false);
    }
  }

  if (!lot) return <section className="carte">Chargement…</section>;
  const ouvert = lot.statut === 'ouvert';

  return (
    <section className="pile">
      <p>
        <Link to="/laverie/lots">← Lots</Link>
      </p>
      <div className={`carte ${lot.circuit === 'contamine' ? 'carte-alerte etat-chaud' : ''}`}>
        <p className="etiquette">Lot de traitement</p>
        <h1>{lot.traitement?.libelle}</h1>
        <p className="statut-ligne">
          <span className={`jeton-etat etat-${lot.circuit === 'contamine' ? 'chaud' : 'info'}`}>
            {lot.circuit === 'contamine' ? 'Circuit contaminé' : 'Circuit standard'}
          </span>
          <span className={`jeton-etat etat-${ouvert ? 'veille' : lot.statut === 'cloture' ? 'ok' : 'froid'}`}>
            {ouvert ? 'Ouvert' : lot.statut === 'cloture' ? 'Clôturé' : 'Avorté'}
          </span>
        </p>
        <p className="texte-secondaire">{[lot.programme && `Programme ${lot.programme}`, lot.machine && `machine ${lot.machine}`, lot.site?.nom].filter(Boolean).join(' · ')}</p>
        {!ouvert && <p>{lot.statut === 'cloture' ? `${comptes} passage(s) compté(s).` : 'Aucun passage compté.'}</p>}
      </div>

      <CompteRendu resultat={resultat} />

      {ouvert && (
        <>
          <Rafale contexte={{ ecran: 'lot' }} onValider={ajouter} libelleValider="Ajouter au lot" />
          <div className="carte">
            <h2>Dans le lot ({contenu.length})</h2>
            <ul className="liste">
              {contenu.map((v) => (
                <li key={v.id} className="ligne-liste ligne-statique">
                  <span className="ligne-titre">{v.article?.designation}</span>
                  <span className="ligne-detail mono">{codeVisible(v)}</span>
                  <button type="button" className="bouton bouton-discret" onClick={() => retirer(v)}>
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {confirmation ? (
            <div className="carte carte-alerte etat-veille formulaire">
              <h2>{confirmation === 'cloturer' ? `Clôturer le lot (${contenu.length})` : 'Avorter le lot'}</h2>
              <p>
                {confirmation === 'cloturer'
                  ? `Chaque vêtement du lot gagne un passage « ${lot.traitement?.libelle} ». Le lot ne pourra plus être modifié.`
                  : 'Aucun passage ne sera compté ; les vêtements reviennent en attente de traitement.'}
              </p>
              {confirmation === 'avorter' && (
                <label>
                  <span>Motif</span>
                  <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : panne machine" />
                </label>
              )}
              <div className="rangee-actions">
                <button type="button" className={`bouton ${confirmation === 'cloturer' ? 'bouton-principal' : 'bouton-danger'}`} disabled={envoi} onClick={terminer}>
                  Confirmer
                </button>
                <button type="button" className="bouton" onClick={() => setConfirmation(null)} disabled={envoi}>
                  Retour
                </button>
              </div>
            </div>
          ) : (
            <div className="rangee-actions">
              <button type="button" className="bouton bouton-principal bouton-large" disabled={contenu.length === 0} onClick={() => setConfirmation('cloturer')}>
                Clôturer le lot ({contenu.length})
              </button>
              <button type="button" className="bouton bouton-danger" onClick={() => setConfirmation('avorter')}>
                Avorter le lot
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
