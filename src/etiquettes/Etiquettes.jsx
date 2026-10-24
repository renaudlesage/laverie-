import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { formaterCode, genererCode, urlCode } from '../identification/codes.js';
import { normaliserCodeApp } from '../identification/normalisation.js';
import {
  CHAMPS_PERSONNALISE,
  CLE_PERSONNALISE,
  copier,
  disposition,
  ecrireValeur,
  FORMATS,
  lireValeur,
  paginer,
  parPage,
  verifierFormat,
} from './formats.js';

const URL_PUBLIQUE = import.meta.env.VITE_URL_PUBLIQUE || window.location.origin;
const CLE_REGLAGES = 'suivi-linge.etiquettes';
const REGLAGES_DEFAUT = { cle: 'a4_21', personnalise: copier(FORMATS.a4_21), afficherCode: true, calage: { x: 0, y: 0 } };

// Réglages d'impression propres à l'appareil (imprimante et support varient d'un poste à l'autre).
function lireReglages() {
  try {
    const r = JSON.parse(localStorage.getItem(CLE_REGLAGES));
    if (r && (FORMATS[r.cle] || r.cle === CLE_PERSONNALISE) && r.personnalise) return { ...REGLAGES_DEFAUT, ...r };
  } catch {
    // Réglages absents ou illisibles : valeurs par défaut.
  }
  return REGLAGES_DEFAUT;
}

const PX_PAR_MM = 96 / 25.4;

// Zoom de l'aperçu : une planche A4 tient dans la largeur de l'écran, une petite étiquette est agrandie.
function zoomApercu(largeurMm) {
  const disponible = Math.min(window.innerWidth - 48, 820);
  return Math.min(3, disponible / (largeurMm * PX_PAR_MM));
}

function nombreMm(v) {
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

function Etiquette({ code, svg, format, afficherCode }) {
  const { largeur, hauteur } = format.etiquette;
  const d = disposition(format.etiquette, { afficherCode });
  return (
    <div
      className={`etiquette-qr etiquette-qr-${d.sens}`}
      style={{ width: `${largeur}mm`, height: `${hauteur}mm`, padding: `${d.marge}mm`, gap: `${d.marge}mm` }}
    >
      {code && (
        <>
          <div className="etiquette-qr-image" style={{ width: `${d.qr}mm`, height: `${d.qr}mm` }} dangerouslySetInnerHTML={{ __html: svg }} />
          {d.police > 0 && (
            <div className="etiquette-qr-code" style={{ fontSize: `${d.police}mm` }}>
              {formaterCode(code)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Planches d'étiquettes QR : codes neufs (Crockford base32) ou codes donnés par ?codes=A,B.
// Les étiquettes ne portent que l'URL opaque /v/<code> et, si la place le permet, le code (invariant 8).
export default function Etiquettes() {
  const [parametres] = useSearchParams();
  const imposes = useMemo(
    () => (parametres.get('codes') ?? '').split(',').map(normaliserCodeApp).filter(Boolean),
    [parametres],
  );
  const [reglages, setReglages] = useState(lireReglages);
  const format = reglages.cle === CLE_PERSONNALISE ? reglages.personnalise : FORMATS[reglages.cle];
  const [nombre, setNombre] = useState(() => Math.min(500, parPage(format)));
  const [decalage, setDecalage] = useState(0);
  const [codes, setCodes] = useState(imposes);
  const [svgs, setSvgs] = useState({});
  const controle = verifierFormat(format, { afficherCode: reglages.afficherCode });

  useEffect(() => {
    try {
      localStorage.setItem(CLE_REGLAGES, JSON.stringify(reglages));
    } catch {
      // Réglages valables pour la session seulement.
    }
  }, [reglages]);

  useEffect(() => {
    let annule = false;
    Promise.all(
      codes.map(async (c) => [c, await QRCode.toString(urlCode(c, URL_PUBLIQUE), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })]),
    ).then((paires) => !annule && setSvgs(Object.fromEntries(paires)));
    return () => {
      annule = true;
    };
  }, [codes]);

  function choisirFormat(cle) {
    setDecalage(0);
    setReglages((r) => ({
      ...r,
      cle,
      // Passer en personnalisé part du modèle affiché, plus simple à ajuster.
      personnalise: cle === CLE_PERSONNALISE && r.cle !== CLE_PERSONNALISE ? copier(FORMATS[r.cle]) : r.personnalise,
    }));
  }

  function modifierPersonnalise(chemin, texte) {
    const valeur = Number(String(texte).replace(',', '.'));
    setReglages((r) => ({ ...r, personnalise: ecrireValeur(r.personnalise, chemin, texte === '' ? Number.NaN : valeur) }));
  }

  function modifierCalage(axe, texte) {
    const valeur = Number(String(texte).replace(',', '.')) || 0;
    setReglages((r) => ({ ...r, calage: { ...r.calage, [axe]: Math.max(-20, Math.min(20, valeur)) } }));
  }

  const pages = paginer(codes, format, Math.min(decalage, parPage(format) - 1));
  const { page, marges, ecart, colonnes, etiquette } = format;
  const imprimable = controle.erreurs.length === 0 && codes.length > 0;

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
          <select value={reglages.cle} onChange={(e) => choisirFormat(e.target.value)}>
            {Object.entries(FORMATS).map(([cle, f]) => (
              <option key={cle} value={cle}>
                {f.libelle}
              </option>
            ))}
            <option value={CLE_PERSONNALISE}>Personnalisé…</option>
          </select>
        </label>

        {reglages.cle === CLE_PERSONNALISE && (
          <fieldset className="format-personnalise">
            <legend>Format personnalisé (mm)</legend>
            <p className="texte-secondaire">
              Rouleau ou imprimante d’étiquettes : page = taille d’une étiquette, 1 colonne, 1 ligne, marges et écarts à 0.
            </p>
            <div className="grille-champs">
              {CHAMPS_PERSONNALISE.map((c) => {
                const v = lireValeur(reglages.personnalise, c.chemin);
                return (
                  <label key={c.chemin.join('.')}>
                    <span>{c.libelle}</span>
                    <input
                      inputMode="decimal"
                      value={Number.isFinite(v) ? nombreMm(v) : ''}
                      onChange={(e) => modifierPersonnalise(c.chemin, e.target.value)}
                      aria-label={c.libelle}
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <label className="champ-case">
          <input
            type="checkbox"
            checked={reglages.afficherCode}
            onChange={(e) => setReglages((r) => ({ ...r, afficherCode: e.target.checked }))}
          />
          <span>Imprimer le code en clair à côté du QR (saisie manuelle possible si le QR est abîmé)</span>
        </label>

        {controle.erreurs.map((e) => (
          <p key={e} className="message message-erreur">
            {e}
          </p>
        ))}
        {controle.avertissements.map((e) => (
          <p key={e} className="message message-veille">
            {e}
          </p>
        ))}

        {parPage(format) > 1 && (
          <label>
            <span>Emplacements déjà utilisés sur la première planche</span>
            <input
              type="number"
              min="0"
              max={parPage(format) - 1}
              value={decalage}
              onChange={(e) => setDecalage(Math.max(0, Math.min(parPage(format) - 1, Number(e.target.value) || 0)))}
            />
          </label>
        )}

        <details className="calage">
          <summary>
            Réglage fin de l’imprimante{reglages.calage.x || reglages.calage.y ? ` (${nombreMm(reglages.calage.x)} / ${nombreMm(reglages.calage.y)} mm)` : ''}
          </summary>
          <p className="texte-secondaire">Si l’impression est décalée par rapport aux étiquettes, déplacez-la (valeurs négatives : vers la gauche ou le haut).</p>
          <div className="grille-champs">
            <label>
              <span>Vers la droite (mm)</span>
              <input inputMode="decimal" value={nombreMm(reglages.calage.x)} onChange={(e) => modifierCalage('x', e.target.value)} />
            </label>
            <label>
              <span>Vers le bas (mm)</span>
              <input inputMode="decimal" value={nombreMm(reglages.calage.y)} onChange={(e) => modifierCalage('y', e.target.value)} />
            </label>
          </div>
        </details>

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
        <button type="button" className="bouton bouton-principal bouton-large" disabled={!imprimable} onClick={() => window.print()}>
          Imprimer {codes.length} étiquette{codes.length > 1 ? 's' : ''}
        </button>
        <p className="texte-secondaire">À l’impression : échelle 100 % (« taille réelle »), sans marges ajoutées par le navigateur.</p>
      </div>

      {controle.erreurs.length === 0 && (
        <div className="planches">
          {pages.map((cases, i) => (
            <div
              key={i}
              className="planche"
              style={{
                '--zoom-apercu': zoomApercu(page.largeur),
                width: `${page.largeur}mm`,
                height: `${page.hauteur}mm`,
                paddingTop: `${Math.max(0, marges.haut + reglages.calage.y)}mm`,
                paddingLeft: `${Math.max(0, marges.gauche + reglages.calage.x)}mm`,
                gridTemplateColumns: `repeat(${colonnes}, ${etiquette.largeur}mm)`,
                gridAutoRows: `${etiquette.hauteur}mm`,
                columnGap: `${ecart.colonnes}mm`,
                rowGap: `${ecart.lignes}mm`,
              }}
            >
              {cases.map((c, j) => (
                <Etiquette key={j} code={c} svg={svgs[c]} format={format} afficherCode={reglages.afficherCode} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
