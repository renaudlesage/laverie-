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
  const [organisationId, setOrganisationId] = useState(lireChoix);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
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
    const connues = lireAdhesions(utilisateur.id);
    if (chargePour.current !== utilisateur.id) {
      if (connues) {
        setAdhesions(connues);
        setChargement(false);
      } else setChargement(true);
    }
    setErreur(null);
    const { data, error } = await supabase
      .from('membres')
      .select('id, role, site_id, organisation:organisations(id, nom, type, reglages)')
      .eq('user_id', utilisateur.id)
      .eq('actif', true);
    const enCache = error && lireAdhesions(utilisateur.id);
    if (enCache) {
      setAdhesions(enCache);
    } else if (error) {
      setErreur(error);
      setAdhesions([]);
    } else {
      const liste = data
        .filter((m) => m.organisation)
        .sort((a, b) => a.organisation.nom.localeCompare(b.organisation.nom, 'fr'));
      setAdhesions(liste);
      ecrireAdhesions(utilisateur.id, liste);
      // Une seule organisation : choix automatique.
      if (liste.length === 1) {
        setOrganisationId(liste[0].organisation.id);
        ecrireChoix(liste[0].organisation.id);
      }
    }
    chargePour.current = utilisateur.id;
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
    chargement,
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
