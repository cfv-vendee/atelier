// Notifications sur le téléphone (Web Push) : état, activation, désactivation, essai.
// Sur iPhone : iOS 16.4 ou plus, et l'appli doit être ajoutée à l'écran d'accueil.


const estIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const estInstallee = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const pret = async () => (await navigator.serviceWorker?.getRegistration()) || null;

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
