import { esc, icone, CATEGORIES, nomEngin, peutReparer } from '../ui.js';
import { qrSvg } from '../qr.js';
import { lienEngin } from '../scanner.js';

const FILTRES = [['tout', 'Tout'], ['vapeur', 'Vapeur'], ['diesel', 'Diesel'], ['loco', 'Locotracteurs'], ['autorail', 'Autorails'], ['voiture', 'Voitures']];

export const etiquette = (e) => `
  <div class="etq-carte">
    <div class="etq-qr">${qrSvg(lienEngin(e.id), { niveau: 'Q', titre: 'QR code ' + nomEngin(e) })}</div>
    <div class="etq-infos">
      <div class="etq-tete"><img src="img/logo.png" alt="">CFV Atelier</div>
      <b>${esc(e.designation)}</b>
      ${e.surnom ? `<span>« ${esc(e.surnom)} »</span>` : `<span>${esc(CATEGORIES[e.categorie].label)}</span>`}
      <small>Scannez pour voir la fiche ou signaler une panne</small>
    </div>
  </div>`;

export async function afficher(ctx) {
  const { api, moi, query } = ctx;
  if (!(moi.est_admin || peutReparer(moi))) return ctx.aller('materiel');
  const engins = await api.engins();
  const seul = query.get('engin');
  let filtre = 'tout';

  const el = ctx.rendre(`
  <div class="barre"><a class="retour" href="${seul ? '#/engin/' + esc(seul) : '#/admin'}" data-retour aria-label="Retour">${icone('retour')}</a>
    <h1>${seul ? 'Étiquette QR' : 'Étiquettes QR'}</h1></div>
  <div class="page">
    <div class="no-print" style="display:flex;flex-direction:column;gap:12px">
      <p class="aide" style="margin:0;font-size:14px">Imprimez sur une feuille A4 (ou des étiquettes adhésives), découpez et collez dans la cabine ou sur la caisse.
        Pour l'extérieur, plastifiez l'étiquette. Le plus simple est d'imprimer depuis un ordinateur.</p>
      ${seul ? '' : `<div class="filtres" role="group" aria-label="Choisir les engins">${FILTRES.map(([k, l]) => `<button type="button" data-f="${k}">${l}</button>`).join('')}</div>`}
      <button class="btn" id="imprimer">Imprimer${seul ? ' l’étiquette' : ' <span id="nb"></span>'}</button>
    </div>
    <div class="planche" id="planche"></div>
  </div>`);
  if (!el) return;

  const maj = () => {
    el.querySelectorAll('[data-f]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.f === filtre));
    const l = seul ? engins.filter((e) => e.id === seul) : engins.filter((e) => filtre === 'tout' || CATEGORIES[e.categorie].groupe === filtre);
    el.querySelector('#planche').innerHTML = l.map(etiquette).join('') || '<p class="vide">Aucun engin.</p>';
    const nb = el.querySelector('#nb');
    if (nb) nb.textContent = `${l.length} étiquette${l.length > 1 ? 's' : ''}`;
  };
  el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filtre = b.dataset.f; maj(); }));
  el.querySelector('#imprimer').onclick = () => window.print();
  maj();
}
