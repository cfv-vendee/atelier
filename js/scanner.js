// Lecture d'un QR code avec l'appareil photo, dans l'appli (pas besoin d'une autre application).
// Utilise le lecteur intégré du téléphone s'il existe (Android), sinon la bibliothèque jsQR,
// gardée en mémoire par l'appli après le premier usage pour fonctionner aussi sans réseau.

export const JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
let chargement = null;

function chargerJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  chargement ??= new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = JSQR_URL;
    s.onload = () => (window.jsQR ? ok(window.jsQR) : ko(new Error('Lecteur de QR code indisponible.')));
    s.onerror = () => { chargement = null; s.remove(); ko(new Error('Lecteur de QR code indisponible : vérifiez la connexion internet.')); };
    document.head.append(s);
  });
  return chargement;
}

async function lecteurIntegre() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    if (!(await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) return null;
    const bd = new window.BarcodeDetector({ formats: ['qr_code'] });
    return async (video) => (await bd.detect(video))[0]?.rawValue || null;
  } catch {
    return null;
  }
}

async function lecteurJsQR() {
  const jsQR = await chargerJsQR();
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return null;
    const r = Math.min(1, 720 / Math.max(w, h));
    c.width = Math.round(w * r); c.height = Math.round(h * r);
    ctx.drawImage(video, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    return jsQR(img.data, c.width, c.height, { inversionAttempts: 'dontInvert' })?.data || null;
  };
}

// Ouvre la caméra en plein écran ; renvoie le texte lu, ou null si l'utilisateur annule.
export function scannerQR() {
  return new Promise((resoudre) => {
    const voile = document.createElement('div');
    voile.className = 'scanner';
    voile.setAttribute('role', 'dialog');
    voile.setAttribute('aria-label', 'Scanner un QR code');
    voile.innerHTML = `<div class="scanner-cadre"><video playsinline muted autoplay></video><div class="scanner-viseur" aria-hidden="true"></div></div>
      <p class="scanner-aide" role="status">Visez le QR code de l'étiquette</p>
      <button class="btn neutre" type="button">Annuler</button>`;
    document.body.append(voile);
    const video = voile.querySelector('video'), aide = voile.querySelector('.scanner-aide');
    let flux = null, fini = false;

    const terminer = (valeur) => {
      if (fini) return;
      fini = true;
      flux?.getTracks().forEach((t) => t.stop());
      voile.remove();
      document.removeEventListener('keydown', echap);
      resoudre(valeur);
    };
    const echap = (e) => { if (e.key === 'Escape') terminer(null); };
    document.addEventListener('keydown', echap);
    voile.querySelector('button').onclick = () => terminer(null);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        aide.textContent = "Ce navigateur ne permet pas d'utiliser l'appareil photo. Utilisez l'appareil photo du téléphone pour scanner l'étiquette.";
        return;
      }
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (e) {
        aide.textContent = e?.name === 'NotAllowedError'
          ? "L'accès à l'appareil photo est refusé. Autorisez-le dans les réglages du téléphone, puis réessayez."
          : 'Appareil photo indisponible.';
        return;
      }
      if (fini) { flux.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = flux;
      await video.play().catch(() => {});

      let lire = await lecteurIntegre();
      if (!lire) {
        try { lire = await lecteurJsQR(); } catch (e) { aide.textContent = e.message; return; }
      }
      const boucle = async () => {
        if (fini) return;
        let texte = null;
        try { texte = await lire(video); } catch { /* image pas encore prête */ }
        if (texte) { navigator.vibrate?.(60); terminer(texte); return; }
        setTimeout(boucle, 120);
      };
      boucle();
    })();
  });
}

// Adresse codée dans les étiquettes : …/#/engin/<identifiant>
export const lienEngin = (id) => `${location.origin}${location.pathname.replace(/index\.html$/, '')}#/engin/${id}`;
export function idEnginDepuisQR(texte) {
  const m = /#\/engin\/([\w-]+)/.exec(texte || '');
  return m ? m[1] : null;
}
