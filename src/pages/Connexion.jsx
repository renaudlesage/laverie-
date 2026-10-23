import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import Chargement from '../composants/Chargement.jsx';

export default function Connexion() {
  const { session, chargement, connexionMotDePasse, connexionLienMagique } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState('mot_de_passe');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState(null);

  if (chargement) return <Chargement />;
  if (session) return <Navigate to={location.state?.depuis?.pathname ?? '/'} replace />;

  async function soumettre(e) {
    e.preventDefault();
    setEnvoi(true);
    setMessage(null);
    if (mode === 'mot_de_passe') {
      const { error } = await connexionMotDePasse(email.trim(), motDePasse);
      if (error) setMessage({ type: 'erreur', texte: 'E-mail ou mot de passe incorrect.' });
    } else {
      const { error } = await connexionLienMagique(email.trim());
      setMessage(
        error
          ? { type: 'erreur', texte: "Impossible d'envoyer le lien. Vérifiez l'adresse ou contactez votre administrateur." }
          : { type: 'info', texte: 'Lien envoyé. Ouvrez votre messagerie sur cet appareil.' },
      );
    }
    setEnvoi(false);
  }

  return (
    <div className="page-centree">
      <form className="carte formulaire" onSubmit={soumettre}>
        <h1>Suivi du linge</h1>

        <div className="onglets" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'mot_de_passe'}
            className={mode === 'mot_de_passe' ? 'actif' : ''}
            onClick={() => setMode('mot_de_passe')}
          >
            Mot de passe
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'lien'}
            className={mode === 'lien' ? 'actif' : ''}
            onClick={() => setMode('lien')}
          >
            Lien par e-mail
          </button>
        </div>

        <label>
          E-mail
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {mode === 'mot_de_passe' && (
          <label>
            Mot de passe
            <input
              type="password"
              autoComplete="current-password"
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </label>
        )}

        {message && <p className={`message message-${message.type}`}>{message.texte}</p>}

        <button type="submit" className="bouton bouton-principal" disabled={envoi}>
          {envoi ? 'Patientez…' : mode === 'mot_de_passe' ? 'Se connecter' : 'Recevoir le lien'}
        </button>
      </form>
    </div>
  );
}
