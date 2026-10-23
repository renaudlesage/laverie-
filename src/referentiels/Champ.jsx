// Champ de formulaire générique, piloté par une description :
// { nom, libelle, type: 'texte' | 'nombre' | 'zone' | 'selection' | 'case', options, requis, aide }
export default function Champ({ champ, valeur, onChange, desactive }) {
  const id = `champ-${champ.nom}`;
  const commun = { id, name: champ.nom, disabled: desactive, required: champ.requis };

  if (champ.type === 'case') {
    return (
      <label className="champ-case" htmlFor={id}>
        <input {...commun} type="checkbox" checked={!!valeur} onChange={(e) => onChange(e.target.checked)} />
        <span>{champ.libelle}</span>
      </label>
    );
  }

  let saisie;
  if (champ.type === 'selection') {
    saisie = (
      <select {...commun} value={valeur ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        {!champ.requis && <option value="">—</option>}
        {champ.requis && (valeur == null || valeur === '') && <option value="">Choisir…</option>}
        {champ.options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
    );
  } else if (champ.type === 'zone') {
    saisie = <textarea {...commun} rows={3} value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} />;
  } else if (champ.type === 'nombre') {
    saisie = (
      <input
        {...commun}
        type="number"
        inputMode="numeric"
        min={champ.min}
        max={champ.max}
        value={valeur ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    );
  } else {
    saisie = (
      <input
        {...commun}
        type={champ.typeSaisie ?? 'text'}
        pattern={champ.motif}
        autoComplete="off"
        value={valeur ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <label htmlFor={id}>
      <span>
        {champ.libelle}
        {champ.requis && <span className="requis"> *</span>}
      </span>
      {saisie}
      {champ.aide && <small className="aide">{champ.aide}</small>}
    </label>
  );
}
