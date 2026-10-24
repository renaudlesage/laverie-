import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthProvider.jsx';

const CLE_STOCKAGE = 'suivi-linge.organisation';
const OrganisationContext = createContext(null);

function lireChoix() {
  try {
    return localStorage.getItem(CLE_STOCKAGE);
  } catch {
    return null;
  }
}

function ecrireChoix(id) {
  try {
    if (id) localStorage.setItem(CLE_STOCKAGE, id);
    else localStorage.removeItem(CLE_STOCKAGE);
  } catch {
    // Stockage indisponible (navigation privée) : le choix sera redemandé.
  }
}

// Adhésions gardées sur l'appareil : l'app démarre hors ligne avec les dernières connues.
const cleAdhesions = (utilisateurId) => `suivi-linge.adhesions.${utilisateurId}`;

function lireAdhesions(utilisateurId) {
  try {
    return JSON.parse(localStorage.getItem(cleAdhesions(utilisateurId)));
  } catch {
    return null;
  }
}

function ecrireAdhesions(utilisateurId, liste) {
  try {
    localStorage.setItem(cleAdhesions(utilisateurId), JSON.stringify(liste));
  } catch {
    // Stockage indisponible : pas de démarrage hors ligne.
  }
}

export function OrganisationProvider({ children }) {
  const { utilisateur } = useAuth();
  const [adhesions, setAdhesions] = useState([]);
  // Utilisateur auquel appartiennent les adhésions affichées : tant qu'elles ne sont pas celles de
  // l'utilisateur connecté, on est en chargement (sinon redirection à tort vers le choix de la zone).
  const [adhesionsDe, setAdhesionsDe] = useState(null);
  const [organisationId, setOrganisationId] = useState(lireChoix);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [estPlateforme, setEstPlateforme] = useState(false);
  const [zonesSuspendues, setZonesSuspendues] = useState(0);
  // Utilisateur pour lequel les adhésions sont déjà chargées : les rechargements suivants
  // (après un réglage modifié) se font sans écran de chargement, la page reste affichée.
  const chargePour = useRef(null);

  const charger = useCallback(async () => {
    if (!utilisateur) {
      setAdhesions([]);
      setChargement(false);
      return;
    }
    // Dernières adhésions connues d'abord (démarrage immédiat, hors ligne compris), puis la base.
    // Le cache ne sert que s'il contient la zone choisie (un accès support n'y est jamais).
    const connues = lireAdhesions(utilisateur.id);
    const choix = lireChoix();
    if (chargePour.current !== utilisateur.id) {
      if (connues && (!choix || connues.some((m) => m.organisation.id === choix))) {
        setAdhesions(connues);
        setAdhesionsDe(utilisateur.id);
        setChargement(false);
      } else setChargement(true);
    }
    setErreur(null);
    const adhesionsServeur = (colonnes) =>
      supabase
        .from('membres')
        .select(`id, role, site_id, site:sites(nom), organisation:organisations(${colonnes})`)
        .eq('user_id', utilisateur.id)
        .eq('actif', true);
    // Base sans la migration 0015 (logo_le inconnue) : l'app fonctionne, sans logo.
    const lireAdhesionsServeur = async () => {
      const r = await adhesionsServeur('id, nom, type, reglages, support_autorise, logo_le');
      return r.error?.code === '42703' ? adhesionsServeur('id, nom, type, reglages, support_autorise') : r;
    };
    const [{ data, error }, plateforme, support] = await Promise.all([
      lireAdhesionsServeur(),
      supabase.rpc('est_admin_plateforme'),
      supabase.rpc('mes_acces_support'),
    ]);
    setEstPlateforme(plateforme.data === true);
    const enCache = error && lireAdhesions(utilisateur.id);
    if (enCache) {
      setAdhesions(enCache);
    } else if (error) {
      setErreur(error);
      setAdhesions([]);
    } else {
      // Zone suspendue : l'adhésion existe, mais l'organisation n'est plus lisible.
      setZonesSuspendues(data.filter((m) => !m.organisation).length);
      const membre = data.filter((m) => m.organisation);
      ecrireAdhesions(utilisateur.id, membre);
      // Accès support en cours (plateforme) : « adhésion » de lecture seule, jamais mise en cache.
      const supports = (support.data ?? [])
        .filter((a) => !membre.some((m) => m.organisation.id === a.organisation_id))
        .map((a) => ({
          id: `support-${a.organisation_id}`,
          role: 'support',
          site_id: null,
          support_fin: a.fin,
          organisation: { id: a.organisation_id, nom: a.nom, type: a.type, reglages: a.reglages },
        }));
      const liste = [...membre, ...supports].sort((a, b) => a.organisation.nom.localeCompare(b.organisation.nom, 'fr'));
      setAdhesions(liste);
      // Une seule organisation : choix automatique.
      if (liste.length === 1) {
        setOrganisationId(liste[0].organisation.id);
        ecrireChoix(liste[0].organisation.id);
      }
    }
    chargePour.current = utilisateur.id;
    setAdhesionsDe(utilisateur.id);
    setChargement(false);
  }, [utilisateur]);

  useEffect(() => {
    charger();
  }, [charger]);

  const adhesion = adhesions.find((m) => m.organisation.id === organisationId) ?? null;

  const valeur = {
    adhesions,
    adhesion,
    organisation: adhesion?.organisation ?? null,
    role: adhesion?.role ?? null,
    chargement: chargement || (!!utilisateur && adhesionsDe !== utilisateur.id),
    estPlateforme,
    zonesSuspendues,
    erreur,
    recharger: charger,
    choisir: (id) => {
      setOrganisationId(id);
      ecrireChoix(id);
    },
    oublier: () => {
      setOrganisationId(null);
      ecrireChoix(null);
    },
  };

  return <OrganisationContext.Provider value={valeur}>{children}</OrganisationContext.Provider>;
}

export function useOrganisation() {
  return useContext(OrganisationContext);
}
