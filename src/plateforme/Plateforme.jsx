import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Chargement from '../composants/Chargement.jsx';
import BoutonTheme from '../composants/BoutonTheme.jsx';
import EditeurLogo from '../organisation/EditeurLogo.jsx';
import Icone from '../composants/Icone.jsx';

const TYPES = { zone_secours: 'Zone de secours', autre: 'Autre' };
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-BE') : '—');
const dateHeure = (iso) => (iso ? new Date(iso).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' }) : '—');

// Une action à saisie (motif, e-mail) sur un client : formulaire en ligne, envoyé à une RPC.
function ActionSaisie({ libelle, icone, champ, placeholder, danger, onValider, desactive, aide }) {
  const [ouvert, setOuvert] = useState(false);
  const [valeur, setValeur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  if (!ouvert) {
    return (
      <button type="button" className={`bouton ${danger ? 'bouton-danger' : ''}`} disabled={desactive} title={aide} onClick={() => setOuvert(true)}>
        <Icone nom={icone} />
        {libelle}
      </button>
    );
  }
  return (
    <form
      className="formulaire carte"
      onSubmit={async (e) => {
        e.preventDefault();
        setEnvoi(true);
        const fini = await onValider(valeur.trim());
        setEnvoi(false);
        if (fini) setOuvert(false);
      }}
    >
      <label>
        <span>{champ}</span>
        <input required autoFocus value={valeur} onChange={(e) => setValeur(e.target.value)} placeholder={placeholder} />
      </label>
      <div className="rangee-actions">
        <button type="submit" className={`bouton ${danger ? 'bouton-danger' : 'bouton-principal'}`} disabled={envoi || !valeur.trim()}>
          {libelle}
        </button>
        <button type="button" className="bouton" onClick={() => setOuvert(false)}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function Client({ c, onAction, onLogo }) {
  return (
    <li className={`carte ${c.suspendue_le ? 'carte-alerte etat-chaud' : ''}`}>
      <div className="entete-section">
        <h3 className="sans-marge">{c.nom}</h3>
        <span className="statut-ligne">
          {c.suspendue_le ? <span className="jeton-etat etat-chaud">Suspendu</span> : <span className="jeton-etat etat-ok">Actif</span>}
          {c.support_autorise && <span className="badge">Support autorisé</span>}
        </span>
      </div>
      <p className="texte-secondaire sans-marge">
        {TYPES[c.type] ?? c.type} · client depuis le {date(c.cree_le)}
        {c.suspendue_le && ` · suspendu le ${date(c.suspendue_le)} : ${c.motif_suspension}`}
      </p>
      <EditeurLogo org={c.id} logoLe={c.logo_le} onChange={onLogo} compact />
      <ul className="tuiles">
        {[
          ['Vêtements', c.vetements],
          ['Utilisateurs', c.utilisateurs],
          ['Passages ce mois', c.passages_mois],
          ['Alertes ouvertes', c.alertes_ouvertes],
        ].map(([l, n]) => (
          <li key={l}>
            <span className="etiquette">{l}</span>
            <strong>{n}</strong>
          </li>
        ))}
      </ul>
      <p className="texte-secondaire">
        Administrateurs : {c.administrateurs || '—'}
        {c.invitations > 0 && ` · ${c.invitations} invitation(s) en attente`} · dernière activité : {dateHeure(c.derniere_activite)}
      </p>
      <div className="rangee-actions">
        <ActionSaisie
          libelle="Accès support"
          icone="support"
          champ="Motif de l’accès (visible par l’administrateur de la zone)"
          placeholder="Ex. : aide au paramétrage des articles"
          desactive={!c.support_autorise || !!c.suspendue_le}
          aide={c.support_autorise ? '' : 'L’administrateur de la zone doit d’abord autoriser l’accès support'}
          onValider={(motif) => onAction('support', c, motif)}
        />
        <ActionSaisie libelle="Ajouter un administrateur" icone="ajouterPersonne" champ="E-mail" placeholder="prenom.nom@zone.be" onValider={(email) => onAction('admin', c, email)} />
        {c.suspendue_le ? (
          <button type="button" className="bouton" onClick={() => onAction('reactiver', c)}>
            <Icone nom="reactiver" />
            Réactiver
          </button>
        ) : (
          <ActionSaisie libelle="Suspendre" icone="suspendre" champ="Motif de la suspension" placeholder="Ex. : contrat terminé" danger onValider={(motif) => onAction('suspendre', c, motif)} />
        )}
      </div>
    </li>
  );
}

// Espace Plateforme : clients (création, suivi, suspension, accès support), super-administrateurs.
export default function Plateforme() {
  const { utilisateur } = useAuth();
  const { estPlateforme, chargement, recharger, choisir } = useOrganisation();
  const navigate = useNavigate();
  const [clients, setClients] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [acces, setAcces] = useState([]);
  const [message, setMessage] = useState(null);
  const [nouveau, setNouveau] = useState({ nom: '', type: 'zone_secours', email: '' });
  const [nouvelAdmin, setNouvelAdmin] = useState('');

  const charger = useCallback(async () => {
    const [c, a, s] = await Promise.all([
      supabase.rpc('plateforme_clients'),
      supabase.rpc('plateforme_admins_liste'),
      supabase.from('acces_support').select('id, organisation_id, email, motif, debut, fin').order('debut', { ascending: false }).limit(30),
    ]);
    if (c.error) setMessage({ type: 'erreur', texte: messageErreur(c.error) });
    setClients(c.data ?? []);
    setAdmins(a.data ?? []);
    setAcces(s.data ?? []);
  }, []);

  useEffect(() => {
    if (estPlateforme) charger();
  }, [estPlateforme, charger]);

  async function appeler(rpc, params, succes) {
    const { data, error } = await supabase.rpc(rpc, params);
    if (error) {
      setMessage({ type: 'erreur', texte: messageErreur(error) });
      return false;
    }
    setMessage(succes ? { type: 'info', texte: typeof succes === 'function' ? succes(data) : succes } : null);
    await charger();
    return true;
  }

  async function onAction(type, c, valeur) {
    if (type === 'suspendre') return appeler('suspendre_client', { org: c.id, motif: valeur }, `${c.nom} suspendu : ses membres n’y ont plus accès.`);
    if (type === 'reactiver') return appeler('reactiver_client', { org: c.id }, `${c.nom} réactivé.`);
    if (type === 'admin') {
      return appeler('plateforme_inviter_admin', { org: c.id, email_admin: valeur }, (r) =>
        r === 'membre' ? `${valeur} est administrateur de ${c.nom}.` : `Invitation enregistrée : ${valeur} deviendra administrateur de ${c.nom} à sa première connexion (« Lien par e-mail »).`,
      );
    }
    if (type === 'support') {
      const ok = await appeler('ouvrir_support', { org: c.id, motif: valeur });
      if (ok) {
        await recharger();
        choisir(c.id);
        navigate('/');
      }
      return ok;
    }
    return false;
  }

  async function creer(e) {
    e.preventDefault();
    const ok = await appeler('creer_client', { nom_client: nouveau.nom.trim(), type_client: nouveau.type, email_admin: nouveau.email.trim() }, (r) =>
      r.admin === 'membre'
        ? `Client « ${nouveau.nom.trim()} » créé ; ${nouveau.email.trim()} en est l’administrateur.`
        : `Client « ${nouveau.nom.trim()} » créé. Communiquez l’adresse de l’app à ${nouveau.email.trim()} : à sa première connexion par « Lien par e-mail », il en deviendra l’administrateur.`,
    );
    if (ok) setNouveau({ nom: '', type: 'zone_secours', email: '' });
  }

  if (chargement) return <Chargement />;

  const nomClient = (id) => clients?.find((c) => c.id === id)?.nom ?? '—';

  return (
    <div className="gabarit">
      <header className="entete">
        <div className="entete-titre">
          <span className="marque">Suivi linge</span>
          <span className="organisation-courante">Plateforme</span>
        </div>
        <div className="entete-actions">
          <Link to="/organisation" className="bouton bouton-discret" title="Mes zones">
            <Icone nom="changer" />
            <span className="libelle-icone">Mes zones</span>
          </Link>
          <BoutonTheme />
        </div>
      </header>
      <main className="contenu pile">
        {!estPlateforme ? (
          <p className="message message-erreur">Espace réservé aux administrateurs de la plateforme.</p>
        ) : (
          <>
            <h1>Clients</h1>
            {message && <p className={`message message-${message.type}`}>{message.texte}</p>}

            <form className="carte formulaire" onSubmit={creer}>
              <h2>Nouveau client</h2>
              <div className="grille-champs">
                <label>
                  <span>
                    Nom<span className="requis"> *</span>
                  </span>
                  <input required value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} placeholder="Zone de secours …" />
                </label>
                <label>
                  <span>Type</span>
                  <select value={nouveau.type} onChange={(e) => setNouveau({ ...nouveau, type: e.target.value })}>
                    {Object.entries(TYPES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>
                  E-mail du premier administrateur<span className="requis"> *</span>
                </span>
                <input required type="email" value={nouveau.email} onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })} />
              </label>
              <small className="aide">Les traitements par défaut sont créés avec la zone ; l’administrateur saisit ensuite sites, articles et porteurs.</small>
              <button type="submit" className="bouton bouton-principal">
                <Icone nom="ajouter" />
                Créer le client
              </button>
            </form>

            {clients === null ? (
              <p className="texte-secondaire">Chargement…</p>
            ) : (
              <ul className="liste pile">
                {clients.map((c) => (
                  <Client key={c.id} c={c} onAction={onAction} onLogo={charger} />
                ))}
              </ul>
            )}

            <div className="carte">
              <h2>Accès support récents</h2>
              <p className="texte-secondaire">Lecture seule, 2 heures, motif obligatoire ; visibles aussi par l’administrateur de chaque zone.</p>
              {acces.length === 0 && <p className="texte-secondaire">Aucun.</p>}
              <ul className="liste">
                {acces.map((a) => (
                  <li key={a.id} className="ligne-liste ligne-statique">
                    <span className="ligne-titre">
                      {nomClient(a.organisation_id)} — {a.motif}
                    </span>
                    <span className="ligne-detail mono">
                      {a.email} · {dateHeure(a.debut)} → {dateHeure(a.fin)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="carte formulaire">
              <h2>Administrateurs de la plateforme</h2>
              <ul className="liste">
                {admins.map((a) => (
                  <li key={a.user_id} className="ligne-liste ligne-statique">
                    <span className="ligne-titre">
                      {a.email}
                      {a.user_id === utilisateur.id && <span className="badge">Vous</span>}
                    </span>
                    <span className="ligne-detail">depuis le {date(a.ajoute_le)}</span>
                    {admins.length > 1 && (
                      <button
                        type="button"
                        className="bouton bouton-discret"
                        onClick={() => appeler('retirer_admin_plateforme', { utilisateur: a.user_id }, `${a.email} n’est plus administrateur de la plateforme.`)}
                      >
                        <Icone nom="retirerPersonne" />
                        Retirer
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <form
                className="rangee-actions"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await appeler('ajouter_admin_plateforme', { email_admin: nouvelAdmin.trim() }, `${nouvelAdmin.trim()} est administrateur de la plateforme.`)) setNouvelAdmin('');
                }}
              >
                <input type="email" required value={nouvelAdmin} onChange={(e) => setNouvelAdmin(e.target.value)} placeholder="E-mail (compte existant)" />
                <button type="submit" className="bouton">
                  <Icone nom="ajouterPersonne" />
                  Ajouter
                </button>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
