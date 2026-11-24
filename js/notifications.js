// Notifications sur le téléphone (Web Push) : état, activation, désactivation, essai.
// Sur iPhone : iOS 16.4 ou plus, et l'appli doit être ajoutée à l'écran d'accueil.


const estIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const estInstallee = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
// Juste après une mise à jour, getRegistration() peut répondre avant que le nouveau service worker
// soit prêt : on lui laisse un court instant, sinon on conclurait à tort que rien n'est activé.
const pret = async () => {
  if (!('serviceWorker' in navigator)) return null;
  const deja = await navigator.serviceWorker.getRegistration().catch(() => null);
  if (deja) return deja;
  return Promise.race([navigator.serviceWorker.ready.catch(() => null),
    new Promise((r) => setTimeout(() => r(null), 3000))]);
};

function cleOctets(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
function appareil() {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'PC Windows' : 'Navigateur';
}

// 'actif' | 'inactif' | 'refuse' | 'installer' (iPhone : ajouter à l'écran d'accueil) | 'impossible'
export async function etat() {
  if (estIOS() && !estInstallee()) return 'installer';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'impossible';
  if (Notification.permission === 'denied') return 'refuse';
  const reg = await pret();
  const abo = await reg?.pushManager.getSubscription().catch(() => null);
  return abo && Notification.permission === 'granted' ? 'actif' : 'inactif';
}

// À appeler depuis un appui sur un bouton (exigé par les navigateurs).
export async function activer(api) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied'
    ? 'Les notifications sont bloquées pour cette appli : autorisez-les dans les réglages du téléphone.'
    : 'Notifications non autorisées.');
  const reg = await navigator.serviceWorker.ready;
  let abo = await reg.pushManager.getSubscription();
  if (!abo) {
    const cle = cleOctets(await api.clePush());
    try { abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cle }); }
    catch (e) {
      throw new Error(navigator.onLine
        ? `Le téléphone n'a pas pu s'inscrire aux notifications (${e.message || e.name}). Fermez et rouvrez l'appli, puis réessayez.`
        : 'Pas de connexion internet : les notifications pourront être activées au retour du réseau.');
    }
  }
  await api.enregistrerAbonnement(abo.toJSON(), appareil());
}

export async function desactiver(api) {
  const reg = await pret();
  const abo = await reg?.pushManager.getSubscription();
  if (!abo) return;
  await api.retirerAbonnement(abo.endpoint).catch(() => {});
  await abo.unsubscribe().catch(() => {});
}

// À la déconnexion : ce téléphone ne doit plus recevoir les notifications de ce membre.
export async function oublierCeTelephone(api) {
  try { await desactiver(api); } catch { /* sans réseau : l'abonnement sera remplacé par le prochain membre */ }
}

// ───── Proposer d'activer les notifications (première connexion, puis rappel tous les 5 jours) ─────
const RAPPEL_JOURS = 5;
let dejaPropose = false;   // une seule fois par ouverture de l'appli
const cleRappel = (id) => 'cfv-notif-plus-tard:' + id;
export const concerne = (moi) => moi.est_admin || moi.referent_voie || moi.role !== 'bureau';

// ui : { feuille, toast } (passés par l'écran pour éviter une dépendance circulaire)
export async function proposer(api, moi, { feuille, toast }) {
  if (dejaPropose || !moi?.actif || !concerne(moi) || !navigator.onLine) return;
  dejaPropose = true;
  const e = await etat();
  if (e !== 'inactif' && e !== 'installer') return;   // déjà activées, refusées ou impossibles : on ne relance pas
  // Autorisation déjà accordée sur ce téléphone (cas d'un abonnement perdu après une mise à jour,
  // fréquent sur Android) : on se réinscrit sans rien demander, aucune fenêtre ne s'ouvre.
  if (e === 'inactif' && 'Notification' in window && Notification.permission === 'granted') {
    await activer(api).catch(() => {});
    return;
  }
  let plusTard = 0;
  try { plusTard = Number(localStorage.getItem(cleRappel(moi.id))) || 0; } catch { /* rien */ }
  if (plusTard && Date.now() - plusTard < RAPPEL_JOURS * 86400e3) return;
  const reporter = () => { try { localStorage.setItem(cleRappel(moi.id), String(Date.now())); } catch { /* rien */ } };
  const installer = e === 'installer';
  const { el, fermer } = feuille('Être prévenu sur ce téléphone', `
    <p style="margin:0">Recevez une notification pour les pannes qui vous concernent, et quand vos propres signalements sont pris en charge ou réparés.</p>
    ${installer ? `<p class="bandeau" style="margin:0">Sur iPhone, il faut d'abord <b>ajouter l'appli à l'écran d'accueil</b> : dans Safari, <b>Partager → Sur l'écran d'accueil</b>, puis ouvrez l'appli depuis cette icône (iOS 16.4 ou plus).</p>` : ''}
    <p class="erreur" id="err" role="alert"></p>
    <div class="btns"><button class="btn neutre" id="plus-tard">Plus tard</button>
      ${installer ? '<button class="btn" id="compris">J’ai compris</button>' : '<button class="btn" id="oui">Activer</button>'}</div>
    <p class="aide" style="margin:0">Modifiable à tout moment dans Profil → Notifications.</p>`);
  el.querySelector('#plus-tard').onclick = () => { reporter(); fermer(); };
  el.querySelector('#compris')?.addEventListener('click', () => { reporter(); fermer(); });
  el.querySelector('#oui')?.addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    try { await activer(api); fermer(); toast('Notifications activées'); }
    catch (x) { el.querySelector('#err').textContent = x.message; ev.target.disabled = false; reporter(); }
  });
}
