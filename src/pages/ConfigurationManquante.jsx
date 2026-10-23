export default function ConfigurationManquante({ variables }) {
  return (
    <div className="page-centree">
      <div className="carte">
        <h1>Configuration incomplète</h1>
        <p>Variables d'environnement manquantes :</p>
        <ul>
          {variables.map((v) => (
            <li key={v}>
              <code>{v}</code>
            </li>
          ))}
        </ul>
        <p className="texte-secondaire">
          En local ou sur StackBlitz : copiez <code>.env.example</code> en <code>.env</code>. Sur Vercel : Settings → Environment Variables, puis redéployez.
        </p>
      </div>
    </div>
  );
}
