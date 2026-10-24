import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { formaterCode, genererCode, urlCode } from '../identification/codes.js';
import { normaliserCodeApp } from '../identification/normalisation.js';
import { FORMATS, paginer, parPage } from './formats.js';

const URL_PUBLIQUE = import.meta.env.VITE_URL_PUBLIQUE || window.location.origin;
const CLE_FORMAT = 'suivi-linge.format-etiquettes';

function lireFormat() {
  try {
    const f = localStorage.getItem(CLE_FORMAT);
    return FORMATS[f] ? f : 'a4_21';
  } catch {
    return 'a4_21';
  }
}

function Etiquette({ code, svg, format }) {
  const { largeur, hauteur } = format.etiquette;
  const cote = Math.min(hauteur - 4, largeur * 0.5);
  return (
    <div className="etiquette-qr" style={{ width: `${largeur}mm`, height: `${hauteur}mm` }}>
      {code && (
        <>
          <div className="etiquette-qr-image" style={{ width: `${cote}mm`, height: `${cote}mm` }} dangerouslySetInnerHTML={{ __html: svg }} />
          {/* Taille calculée pour que « XXXX XXXX XX » (12 caractères mono) tienne sur une ligne. */}
          <div className="etiquette-qr-code" style={{ fontSize: `${Math.max(2, Math.min(4, (largeur - cote - 6) / 7.6))}mm` }}>
            {formaterCode(code)}
          </div>
        </>
      )}
    </div>
  );
}

// Planches d'étiquettes QR : codes neufs (Crockford base32) ou codes donnés par ?codes=A,B.
// Les étiquettes ne portent que l'URL opaque /v/<code> et le code (invariant 8).
export default function Etiquettes() {
  const [parametres] = useSearchParams();
  const imposes = useMemo(
    () => (parametres.get('codes') ?? '').split(',').map(normaliserCodeApp).filter(Boolean),
    [parametres],
  );
  const [cleFormat, setCleFormat] = useState(lireFormat);
  const format = FORMATS[cleFormat];
  const [nombre, setNombre] = useState(parPage(FORMATS[lireFormat()]));
  const [decalage, setDecalage] = useState(0);
  const [codes, setCodes] = useState(imposes);
  const [svgs, setSvgs] = useState({});

  useEffect(() => {
    let annule = false;
    Promise.all(
      codes.map(async (c) => [c, await QRCode.toString(urlCode(c, URL_PUBLIQUE), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })]),
    ).then((paires) => !annule && setSvgs(Object.fromEntries(paires)));
    return () => {
      annule = true;
    };
  }, [codes]);

  function choisirFormat(f) {
    setCleFormat(f);
    setDecalage(0);
    try {
      localStorage.setItem(CLE_FORMAT, f);
    } catch {
      // Préférence non mémorisée.
    }
  }

  const pages = paginer(codes, format, Math.min(decalage, parPage(format) - 1));
  const { page, marges, ecart, colonnes, etiquette } = format;

  return (
    <section className="pile">
      <style>{`@page { size: ${page.largeur}mm ${page.hauteur}mm; margin: 0; }`}</style>
      <div className="carte formulaire sans-impression">
        <p className="etiquette">Étiquettes</p>
        <h1>{imposes.length ? 'Imprimer les étiquettes' : 'Planche de QR neufs'}</h1>
        <p className="texte-secondaire">
          Chaque étiquette porte un code opaque et l’adresse <span className="mono">{URL_PUBLIQUE.replace(/^https?:\/\//, '')}/v/…</span>.
          Aucune donnée personnelle. Collez l’étiquette, puis scannez-la à l’enrôlement.
        </p>
        <label>
          <span>Format</span>
          <select value={cleFormat} onChange={(e) => choisirFormat(e.target.value)}>
            {Object.entries(FORMATS).map(([cle, f]) => (
              <option key={cle} value={cle}>
                {f.libelle}
              </option>
            ))}
          </select>
        </label>
        {parPage(format) > 1 && (
          <label>
            <span>Emplacements déjà utilisés sur la première planche</span>
            <input type="number" min="0" max={parPage(format) - 1} value={decalage} onChange={(e) => setDecalage(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        )}
        {!imposes.length && (
          <div className="rangee-actions">
            <label className="champ-nombre">
              <span>Nombre de codes</span>
              <input type="number" min="1" max="500" value={nombre} onChange={(e) => setNombre(Math.min(500, Math.max(1, Number(e.target.value) || 1)))} />
            </label>
            <button type="button" className="bouton" onClick={() => setCodes(Array.from({ length: nombre }, genererCode))}>
              Générer {nombre} code{nombre > 1 ? 's' : ''}
            </button>
          </div>
        )}
        <button type="button" className="bouton bouton-principal bouton-large" disabled={!codes.length} onClick={() => window.print()}>
          Imprimer {codes.length} étiquette{codes.length > 1 ? 's' : ''}
        </button>
        <p className="texte-secondaire">À l’impression : échelle 100 % (« taille réelle »), sans marges ajoutées par le navigateur.</p>
      </div>

      <div className="planches">
        {pages.map((cases, i) => (
          <div
            key={i}
            className="planche"
            style={{
              width: `${page.largeur}mm`,
              height: `${page.hauteur}mm`,
              paddingTop: `${marges.haut}mm`,
              paddingLeft: `${marges.gauche}mm`,
              gridTemplateColumns: `repeat(${colonnes}, ${etiquette.largeur}mm)`,
              gridAutoRows: `${etiquette.hauteur}mm`,
              columnGap: `${ecart.colonnes}mm`,
              rowGap: `${ecart.lignes}mm`,
            }}
          >
            {cases.map((c, j) => (
              <Etiquette key={j} code={c} svg={svgs[c]} format={format} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
