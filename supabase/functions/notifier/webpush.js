// Envoi de notifications Web Push (RFC 8291 « aes128gcm » + VAPID RFC 8292), avec WebCrypto seulement.
// Fonctionne dans Deno (fonctions Supabase) comme dans Node 18+.

const te = new TextEncoder();
export const b64u = {
  encode(buf) {
    const b = new Uint8Array(buf); let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  },
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
async function hmac(cle, donnees) {
  const k = await crypto.subtle.importKey('raw', cle, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, donnees));
}

// Chiffre le message pour un abonnement { endpoint, keys: { p256dh, auth } }. Options de test : sel et clé éphémère imposés.
export async function chiffrer(abonnement, message, test = {}) {
  const uaPublic = b64u.decode(abonnement.keys.p256dh);
  const authSecret = b64u.decode(abonnement.keys.auth);
  const ephemere = test.paire || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemere.publicKey));
  const uaCle = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaCle }, ephemere.privateKey, 256));
  const prkCle = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkCle, concat(te.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const sel = test.sel || crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(sel, ikm);
  const cek = (await hmac(prk, concat(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const clair = concat(typeof message === 'string' ? te.encode(message) : message, new Uint8Array([2]));
  const aes = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, clair));
  const rs = new Uint8Array([0, 0, 0x10, 0]);   // taille d'enregistrement : 4096
  return concat(sel, rs, new Uint8Array([asPublic.length]), asPublic, chiffre);
}

// Jeton VAPID (JWT ES256) pour l'origine du service push.
export async function enteteVapid(endpoint, { publique, priveeJwk, sujet }) {
  const aud = new URL(endpoint).origin;
  const entete = b64u.encode(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corps = b64u.encode(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujet })));
  const cle = await crypto.subtle.importKey('jwk', priveeJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cle, te.encode(`${entete}.${corps}`)));
  return `vapid t=${entete}.${corps}.${b64u.encode(sig)}, k=${publique}`;
}

// Envoie ; renvoie le code HTTP du service push (201 = accepté, 404/410 = abonnement expiré).
export async function envoyer(abonnement, message, vapid, { ttl = 86400, urgence = 'normal' } = {}) {
  const corps = await chiffrer(abonnement, message);
  const rep = await fetch(abonnement.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      TTL: String(ttl), Urgency: urgence, Authorization: await enteteVapid(abonnement.endpoint, vapid),
    },
    body: corps,
  });
  return { statut: rep.status, texte: rep.ok ? '' : (await rep.text()).slice(0, 300) };
}
