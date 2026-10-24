import { useRef, useState } from 'react';
import { messageErreur } from '../lib/erreurs.js';
import { TYPES_LOGO, enregistrerLogo, retirerLogo, urlLogo } from '../lib/logo.js';

// Logo d'un client : aperçu, dépôt (préparé en icônes d'application) et retrait.
export default function EditeurLogo({ org, logoLe, onChange, compact }) {
  const fichier = useRef(null);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState(null);
  const apercu = urlLogo(org, logoLe, 'icone-192.png');

  async function agir(action) {
    setEnvoi(true);
    setMessage(null);
    try {
      await action();
      await onChange?.();
    } catch (e) {
      // Erreurs du stockage (sans code Postgres) : refus de droits ou message de préparation de l'image.
      const refus = /row-level security|unauthorized|403/i.test(e.message ?? '') || e.statusCode === '403';
      setMessage(refus ? 'Réservé à l’administrateur de la zone ou à la plateforme.' : e.code ? messageErreur(e) : e.message);
    }
    setEnvoi(false);
    if (fichier.current) fichier.current.value = '';
  }

  return (
    <div className={`editeur-logo ${compact ? 'editeur-logo-compact' : ''}`}>
      <div className="logo-apercu">{apercu ? <img src={apercu} alt="Logo" /> : <span className="texte-secondaire">Aucun logo</span>}</div>
      <div className="pile">
        <div className="rangee-actions">
          <label className={`bouton ${envoi ? 'desactive' : ''}`}>
            {envoi ? 'Envoi…' : apercu ? 'Changer le logo' : 'Ajouter un logo'}
            <input
              ref={fichier}
              type="file"
              accept={TYPES_LOGO}
              hidden
              disabled={envoi}
              onChange={(e) => e.target.files[0] && agir(() => enregistrerLogo(org, e.target.files[0]))}
            />
          </label>
          {apercu && (
            <button type="button" className="bouton bouton-discret" disabled={envoi} onClick={() => agir(() => retirerLogo(org))}>
              Retirer
            </button>
          )}
        </div>
        {!compact && (
          <small className="aide">
            Carré de préférence, 512 px ou plus (PNG, JPEG, WebP ou SVG). Il devient l’icône de l’application sur les appareils
            qui l’installent depuis cette zone ; une application déjà installée garde son icône jusqu’à sa réinstallation.
          </small>
        )}
        {message && <p className="message message-erreur">{message}</p>}
      </div>
    </div>
  );
}
