import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Chargement from '../composants/Chargement.jsx';
import { demarrer } from './synchro.js';

// Rôles qui travaillent hors ligne (laverie, collecte, livraison) : index local tenu à jour.
const ROLES_INDEX = ['admin', 'gestionnaire', 'operateur_laverie', 'laverie_externe'];

export default function DemarrageSynchro({ children }) {
  const { utilisateur } = useAuth();
  const { organisation, role } = useOrganisation();
  const [pret, setPret] = useState(false);
  const index = ROLES_INDEX.includes(role);
  const restreint = role === 'laverie_externe';

  useEffect(() => {
    let annule = false;
    let arreter = null;
    setPret(false);
    demarrer({ utilisateurId: utilisateur.id, organisationId: organisation.id, index, restreint }).then((arret) => {
      if (annule) arret();
      else {
        arreter = arret;
        setPret(true);
      }
    });
    return () => {
      annule = true;
      arreter?.();
    };
  }, [utilisateur.id, organisation.id, index, restreint]);

  return pret ? children : <Chargement />;
}
