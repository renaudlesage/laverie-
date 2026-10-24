// Manifeste de l'application, partagé par la construction (vite.config.js) et la fonction /api/manifest
// qui y met le logo du client. Les fichiers d'api/ préfixés par « _ » ne sont pas des routes.

export const ICONES_DEFAUT = [
  { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
  { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
  { src: '/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

export const MANIFESTE = {
  id: '/',
  name: 'Suivi du linge',
  short_name: 'Suivi linge',
  description: 'Traçabilité du linge professionnel et de ses passages en laverie',
  lang: 'fr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#eef0f2',
  theme_color: '#10151b',
  icons: ICONES_DEFAUT,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fichiers du logo d'une zone dans le bucket public « logos » (préparés dans le navigateur).
export const FICHIERS_LOGO = { icone192: 'icone-192.png', icone512: 'icone-512.png', maskable: 'maskable-512.png', apple: 'apple-180.png' };

export function urlFichierLogo(supabaseUrl, org, version, fichier) {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/logos/${org}/${fichier}?v=${encodeURIComponent(version)}`;
}

// Manifeste avec le logo de la zone ; manifeste par défaut si la zone ou la version ne sont pas valides.
export function manifesteZone(supabaseUrl, org, version) {
  if (!supabaseUrl || !UUID.test(org ?? '') || !/^\d{1,15}$/.test(version ?? '')) return MANIFESTE;
  const url = (f) => urlFichierLogo(supabaseUrl, org.toLowerCase(), version, f);
  return {
    ...MANIFESTE,
    icons: [
      { src: url(FICHIERS_LOGO.icone192), sizes: '192x192', type: 'image/png' },
      { src: url(FICHIERS_LOGO.icone512), sizes: '512x512', type: 'image/png' },
      { src: url(FICHIERS_LOGO.maskable), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
