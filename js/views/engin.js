import { esc, icone, pastille, ETATS, CATEGORIES, nomEngin, peutSignaler, peutReparer, feuille } from '../ui.js';
import { qrSvg } from '../qr.js';
import { lienEngin } from '../scanner.js';
import { lignePanne } from './accueil.js';

export async function afficher(ctx) {
  const { api, moi, params } = ctx;
  const [e, pannes] = await Promise.all([api.engin(params[0]), api.pannes({ enginId: params[0] })]);
  const ouvertes = pannes.filter((p) => p.statut !== 'reparee'), anciennes = pannes.filter((p) => p.statut === 'reparee');
  let onglet = ouvertes.length ? 'pannes' : 'fiche';

  const el = ctx.rendre(`
  <div class="barre"><a class="retour" href="#/materiel" data-retour aria-label="Retour au parc">${icone('retour')}</a>
    <span class="sous">${esc(CATEGORIES[e.categorie].label)}</span></div>
  <div class="page">
    <div style="display:flex;flex-direction:column;gap:6px">
      <h1 style="margin:0;font-size:24px;font-weight:800">${esc(e.designation)}</h1>
      ${e.surnom ? `<div class="aide" style="font-size:15px">dit${e.categorie === 'vapeur' ? 'e' : ''} « ${esc(e.surnom)} »</div>` : ''}
      <div>${pastille(ETATS[e.etat])}</div>
    </div>
    <div class="${peutSignaler(moi) ? 'btns' : ''}" style="${peutSignaler(moi) ? '' : 'display:flex;flex-direction:column'}">
      ${peutSignaler(moi) ? `<a class="btn" href="#/signaler?engin=${e.id}">${icone('plus', 20)}Signaler</a>` : ''}
      <button class="btn second" id="qr">${icone('qr', 20)}QR code</button>
    </div>
    ${e.notes ? `<div class="bandeau">${esc(e.notes)}</div>` : ''}
    <div class="segments" role="tablist" aria-label="Sections">
      <button role="tab" data-o="pannes">Pannes${ouvertes.length ? ` (${ouvertes.length})` : ''}</button>
      <button role="tab" data-o="fiche">Fiche technique</button>
    </div>
    <div id="contenu"></div>
  </div>`);
  if (!el) return;

  const contenu = el.querySelector('#contenu');
  const maj = () => {
    el.querySelectorAll('[data-o]').forEach((b) => b.setAttribute('aria-selected', b.dataset.o === onglet));
    if (onglet === 'fiche') {
      contenu.innerHTML = `${e.serie_nom ? `<p class="aide" style="margin:0 0 8px">Série : ${esc(e.serie_nom)}</p>` : ''}
        <div class="carte fiche">${e.fiche_complete.map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')
          || '<p class="vide">Pas encore de fiche technique.</p>'}</div>`;
    } else {
      contenu.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">
        <div class="carte liste">${ouvertes.map(lignePanne).join('') || '<p class="vide">Aucune panne en cours.</p>'}</div>
        ${anciennes.length ? `<h2 class="titre-section">Historique</h2><div class="carte liste">${anciennes.map(lignePanne).join('')}</div>` : ''}</div>`;
    }
  };
  el.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => { onglet = b.dataset.o; maj(); }));
  el.querySelector('#qr').onclick = () => {
    const { el: f, fermer } = feuille(`QR code · ${nomEngin(e)}`, `
      <div class="qr-grand">${qrSvg(lienEngin(e.id), { niveau: 'Q', titre: 'QR code ' + nomEngin(e) })}</div>
      <p class="aide" style="text-align:center;margin:0">Ce QR code ouvre la fiche de l'engin. Collez-le dans la cabine ou sur la caisse.</p>
      ${moi.est_admin || peutReparer(moi) ? `<a class="btn plein" href="#/etiquettes?engin=${e.id}">Imprimer l’étiquette</a>` : ''}
      <button class="btn neutre plein" id="fermer">Fermer</button>`);
    f.querySelector('#fermer').onclick = fermer;
  };
  maj();
}
