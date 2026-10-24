import { supabase } from './supabase.js';
import { FICHIERS_LOGO, urlFichierLogo } from '../../api/_manifeste.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const TAILLE_MAX = 5 * 1024 * 1024;
export const TYPES_LOGO = 'image/png,image/jpeg,image/webp,image/svg+xml';

// Version du logo (horodatage en ms) : change à chaque nouveau logo, vide les caches.
export const versionLogo = (logoLe) => (logoLe ? String(new Date(logoLe).getTime()) : null);

export function urlLogo(org, logoLe, fichier = FICHIERS_LOGO.icone192) {
  const v = versionLogo(logoLe);
  return v && SUPABASE_URL ? urlFichierLogo(SUPABASE_URL, org, v, fichier) : null;
}

function chargerImage(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => resolve({ img, liberer: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible : choisissez un fichier PNG, JPEG, WebP ou SVG.'));
    };
    img.src = url;
  });
}

// Logo centré, proportions gardées, dans un carré de `taille` px ; `part` = fraction occupée.
function dessiner(img, taille, part, fond) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = taille;
  const ctx = canvas.getContext('2d');
  if (fond) {
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, taille, taille);
  }
  const l = img.naturalWidth || 512;
  const h = img.naturalHeight || 512;
  const echelle = (taille * part) / Math.max(l, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (taille - l * echelle) / 2, (taille - h * echelle) / 2, l * echelle, h * echelle);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Icônes de l'application à partir du logo choisi : « any » sur fond transparent, « maskable » et
// Apple sur fond blanc avec la marge de sécurité (le système découpe un cercle ou un carré arrondi).
export async function preparerIcones(fichier) {
  if (fichier.size > TAILLE_MAX) throw new Error('Fichier trop lourd (5 Mo au plus).');
  const { img, liberer } = await chargerImage(fichier);
  try {
    return {
      [FICHIERS_LOGO.icone192]: await dessiner(img, 192, 0.92),
      [FICHIERS_LOGO.icone512]: await dessiner(img, 512, 0.92),
      [FICHIERS_LOGO.maskable]: await dessiner(img, 512, 0.62, '#ffffff'),
      [FICHIERS_LOGO.apple]: await dessiner(img, 180, 0.82, '#ffffff'),
    };
  } finally {
    liberer();
  }
}

export async function enregistrerLogo(org, fichier) {
  const icones = await preparerIcones(fichier);
  for (const [nom, blob] of Object.entries(icones)) {
    const { error } = await supabase.storage.from('logos').upload(`${org}/${nom}`, blob, { upsert: true, contentType: 'image/png' });
    if (error) throw error;
  }
  const { error } = await supabase.rpc('definir_logo', { org, present: true });
  if (error) throw error;
}

export async function retirerLogo(org) {
  const { error } = await supabase.rpc('definir_logo', { org, present: false });
  if (error) throw error;
  await supabase.storage.from('logos').remove(Object.values(FICHIERS_LOGO).map((f) => `${org}/${f}`));
}

function lien(rel) {
  let l = document.head.querySelector(`link[rel="${rel}"]`);
  if (!l) {
    l = document.createElement('link');
    l.rel = rel;
    document.head.appendChild(l);
  }
  if (!l.dataset.defaut) l.dataset.defaut = l.getAttribute('href') ?? '';
  return l;
}

// Icônes de la page et manifeste de l'application : ceux de la zone si elle a un logo, sinon ceux par défaut.
// L'icône d'une application déjà installée est celle de la zone ouverte au moment de l'installation.
export function appliquerIcones(org, logoLe) {
  const v = versionLogo(logoLe);
  const manifeste = lien('manifest');
  const icone = lien('icon');
  const apple = lien('apple-touch-icon');
  if (org && v && SUPABASE_URL) {
    manifeste.href = `/api/manifest?org=${org}&v=${v}`;
    icone.href = urlFichierLogo(SUPABASE_URL, org, v, FICHIERS_LOGO.icone192);
    apple.href = urlFichierLogo(SUPABASE_URL, org, v, FICHIERS_LOGO.apple);
  } else {
    for (const l of [manifeste, icone, apple]) if (l.dataset.defaut) l.href = l.dataset.defaut;
  }
}
