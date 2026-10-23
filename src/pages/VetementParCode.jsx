import { useParams } from 'react-router-dom';

// Route publique des QR : protégée par ExigeSession et ExigeOrganisation,
// elle n'affiche rien sans session autorisée. La résolution arrive au jalon M3.
export default function VetementParCode() {
  const { code } = useParams();
  return (
    <section className="carte">
      <h1>Vêtement</h1>
      <p>
        Code lu : <code>{code}</code>
      </p>
      <p className="texte-secondaire">La fiche vêtement sera disponible au jalon M3.</p>
    </section>
  );
}
