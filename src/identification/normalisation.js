// Valeur canonique d'un identifiant lu (CLAUDE.md §6).
//   nfc, uhf            → hexadécimal majuscule sans séparateur (04:a2:… → 04A2…)
//   QR de l'app         → le <code> de ${VITE_URL_PUBLIQUE}/v/<code>, en Crockford base32 majuscule
//   autres codes        → valeur lue sans espaces ni caractères de contrôle, casse conservée

export const TECHNOLOGIES = ['code_barres', 'qr', 'datamatrix', 'nfc', 'uhf'];

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{10}$/;

// Espaces (y compris insécables) et caractères de contrôle (dont le GS des codes GS1).
function nettoyer(valeur) {
  return String(valeur ?? '').replace(/[\s\u0000-\u001f\u007f-\u009f\u00a0\u200b\ufeff]/g, '');
}

export function normaliserHex(valeur) {
  const hex = String(valeur ?? '').replace(/[\s:\-.]/g, '').toUpperCase();
  return /^[0-9A-F]+$/.test(hex) ? hex : null;
}

// Saisie tolérante d'un code de l'app : minuscules, tirets, I/L→1, O→0, U exclu.
export function normaliserCodeApp(valeur) {
  const code = nettoyer(valeur)
    .replace(/-/g, '')
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  return CROCKFORD.test(code) ? code : null;
}

// Extrait <code> d'une URL ${urlPublique}/v/<code> (http ou https, avec ou sans / final).
export function extraireCodeUrl(valeur, urlPublique) {
  if (!urlPublique) return null;
  const base = urlPublique.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
  const brut = nettoyer(valeur);
  const sansSchema = brut.replace(/^https?:\/\//i, '');
  if (!sansSchema.toLowerCase().startsWith(`${base}/v/`)) return null;
  const code = sansSchema.slice(base.length + 3).split(/[/?#]/)[0];
  return normaliserCodeApp(decodeURIComponent(code));
}

// lecture : { technologie?, valeur_brute } → { technologie, valeur } ou null si illisible.
// technologie absente (douchette sans profil) : on garde la valeur nettoyée, la résolution
// cherchera dans toutes les technologies.
export function normaliser(lecture, { urlPublique } = {}) {
  const { technologie = null, valeur_brute: brut } = lecture;

  if (technologie === 'nfc' || technologie === 'uhf') {
    const hex = normaliserHex(brut);
    return hex ? { technologie, valeur: hex } : null;
  }

  const code = extraireCodeUrl(brut, urlPublique);
  if (code) return { technologie: 'qr', valeur: code };

  const valeur = nettoyer(brut);
  if (!valeur) return null;
  return { technologie, valeur };
}

// Valeurs à chercher pour une lecture dont la technologie est inconnue :
// la valeur telle quelle, plus sa forme hexadécimale (UID NFC tapé par un lecteur USB).
export function candidats({ technologie, valeur }) {
  if (technologie) return [{ technologie, valeur }];
  const liste = [{ technologie: null, valeur }];
  const hex = normaliserHex(valeur);
  if (hex && hex !== valeur) liste.push({ technologie: null, valeur: hex });
  const codeApp = normaliserCodeApp(valeur);
  if (codeApp && codeApp !== valeur) liste.push({ technologie: null, valeur: codeApp });
  return liste;
}
