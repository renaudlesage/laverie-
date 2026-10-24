import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';

export const REGLES_ACTIVATION = {
  au_moins_une: 'Au moins une limite de traitement',
  tous_traitements: 'Une limite pour chaque traitement actif',
};

// Réglages de l'organisation (admin). Valeurs par défaut prudentes, modifiables à tout moment.
export default function Organisation() {
  const { organisation, recharger } = useOrganisation();
  const reglages = organisation.reglages ?? {};
  const [nom, setNom] = useState(organisation.nom);
  const [regle, setRegle] = useState(reglages.activation_limites ?? 'au_moins_une');
  const [antiDoublon, setAntiDoublon] = useState(String((reglages.anti_doublon_ms ?? 2000) / 1000).replace('.', ','));
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState(null);

  async function enregistrer(e) {
    e.preventDefault();
    const secondes = Number(antiDoublon.replace(',', '.'));
    if (!Number.isFinite(secondes) || secondes < 0.5 || secondes > 60) {
      setMessage({ type: 'erreur', texte: 'Fenêtre anti-doublon : entre 0,5 et 60 secondes.' });
      return;
    }
    setEnvoi(true);
    const { error } = await supabase
      .from('organisations')
      .update({
        nom: nom.trim(),
        reglages: { ...reglages, activation_limites: regle, anti_doublon_ms: Math.round(secondes * 1000) },
      })
      .eq('id', organisation.id);
    setEnvoi(false);
    if (error) {
      setMessage({ type: 'erreur', texte: messageErreur(error) });
      return;
    }
    setMessage({ type: 'info', texte: 'Réglages enregistrés.' });
    recharger();
  }

  return (
    <form className="carte formulaire" onSubmit={enregistrer}>
      <p className="etiquette">Organisation</p>
      <h1>Réglages de la zone</h1>

      <label>
        <span>
          Nom<span className="requis"> *</span>
        </span>
        <input required value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>

      <fieldset className="choix-radio">
        <legend>Activation d’un article</legend>
        <p className="aide">
          Un article ne s’active qu’avec sa notice fabricant et ses limites de passages. La règle ne s’applique qu’au moment
          de l’activation : les articles déjà actifs ne sont pas désactivés si elle change.
        </p>
        {Object.entries(REGLES_ACTIVATION).map(([valeur, libelle]) => (
          <label key={valeur} className="champ-case">
            <input type="radio" name="regle" value={valeur} checked={regle === valeur} onChange={() => setRegle(valeur)} />
            <span>{libelle}</span>
          </label>
        ))}
      </fieldset>

      <label>
        <span>Fenêtre anti-doublon des lectures (secondes)</span>
        <input inputMode="decimal" value={antiDoublon} onChange={(e) => setAntiDoublon(e.target.value)} />
        <small className="aide">Le même code relu par le même lecteur dans ce délai n’est compté qu’une fois.</small>
      </label>

      {message && <p className={`message message-${message.type}`}>{message.texte}</p>}
      <button type="submit" className="bouton bouton-principal" disabled={envoi}>
        Enregistrer
      </button>
    </form>
  );
}
