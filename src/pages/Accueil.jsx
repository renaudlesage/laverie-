import { useOrganisation } from '../organisation/OrganisationProvider.jsx';

export default function Accueil() {
  const { organisation, role } = useOrganisation();
  return (
    <section className="carte">
      <h1>{organisation.nom}</h1>
      <p>
        Connecté en tant que <strong>{role}</strong>.
      </p>
      <p className="texte-secondaire">Les écrans métier arrivent avec les jalons suivants.</p>
    </section>
  );
}
