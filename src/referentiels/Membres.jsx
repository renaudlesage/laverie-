import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { options, ROLES } from '../lib/libelles.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Champ from './Champ.jsx';
import { useLignes } from './useLignes.js';

const VIDE = { email: '', role: 'gestionnaire', site_id: null, actif: true };

export default function Membres() {
  const { organisation, recharger: rechargerAdhesions } = useOrganisation();
  const { utilisateur } = useAuth();
  const { lignes: sites } = useLignes('sites', { ordre: 'nom' });
  const [membres, setMembres] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [edition, setEdition] = useState(null); // null | { membre?, valeurs }
  const [message, setMessage] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    const [m, i] = await Promise.all([
      supabase.rpc('membres_organisation', { org: organisation.id }),
      supabase.from('invitations').select('*').eq('organisation_id', organisation.id).order('email'),
    ]);
    if (m.error || i.error) setMessage({ type: 'erreur', texte: messageErreur(m.error ?? i.error) });
    setMembres(m.data ?? []);
    setInvitations(i.data ?? []);
  }, [organisation.id]);

  useEffect(() => {
    charger();
  }, [charger]);

  const laveriesExternes = sites.filter((s) => s.type === 'laverie_externe');
  const nomsSites = Object.fromEntries(sites.map((s) => [s.id, s.nom]));
  const champs = [
    { nom: 'email', libelle: 'E-mail', typeSaisie: 'email', requis: true, creationSeulement: true },
    { nom: 'role', libelle: 'Rôle', type: 'selection', options: options(ROLES).filter((o) => o.valeur !== 'support'), requis: true },
    {
      nom: 'site_id',
      libelle: 'Laverie externe',
      type: 'selection',
      requis: true,
      options: laveriesExternes.map((s) => ({ valeur: s.id, libelle: s.nom })),
      aide: laveriesExternes.length ? 'Le prestataire ne verra que les vêtements confiés à ce site.' : 'Créez d’abord un site de type « Laverie externe ».',
      masque: (v) => v.role !== 'laverie_externe',
    },
    { nom: 'actif', libelle: 'Actif', type: 'case', masque: () => !edition?.membre },
  ];

  async function enregistrer(e) {
    e.preventDefault();
    setEnvoi(true);
    setMessage(null);
    const v = edition.valeurs;
    const site = v.role === 'laverie_externe' ? v.site_id : null;
    let error;
    let texte;
    if (edition.membre) {
      ({ error } = await supabase.from('membres').update({ role: v.role, site_id: site, actif: v.actif }).eq('id', edition.membre.id));
      texte = 'Membre mis à jour.';
    } else {
      let data;
      ({ data, error } = await supabase.rpc('inviter_membre', {
        org: organisation.id,
        email_membre: v.email.trim(),
        role_membre: v.role,
        site,
      }));
      texte =
        data === 'membre'
          ? 'Membre ajouté : il a déjà un compte et voit l’organisation dès maintenant.'
          : 'Invitation enregistrée : la personne devient membre à sa première connexion (bouton « Lien par e-mail » sur l’écran de connexion, avec cette adresse).';
    }
    setEnvoi(false);
    if (error) {
      setMessage({ type: 'erreur', texte: messageErreur(error) });
      return;
    }
    setEdition(null);
    setMessage({ type: 'info', texte });
    await charger();
    if (edition.membre?.user_id === utilisateur.id) rechargerAdhesions();
  }

  async function retirer() {
    if (!window.confirm('Retirer ce membre de l’organisation ?')) return;
    setEnvoi(true);
    const { error } = await supabase.from('membres').delete().eq('id', edition.membre.id);
    setEnvoi(false);
    if (error) {
      setMessage({ type: 'erreur', texte: messageErreur(error) });
      return;
    }
    setEdition(null);
    setMessage({ type: 'info', texte: 'Membre retiré.' });
    charger();
  }

  async function annulerInvitation(invitation) {
    if (!window.confirm(`Annuler l’invitation de ${invitation.email} ?`)) return;
    const { error } = await supabase.from('invitations').delete().eq('id', invitation.id);
    setMessage(error ? { type: 'erreur', texte: messageErreur(error) } : { type: 'info', texte: 'Invitation annulée.' });
    charger();
  }

  if (edition) {
    return (
      <section className="carte">
        <h1>{edition.membre ? edition.membre.email : 'Ajouter un membre'}</h1>
        <form className="formulaire" onSubmit={enregistrer}>
          {champs
            .filter((c) => !c.masque?.(edition.valeurs))
            .map((c) => (
              <Champ
                key={c.nom}
                champ={c}
                valeur={edition.valeurs[c.nom]}
                desactive={edition.membre && c.creationSeulement}
                onChange={(val) => setEdition((ed) => ({ ...ed, valeurs: { ...ed.valeurs, [c.nom]: val } }))}
              />
            ))}
          {message && <p className={`message message-${message.type}`}>{message.texte}</p>}
          <div className="rangee-actions">
            <button type="submit" className="bouton bouton-principal" disabled={envoi}>
              Enregistrer
            </button>
            <button type="button" className="bouton" onClick={() => setEdition(null)} disabled={envoi}>
              Annuler
            </button>
            {edition.membre && (
              <button type="button" className="bouton bouton-danger" onClick={retirer} disabled={envoi}>
                Retirer
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
        <h1>Membres</h1>
        <button
          type="button"
          className="bouton bouton-principal"
          onClick={() => {
            setMessage(null);
            setEdition({ valeurs: { ...VIDE } });
          }}
        >
          Ajouter
        </button>
      </div>
      {message && <p className={`message message-${message.type}`}>{message.texte}</p>}
      <ul className="liste">
        {membres.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="ligne-liste"
              onClick={() => {
                setMessage(null);
                setEdition({ membre: m, valeurs: { email: m.email, role: m.role, site_id: m.site_id, actif: m.actif } });
              }}
            >
              <span className="ligne-titre">
                {m.email}
                {!m.actif && <span className="badge">Inactif</span>}
              </span>
              <span className="ligne-detail">{[ROLES[m.role], nomsSites[m.site_id]].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        ))}
      </ul>

      {invitations.length > 0 && (
        <>
          <h2>Invitations en attente</h2>
          <ul className="liste">
            {invitations.map((i) => (
              <li key={i.id} className="ligne-liste ligne-statique">
                <span className="ligne-titre">{i.email}</span>
                <span className="ligne-detail">{[ROLES[i.role], nomsSites[i.site_id]].filter(Boolean).join(' · ')}</span>
                <button type="button" className="bouton bouton-discret" onClick={() => annulerInvitation(i)}>
                  Annuler l’invitation
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
