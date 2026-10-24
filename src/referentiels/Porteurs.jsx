import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useDroits } from '../organisation/useDroits.js';
import EcranReferentiel from './EcranReferentiel.jsx';
import { useLignes } from './useLignes.js';

export default function Porteurs() {
  const { organisation } = useOrganisation();
  const { estAdmin, gerePorteurs } = useDroits();
  const navigate = useNavigate();
  const { lignes: sites } = useLignes('sites', { ordre: 'nom' });
  const [comptes, setComptes] = useState([]);

  // Comptes « porteur » rattachables à une fiche (liste réservée à l'admin).
  useEffect(() => {
    if (!estAdmin) return;
    supabase.rpc('membres_organisation', { org: organisation.id }).then(({ data }) => {
      setComptes((data ?? []).filter((m) => m.role === 'porteur'));
    });
  }, [estAdmin, organisation.id]);

  const nomsSites = Object.fromEntries(sites.map((s) => [s.id, s.nom]));
  const champs = [
    { nom: 'matricule', libelle: 'Matricule', requis: true },
    { nom: 'nom', libelle: 'Nom' },
    { nom: 'prenom', libelle: 'Prénom' },
    { nom: 'casier', libelle: 'Casier' },
    { nom: 'site_id', libelle: 'Poste', type: 'selection', options: sites.map((s) => ({ valeur: s.id, libelle: s.nom })) },
    {
      nom: 'user_id',
      libelle: 'Compte dans l’app',
      type: 'selection',
      options: comptes.map((c) => ({ valeur: c.user_id, libelle: c.email })),
      aide: 'Facultatif : relie la fiche au compte d’un membre « Porteur » pour qu’il voie ses vêtements.',
      masque: () => !estAdmin,
    },
    { nom: 'actif', libelle: 'Actif', type: 'case' },
  ];

  return (
    <EcranReferentiel
      titre="Porteurs"
      table="porteurs"
      ordre="matricule"
      champs={champs}
      valeursInitiales={{ actif: true }}
      peutModifier={gerePorteurs}
      ouvrir={(p) => navigate(`/porteurs/${p.id}`)}
      avantListe={
        gerePorteurs && (
          <p>
            <Link to="/parametres/porteurs/import" className="bouton">
              Importer un fichier CSV
            </Link>
          </p>
        )
      }
      resume={(p) => ({
        titre: [p.matricule, [p.prenom, p.nom].filter(Boolean).join(' ')].filter(Boolean).join(' — '),
        detail: [nomsSites[p.site_id], p.casier && `casier ${p.casier}`, p.anonymise_le && 'anonymisé'].filter(Boolean).join(' · '),
      })}
    />
  );
}
