import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Champ from './Champ.jsx';
import { useLignes } from './useLignes.js';

// Écran de liste + formulaire pour une table de référentiel de l'organisation.
//   champs    : descriptions de champs (voir Champ.jsx) ; `creationSeulement` : non modifiable ensuite
//   resume    : (ligne) => { titre, detail }
//   peutModifier : droit d'écriture de l'utilisateur
//   ouvrir    : (ligne) => void, remplace le formulaire intégré (écran de détail) ;
//               le formulaire reste accessible par l'adresse ?modifier=<id>
export default function EcranReferentiel({
  titre,
  table,
  champs,
  resume,
  valeursInitiales = {},
  ordre,
  peutModifier = true,
  ouvrir,
  avantListe,
  apresEnregistrement,
  avantEnregistrement,
  libelleAjout = 'Ajouter',
}) {
  const { organisation } = useOrganisation();
  const { lignes, chargement, erreur, recharger } = useLignes(table, { ordre });
  const [edition, setEdition] = useState(null); // null | { ligne?, valeurs }
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState(null);

  const [parametres, setParametres] = useSearchParams();
  const aModifier = parametres.get('modifier');
  useEffect(() => {
    const ligne = aModifier && lignes.find((l) => l.id === aModifier);
    if (!ligne) return;
    editer(ligne);
    setParametres({}, { replace: true });
  }, [aModifier, lignes]); // eslint-disable-line react-hooks/exhaustive-deps

  function commencer(ligne) {
    setMessage(null);
    if (ligne && ouvrir) {
      ouvrir(ligne);
      return;
    }
    editer(ligne);
  }

  function editer(ligne) {
    const valeurs = {};
    for (const c of champs) valeurs[c.nom] = ligne ? ligne[c.nom] : valeursInitiales[c.nom] ?? (c.type === 'case' ? false : null);
    setEdition({ ligne, valeurs });
  }

  async function enregistrer(e) {
    e.preventDefault();
    setEnvoi(true);
    setMessage(null);
    const valeurs = { ...edition.valeurs };
    for (const c of champs) {
      if (typeof valeurs[c.nom] === 'string') valeurs[c.nom] = valeurs[c.nom].trim() || null;
      if (edition.ligne && c.creationSeulement) delete valeurs[c.nom];
    }
    // Transformation propre à l'écran (normalisation d'un code, contrôle croisé…).
    if (avantEnregistrement) {
      const r = avantEnregistrement(valeurs);
      if (r.erreur) {
        setEnvoi(false);
        setMessage({ type: 'erreur', texte: r.erreur });
        return;
      }
      Object.assign(valeurs, r.valeurs);
    }
    const requete = edition.ligne
      ? supabase.from(table).update(valeurs).eq('id', edition.ligne.id)
      : supabase.from(table).insert({ ...valeurs, organisation_id: organisation.id });
    const { data, error } = await requete.select().single();
    setEnvoi(false);
    if (error) {
      setMessage({ type: 'erreur', texte: messageErreur(error) });
      return;
    }
    setEdition(null);
    setMessage({ type: 'info', texte: 'Enregistré.' });
    await recharger();
    apresEnregistrement?.(data, !edition.ligne);
  }

  async function supprimer() {
    if (!window.confirm('Supprimer définitivement cet élément ?')) return;
    setEnvoi(true);
    const { error } = await supabase.from(table).delete().eq('id', edition.ligne.id);
    setEnvoi(false);
    if (error) {
      setMessage({ type: 'erreur', texte: messageErreur(error) });
      return;
    }
    setEdition(null);
    setMessage({ type: 'info', texte: 'Supprimé.' });
    recharger();
  }

  if (edition) {
    return (
      <section className="carte">
        <h1>{edition.ligne ? `Modifier — ${resume(edition.ligne).titre}` : `${titre} — ${libelleAjout.toLowerCase()}`}</h1>
        <form className="formulaire" onSubmit={enregistrer}>
          {champs
            .filter((c) => !c.masque?.(edition.valeurs))
            .map((c) => (
              <Champ
                key={c.nom}
                champ={c}
                valeur={edition.valeurs[c.nom]}
                desactive={!peutModifier || (edition.ligne && c.creationSeulement)}
                onChange={(v) => setEdition((ed) => ({ ...ed, valeurs: { ...ed.valeurs, [c.nom]: v } }))}
              />
            ))}
          {message && <p className={`message message-${message.type}`}>{message.texte}</p>}
          <div className="rangee-actions">
            {peutModifier && (
              <button type="submit" className="bouton bouton-principal" disabled={envoi}>
                Enregistrer
              </button>
            )}
            <button type="button" className="bouton" onClick={() => setEdition(null)} disabled={envoi}>
              Annuler
            </button>
            {peutModifier && edition.ligne && (
              <button type="button" className="bouton bouton-danger" onClick={supprimer} disabled={envoi}>
                Supprimer
              </button>
            )}
          </div>
        </form>
      </section>
    );
  }

  return (
    <section>
      <div className="entete-section">
        <h1>{titre}</h1>
        {peutModifier && (
          <button type="button" className="bouton bouton-principal" onClick={() => commencer(null)}>
            {libelleAjout}
          </button>
        )}
      </div>
      {avantListe}
      {message && <p className={`message message-${message.type}`}>{message.texte}</p>}
      {erreur && <p className="message message-erreur">{messageErreur(erreur)}</p>}
      {chargement ? (
        <p className="texte-secondaire">Chargement…</p>
      ) : lignes.length === 0 ? (
        <p className="texte-secondaire">Aucun élément pour l'instant.</p>
      ) : (
        <ul className="liste">
          {lignes.map((ligne) => {
            const { titre: t, detail } = resume(ligne);
            return (
              <li key={ligne.id}>
                <button type="button" className="ligne-liste" onClick={() => commencer(ligne)}>
                  <span className="ligne-titre">
                    {t}
                    {ligne.actif === false && <span className="badge">Inactif</span>}
                  </span>
                  {detail && <span className="ligne-detail">{detail}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
