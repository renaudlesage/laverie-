import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';

// Lignes d'une table pour l'organisation courante.
export function useLignes(table, { select = '*', ordre = 'cree_le', active = true } = {}) {
  const { organisation } = useOrganisation();
  const [lignes, setLignes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const recharger = useCallback(async () => {
    if (!organisation || !active) return;
    setChargement(true);
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('organisation_id', organisation.id)
      .order(ordre);
    setErreur(error);
    setLignes(data ?? []);
    setChargement(false);
  }, [organisation, table, select, ordre, active]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  return { lignes, chargement, erreur, recharger };
}
