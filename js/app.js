// Démarrage, navigation entre écrans et session.
import { CONFIG } from './config.js';
import { esc, icone, toast, peutInspecter } from './ui.js';
import { creerEnvois } from './envois.js';

// Lien reçu par e-mail (invitation ou mot de passe oublié) : à lire avant que la session ne l'efface.
const paramsLien = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
let lienAuth = paramsLien.get('type');               // 'invite' | 'recovery' | null
const erreurLien = paramsLien.get('error_description');
if (erreurLien) history.replaceState(null, '', location.pathname + '#/');

const api = CONFIG.supabaseUrl
  ? (await import('./api-supabase.js')).creerApi({ url: CONFIG.supabaseUrl, cle: CONFIG.supabaseCle })
  : (await import('./api-demo.js')).creerApi();

const envois = creerEnvois(api, () => moi?.id);
const vueEl = document.getElementById('vue');
const navEl = document.getElementById('nav');
let moi = null;
let jeton = 0;

const ROUTES = {
  accueil: { vue: () => import('./views/accueil.js'), onglet: 'accueil' },
  signaler: { vue: () => import('./views/signaler.js') },
  panne: { vue: () => import('./views/panne.js') },
  materiel: { vue: () => import('./views/materiel.js'), onglet: 'materiel' },
  engin: { vue: () => import('./views/engin.js'), onglet: 'materiel' },
  voie: { vue: () => import('./views/voie.js'), onglet: 'voie' },
  profil: { vue: () => import('./views/profil.js'), onglet: 'profil' },
  admin: { vue: () => import('./views/admin.js'), onglet: 'profil', admin: true },
  etiquettes: { vue: () => import('./views/etiquettes.js') },
  tournee: { vue: () => import('./views/tournee.js') },
  releve: { vue: () => import('./views/releve.js'), inspecteur: true },
};
const ONGLETS = [['accueil', 'Accueil'], ['materiel', 'Matériel'], ['voie', 'Voie'], ['profil', 'Profil']];

// remplacer : l'écran actuel n'est pas gardé dans l'historique (après un envoi, « Retour » ne ramène pas au formulaire).
export function aller(chemin, { remplacer = false } = {}) {
  const cible = '#/' + chemin;
  if (location.hash === cible) router();
  else if (remplacer) location.replace(cible);
  else location.hash = '/' + chemin;
}

function afficherNav(onglet) {
  navEl.hidden = !onglet;
  if (!onglet) return;
  navEl.innerHTML = `<div class="nav-in">${ONGLETS.map(([id, label]) =>
    `<a href="#/${id}" ${id === onglet ? 'aria-current="page"' : ''}>${icone(id)}${label}</a>`).join('')}</div>`;
}

async function router() {
  const mon = ++jeton;
  const hash = location.hash.replace(/^#\/?/, '');
  if (/access_token=|error=|type=/.test(hash)) return;  // lien d'authentification en cours de lecture
  const [chemin, qs] = hash.split('?');
  const [nom, ...params] = chemin.split('/').filter(Boolean);
  const ctx = {
    api, moi, envois, params, query: new URLSearchParams(qs || ''), aller,
    // Affiche le contenu si l'utilisateur n'a pas changé d'écran entre-temps.
    rendre(html) { if (mon !== jeton) return null; vueEl.innerHTML = html; return vueEl; },
    async rafraichirMoi() { moi = await api.moi(); ctx.moi = moi; return moi; },
  };

  const session = await api.session();
  if (!session) {
    afficherNav(null); vueEl.className = 'sans-nav';
    return (await import('./views/connexion.js')).afficher(ctx, { erreurLien });
  }
  if (!moi) moi = await api.moi().catch(() => null);
  ctx.moi = moi;
  if (lienAuth) {
    afficherNav(null); vueEl.className = 'sans-nav';
    return (await import('./views/connexion.js')).choisirMotDePasse(ctx, lienAuth, () => { lienAuth = null; aller('accueil'); });
  }
  if (!moi?.actif) {
    afficherNav(null); vueEl.className = 'sans-nav';
    ctx.rendre(`<div class="connexion"><img class="logo" src="img/logo.png" alt=""><h1>Compte non activé</h1>
      <p class="sous">Votre accès n'a pas encore été ouvert, ou il a été retiré. Contactez un administrateur de l'association.</p>
      <button class="btn neutre" id="sortir">Se déconnecter</button></div>`);
    document.getElementById('sortir').onclick = () => api.deconnexion();
    return;
  }

  const route = ROUTES[nom] || ROUTES.accueil;
  if (route.admin && !moi.est_admin) return aller('profil');
  if (route.inspecteur && !peutInspecter(moi)) return aller('voie');
  afficherNav(route.onglet);
  vueEl.className = route.onglet ? '' : 'sans-nav';
  vueEl.innerHTML = '<div class="chargement">Chargement…</div>';
  try {
    await (await route.vue()).afficher(ctx);
  } catch (e) {
    console.error(e);
    ctx.rendre(`<div class="page"><div class="bandeau" role="alert">${esc(e.message || 'Une erreur est survenue.')}</div>
      <a class="btn neutre" href="#/accueil">Revenir à l'accueil</a></div>`);
  }
  if (mon === jeton) window.scrollTo(0, 0);
}

api.surAuth((evt) => {
  if (evt === 'PASSWORD_RECOVERY') lienAuth = 'recovery';
  if (evt === 'SIGNED_OUT') { moi = null; nbEnAttente = 0; majBandeau(); history.replaceState(null, '', location.pathname + '#/accueil'); }
  if (['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'PASSWORD_RECOVERY'].includes(evt)) {
    if (evt === 'INITIAL_SESSION' && !/access_token=|type=/.test(location.hash)) return;
    if (evt === 'SIGNED_IN') { moi = null; setTimeout(() => envois.lister().then((l) => { nbEnAttente = l.length; majBandeau(); synchroniser(); }).catch(() => {}), 1500); }
    // Nettoie l'adresse après un lien e-mail, puis affiche le bon écran.
    if (/access_token=|type=/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/accueil');
    setTimeout(router, 0);
  }
});
window.addEventListener('hashchange', router);
router();

// ───── Réseau : bandeau d'état et envoi automatique de ce qui attend ─────
const bandeau = document.createElement('div');
bandeau.className = 'reseau';
bandeau.setAttribute('role', 'status');
bandeau.hidden = true;
document.getElementById('app').prepend(bandeau);
let nbEnAttente = 0;
function majBandeau() {
  const horsLigne = !navigator.onLine;
  const attente = nbEnAttente ? ` · ${nbEnAttente} envoi${nbEnAttente > 1 ? 's' : ''} en attente` : '';
  bandeau.hidden = !horsLigne && !nbEnAttente;
  bandeau.classList.toggle('attente', !horsLigne);
  bandeau.textContent = horsLigne
    ? `Hors connexion${attente}. Vous pouvez consulter et signaler : l'envoi se fera au retour du réseau.`
    : `Envoi en cours${attente}…`;
}
envois.surChangement((liste) => { nbEnAttente = liste.length; majBandeau(); });
async function synchroniser() {
  if (!moi?.actif) return;
  const n = await envois.synchroniser().catch(() => 0);
  if (n) {
    toast(`${n} envoi${n > 1 ? 's' : ''} en attente ${n > 1 ? 'ont été envoyés' : 'a été envoyé'}.`);
    if (!document.querySelector('.voile, .scanner') && !/signaler/.test(location.hash)) router();
  }
}
window.addEventListener('online', () => { majBandeau(); synchroniser(); });
window.addEventListener('offline', majBandeau);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') synchroniser(); });
setInterval(synchroniser, 60000);
setTimeout(() => envois.lister().then((l) => { nbEnAttente = l.length; majBandeau(); synchroniser(); }).catch(() => {}), 1500);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Appui sur une notification alors que l'appli est déjà ouverte : aller à la fiche concernée.
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'aller' && /^#\/[\w\-/?=&]*$/.test(e.data.chemin || '')) location.hash = e.data.chemin.slice(1);
});

// Bouton « Retour » : revient à l'écran précédent s'il y en a un, sinon à l'adresse prévue.
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-retour]');
  if (a && dejaNavigue) { e.preventDefault(); history.back(); }
});
let dejaNavigue = false;
window.addEventListener('hashchange', () => { dejaNavigue = true; });
