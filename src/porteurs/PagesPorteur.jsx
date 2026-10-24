import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import FichePorteur from './FichePorteur.jsx';

export function PagePorteur() {
  const { id } = useParams();
  return <FichePorteur key={id} porteurId={id} />;
}

// Espace du pompier : la fiche porteur reliée à son compte.
export function MesVetements() {
  const { utilisateur } = useAuth();
  const { organisation } = useOrganisation();
  const [id, setId] = useState(undefined);
  useEffect(() => {
    supabase
      .from('porteurs')
      .select('id')
      .eq('organisation_id', organisation.id)
      .eq('user_id', utilisateur.id)
      .maybeSingle()
      .then(({ data }) => setId(data?.id ?? null));
  }, [organisation.id, utilisateur.id]);
  if (id === undefined) return <p className="carte">Chargement…</p>;
  if (id === null) return <p className="message">Aucune fiche porteur n’est reliée à votre compte : demandez-le à votre administrateur.</p>;
  return <FichePorteur porteurId={id} monEspace />;
}
