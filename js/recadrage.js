// Recadrage d'une photo de profil : on déplace la photo derrière un rond (un doigt ou la souris),
// on zoome (deux doigts, le curseur ou la molette), puis on valide. Renvoie un JPEG carré, ou null si annulé.
import { esc, toast } from './ui.js';

const SORTIE = 400;     // côté de l'image finale, en pixels
const ZOOM_MAX = 5;

export function recadrer(fichier) {
  return new Promise((resoudre) => {
    const url = URL.createObjectURL(fichier);
    const el = document.createElement('div');
    el.className = 'recadrage';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Recadrer la photo');
    el.innerHTML = `
      <p class="recadrage-titre">Recadrer la photo</p>
      <p class="recadrage-aide">Déplacez la photo avec le doigt, zoomez avec deux doigts ou le curseur.</p>
      <div class="recadrage-cadre"><img alt="" src="${esc(url)}" draggable="false"><span class="recadrage-rond" aria-hidden="true"></span></div>
      <label class="recadrage-zoom"><span>−</span><input type="range" min="1" max="${ZOOM_MAX}" step="0.01" value="1" aria-label="Zoom"><span>+</span></label>
      <div class="btns"><button type="button" class="btn neutre" data-r="annuler">Annuler</button><button type="button" class="btn" data-r="ok">Valider</button></div>`;
    document.body.append(el);
    const cadre = el.querySelector('.recadrage-cadre'), img = el.querySelector('img'), curseur = el.querySelector('input');

    // État : z = zoom (1 = la photo couvre juste le rond), x/y = position du coin haut-gauche de la photo dans le cadre.
    let V = 0, w = 0, h = 0, z = 1, x = 0, y = 0;
    const echelle = () => (V / Math.min(w, h)) * z;
    const borner = () => {
      const s = echelle();
      x = Math.min(0, Math.max(V - w * s, x));
      y = Math.min(0, Math.max(V - h * s, y));
    };
    const dessiner = () => {
      borner();
      const s = echelle();
      img.style.width = `${w * s}px`; img.style.height = `${h * s}px`;
      img.style.transform = `translate(${x}px, ${y}px)`;
      curseur.value = z;
    };
    // Zoom autour d'un point du cadre (centre, ou point entre les deux doigts) : ce point reste sous le doigt.
    const zoomer = (nz, fx = V / 2, fy = V / 2) => {
      nz = Math.min(ZOOM_MAX, Math.max(1, nz));
      const r = nz / z;
      x = fx - (fx - x) * r; y = fy - (fy - y) * r; z = nz;
      dessiner();
    };
    const demarrer = () => {
      V = cadre.clientWidth; w = img.naturalWidth; h = img.naturalHeight;
      const s = echelle();
      x = (V - w * s) / 2; y = (V - h * s) / 2;
      dessiner();
    };
    img.onload = demarrer;
    img.onerror = () => fermer(null, 'Cette photo ne peut pas être ouverte.');
    const surTaille = () => { if (!w) return; const ancien = V; V = cadre.clientWidth; const r = V / ancien; x *= r; y *= r; dessiner(); };
    window.addEventListener('resize', surTaille);

    // Gestes : un pointeur = déplacer, deux pointeurs = zoomer.
    const pointeurs = new Map();
    let depart = null;
    const local = (e) => { const r = cadre.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const instantane = () => {
      const p = [...pointeurs.values()];
      if (p.length === 1) return { x, y, px: p[0][0], py: p[0][1] };
      const [a, b] = p;
      return { x, y, z, d: Math.hypot(a[0] - b[0], a[1] - b[1]), cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 };
    };
    cadre.addEventListener('pointerdown', (e) => {
      cadre.setPointerCapture(e.pointerId);
      pointeurs.set(e.pointerId, local(e));
      depart = instantane();
    });
    cadre.addEventListener('pointermove', (e) => {
      if (!pointeurs.has(e.pointerId)) return;
      pointeurs.set(e.pointerId, local(e));
      const p = [...pointeurs.values()];
      if (p.length === 1 && depart?.px != null) {
        x = depart.x + p[0][0] - depart.px; y = depart.y + p[0][1] - depart.py; dessiner();
      } else if (p.length >= 2 && depart?.d) {
        const [a, b] = p;
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
        // Zoom autour du point de départ entre les doigts, plus le glissement des deux doigts.
        const nz = Math.min(ZOOM_MAX, Math.max(1, depart.z * (d / depart.d))), r = nz / depart.z;
        z = nz; x = depart.cx - (depart.cx - depart.x) * r + (cx - depart.cx); y = depart.cy - (depart.cy - depart.y) * r + (cy - depart.cy);
        dessiner();
      }
    });
    const lacher = (e) => { pointeurs.delete(e.pointerId); depart = pointeurs.size ? instantane() : null; };
    cadre.addEventListener('pointerup', lacher);
    cadre.addEventListener('pointercancel', lacher);
    cadre.addEventListener('wheel', (e) => { e.preventDefault(); const [fx, fy] = local(e); zoomer(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), fx, fy); }, { passive: false });
    curseur.addEventListener('input', () => zoomer(Number(curseur.value)));

    const clavier = (e) => { if (e.key === 'Escape') fermer(null); };
    document.addEventListener('keydown', clavier);
    function fermer(resultat, message) {
      window.removeEventListener('resize', surTaille);
      document.removeEventListener('keydown', clavier);
      el.remove(); URL.revokeObjectURL(url);
      if (message) toast(message);
      resoudre(resultat);
    }
    el.querySelector('[data-r=annuler]').onclick = () => fermer(null);
    el.querySelector('[data-r=ok]').onclick = () => {
      const s = echelle(), cote = V / s;
      const c = document.createElement('canvas');
      c.width = c.height = Math.round(Math.min(SORTIE, cote));
      c.getContext('2d').drawImage(img, -x / s, -y / s, cote, cote, 0, 0, c.width, c.height);
      c.toBlob((b) => fermer(b), 'image/jpeg', 0.85);
    };
  });
}
