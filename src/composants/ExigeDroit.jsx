import { useDroits } from '../organisation/useDroits.js';

export default function ExigeDroit({ droit, children }) {
  const droits = useDroits();
  if (!droits[droit]) {
    return (
      <section className="carte">
        <h1>Accès réservé</h1>
        <p>Votre rôle ne donne pas accès à cet écran.</p>
      </section>
    );
  }
  return children;
}
