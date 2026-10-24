// Codes générés par l'app : 10 caractères Crockford base32 (50 bits aléatoires), opaques.
// Aucune donnée personnelle sur un support (invariant 8).

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function genererCode() {
  const octets = new Uint8Array(10);
  crypto.getRandomValues(octets);
  // 256 est un multiple de 32 : chaque caractère est équiprobable.
  return Array.from(octets, (o) => ALPHABET[o & 31]).join('');
}

// Lisibilité à l'impression : « 7K3M 9P2Q XR ». La saisie tolère les espaces.
export function formaterCode(code) {
  return code.replace(/^(.{4})(.{4})(.{2})$/, '$1 $2 $3');
}

export function urlCode(code, urlPublique) {
  return `${urlPublique.replace(/\/+$/, '')}/v/${code}`;
}

export function nouvelId() {
  return crypto.randomUUID();
}
