// Garde l'appli disponible hors connexion (fichiers de l'interface).
// À faire correspondre à VERSION dans js/version.js à chaque publication.
const VERSION = 'atelier-v1.10.9';
// Ajoute un paramètre propre à cette version à chaque requête vers notre propre site : ni le CDN de
// GitHub Pages, ni la mémoire HTTP du téléphone (différente de celle qu'on gère nous-même ci-dessous)
// n'ont jamais vu cette adresse exacte avant, donc aucun des deux ne peut la resservir depuis une
// ancienne copie — « no-cache » demande une revalidation, mais un intermédiaire peut mal y répondre.
const avecVersion = (url) => { const u = new URL(url, location.href); u.searchParams.set('cfv_v', VERSION); return u.toString(); };
// Sans CES fichiers, l'appli ne peut pas démarrer hors connexion : ils doivent TOUS être récupérés,
// sinon l'installation échoue exprès et l'ancienne version — qui, elle, fonctionne — reste en place.
const ESSENTIELS = [
  './', 'index.html', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/version.js', 'js/ui.js', 'js/envois.js',
  'js/api-demo.js', 'js/api-supabase.js', 'js/views/connexion.js', 'js/views/accueil.js',
];
// Confort : leur absence n'empêche pas l'appli d'ouvrir, ils seront redemandés au serveur à l'usage.
const AUTRES = [
  'manifest.webmanifest', 'data/parc.js',
  'js/views/signaler.js', 'js/views/panne.js',
  'js/views/materiel.js', 'js/views/engin.js', 'js/views/voie.js', 'js/views/profil.js', 'js/views/admin.js', 'js/views/etiquettes.js', 'js/qr.js', 'js/scanner.js', 'js/views/tournee.js', 'js/views/releve.js', 'js/recadrage.js', 'js/notifications.js',
  'js/views/exports.js', 'js/pdf.js', 'js/fichiers.js', 'js/voie-cfv.js', 'js/carte-voie.js', 'js/views/carte.js',
  'img/logo.png', 'img/icone-192.png', 'img/icone-512.png', 'img/badge-96.png',
];
// On récupère depuis l'adresse « propre à cette version » (voir avecVersion), mais on range le
// résultat sous l'adresse normale du fichier : le reste de l'appli continue de le demander sans paramètre.
async function garder(c, f) {
  const rep = await fetch(new Request(avecVersion(f), { cache: 'reload' }));
  if (!rep.ok) throw new Error('échec ' + f + ' (' + rep.status + ')');
  await c.put(f, rep);
}
const complet = async (c) => (await Promise.all(ESSENTIELS.map((f) => c.match(f)))).every(Boolean);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(ESSENTIELS.map((f) => garder(c, f)));   // tout ou rien
    await Promise.allSettled(AUTRES.map((f) => garder(c, f))); // au mieux
    // Lecteur de QR code gardé d'avance, pour pouvoir scanner même sans réseau (meilleur effort).
    await c.add('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js').catch(() => {});
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // On ne supprime les anciennes copies QUE si la nouvelle est complète : mieux vaut garder une
    // version précédente qui fonctionne hors connexion que de laisser l'appareil sans rien.
    const c = await caches.open(VERSION);
    if (await complet(c)) {
      const cles = await caches.keys();
      await Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    }
    await self.clients.claim();
  })());
});
// Affiché seulement si l'appli n'a jamais pu être gardée sur cet appareil (sinon on sert sa page).
const SECOURS = `<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>CFV Atelier</title>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#F4F5F7;color:#15181E;
  display:flex;min-height:100vh;align-items:center;justify-content:center;padding:28px;text-align:center">
<div><h1 style="font-size:19px;margin:0 0 10px">Hors connexion</h1>
<p style="margin:0;color:#545B66;line-height:1.5">L'appli n'a pas encore été gardée sur ce téléphone.
Ouvrez-la une fois avec du réseau : elle fonctionnera ensuite sans connexion.</p></div></body></html>`;

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
  // Adresse « propre à cette version » (voir avecVersion ci-dessus) : ni le CDN devant GitHub Pages
  // ni la mémoire HTTP du téléphone ne peuvent la resservir depuis une ancienne copie.
  // ignoreVary : la copie gardée a été récupérée avec cette adresse-là, ses en-têtes ne
  // correspondent pas exactement à ceux de la demande d'origine.
  const gardee = () => caches.match(e.request, { ignoreVary: true })
    .then((r) => r || caches.match(e.request, { ignoreVary: true, ignoreSearch: true }));
  e.respondWith((async () => {
    // Hors connexion : la copie gardée, tout de suite. Règle nette, pas de minuteur — le résultat
    // ne dépend plus de la vitesse du réseau, donc l'appli se comporte toujours pareil.
    if (!navigator.onLine) {
      const copie = await gardee();
      if (copie) return copie;
    }
    const rep = await fetch(avecVersion(e.request.url), { cache: 'no-cache' }).then((r) => {
      if (r && r.ok) { const copie = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copie)); }
      return r;
    }).catch(() => null);
    if (rep) return rep;
    const copie = await gardee();
    if (copie) return copie;
    // Dernier recours pour une navigation : la page de l'appli, sinon un message clair —
    // jamais l'écran « Safari n'est pas connecté à Internet ».
    if (e.request.mode === 'navigate') {
      const page = await caches.match('index.html', { ignoreVary: true }) || await caches.match('./', { ignoreVary: true });
      if (page) return page;
      return new Response(SECOURS, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return Response.error();
  })());
});

// Rafraîchissement demandé par le bouton « Forcer la mise à jour » : on retélécharge tout dans le
// cache existant, fichier par fichier. Rien n'est supprimé au préalable — si un téléchargement
// échoue, l'ancienne copie reste en place et l'appli continue de fonctionner hors connexion.
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'rafraichir') return;
  e.waitUntil((async () => {
    let ok = false;
    try {
      const c = await caches.open(VERSION);
      await Promise.all(ESSENTIELS.map((f) => garder(c, f)));
      await Promise.allSettled(AUTRES.map((f) => garder(c, f)));
      ok = await complet(c);
    } catch { ok = false; }
    e.source?.postMessage({ type: 'rafraichi', ok });
  })());
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
    // Android réduit le « badge » (petite icône de la barre d'état) à sa seule silhouette : il lui
    // faut un PNG transparent, sinon l'icône de l'appli, opaque, s'affiche en carré noir ou blanc.
    body: corps, icon: 'img/icone-192.png', badge: 'img/badge-96.png',
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
