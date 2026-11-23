// Garde l'appli disponible hors connexion (fichiers de l'interface).
const VERSION = 'atelier-v15';
const FICHIERS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/ui.js', 'js/api-demo.js', 'js/api-supabase.js', 'data/parc.js',
  'js/views/connexion.js', 'js/views/accueil.js', 'js/views/signaler.js', 'js/views/panne.js',
  'js/views/materiel.js', 'js/views/engin.js', 'js/views/voie.js', 'js/views/profil.js', 'js/views/admin.js', 'js/views/etiquettes.js', 'js/qr.js', 'js/scanner.js', 'js/envois.js', 'js/views/tournee.js', 'js/views/releve.js', 'js/recadrage.js', 'js/notifications.js',
  'img/logo.png', 'img/icone-192.png', 'img/icone-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(async (c) => {
    await c.addAll(FICHIERS.map((f) => new Request(f, { cache: 'reload' })));
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
  // « no-cache » : on redemande toujours au serveur s'il y a du nouveau (sinon le navigateur
  // peut resservir une ancienne version pendant 10 minutes après une mise à jour).
  e.respondWith(
    fetch(e.request.mode === 'navigate' ? e.request.url : e.request, { cache: 'no-cache' }).then((rep) => {
      const copie = rep.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copie));
      return rep;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});

// ───── Notifications reçues ─────
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { corps: e.data?.text() }; }
  // L'iPhone écrit déjà « from CFV Atelier » sous le titre : un titre « CFV Atelier » ferait doublon,
  // on remonte alors le texte en titre.
  let titre = (m.titre || '').trim(), corps = m.corps || '';
  if (!titre || titre === 'CFV Atelier') { titre = corps || 'CFV Atelier'; corps = ''; }
  e.waitUntil(self.registration.showNotification(titre, {
    body: corps, icon: 'img/icone-192.png', badge: 'img/icone-192.png',
    tag: m.tag, renotify: !!m.tag, data: { url: m.url || '#/accueil' },
  }));
});
// Appui sur la notification : ouvre l'appli (ou la ramène au premier plan) sur la bonne fiche.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const chemin = e.notification.data?.url || '#/accueil';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (fenetres) => {
    const f = fenetres.find((c) => c.url.startsWith(self.registration.scope));
    if (f) { await f.focus(); f.postMessage({ type: 'aller', chemin }); return; }
    return self.clients.openWindow(new URL(self.registration.scope).href + chemin);
  }));
});
