// Garde l'appli disponible hors connexion (fichiers de l'interface).
const VERSION = 'atelier-v8';
const FICHIERS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/ui.js', 'js/api-demo.js', 'js/api-supabase.js', 'data/parc.js',
  'js/views/connexion.js', 'js/views/accueil.js', 'js/views/signaler.js', 'js/views/panne.js',
  'js/views/materiel.js', 'js/views/engin.js', 'js/views/voie.js', 'js/views/profil.js', 'js/views/admin.js', 'js/views/etiquettes.js', 'js/qr.js', 'js/scanner.js', 'js/envois.js', 'js/views/tournee.js', 'js/views/releve.js',
  'img/logo.png', 'img/icone-192.png', 'img/icone-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(async (c) => {
    await c.addAll(FICHIERS);
    // Lecteur de QR code gardé d'avance, pour pouvoir scanner même sans réseau (meilleur effort).
    await c.add('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js').catch(() => {});
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Interface : réseau d'abord (pour avoir la dernière version), sinon la copie gardée.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Bibliothèques (accès à la base, lecteur de QR) : copie gardée pour fonctionner sans réseau.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((rep) => {
      if (rep.ok) { const copie = rep.clone(); caches.open(VERSION).then((c) => c.put(e.request, copie)); }
      return rep;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((rep) => {
      const copie = rep.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copie));
      return rep;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
