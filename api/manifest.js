// /api/manifest?org=<uuid>&v=<version> : manifeste de l'application avec le logo de la zone pour icône.
// Pas d'accès à la base : les icônes sont les fichiers publics du bucket « logos » de la zone.
import { manifesteZone } from './_manifeste.js';

export default function handler(req, res) {
  const { org, v } = req.query ?? {};
  const manifeste = manifesteZone(process.env.VITE_SUPABASE_URL, String(org ?? ''), String(v ?? ''));
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send(JSON.stringify(manifeste));
}
