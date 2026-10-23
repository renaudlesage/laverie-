import { createContext, useCallback, useContext, useEffect, useState } from 'react';
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

export function OrganisationProvider({ children }) {
  const { utilisateur } = useAuth();
  const [adhesions, setAdhesions] = useState([]);
  const [organisationId, setOrganisationId] = useState(lireChoix);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    if (!utilisateur) {
      setAdhesions([]);
      setChargement(false);
      return;
    }
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from('membres')
      .select('id, role, site_id, organisation:organisations(id, nom, type)')
      .eq('user_id', utilisateur.id)
      .eq('actif', true);
    if (error) {
      setErreur(error);
      setAdhesions([]);
    } else {
      const liste = data
        .filter((m) => m.organisation)
        .sort((a, b) => a.organisation.nom.localeCompare(b.organisation.nom, 'fr'));
      setAdhesions(liste);
      // Une seule organisation : choix automatique.
      if (liste.length === 1) {
        setOrganisationId(liste[0].organisation.id);
        ecrireChoix(liste[0].organisation.id);
      }
    }
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
