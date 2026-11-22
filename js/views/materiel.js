import { esc, icone, pastille, ETATS, CATEGORIES, nomEngin } from '../ui.js';

const FILTRES = [['tout', 'Tout'], ['vapeur', 'Vapeur'], ['diesel', 'Diesel'], ['loco', 'Locotracteurs'], ['autorail', 'Autorails'], ['voiture', 'Voitures']];
const COULEUR_ETAT = { immobilise: 'red', surveiller: 'orange', service: 'green' };
let filtreMemo = 'tout';

export async function afficher(ctx) {
  const engins = await ctx.api.engins();
  const el = ctx.rendre(`
  <div class="entete"><h1>Parc matériel</h1></div>
  <div class="page" style="padding-top:8px">
    <label class="recherche">${icone('recherche', 20)}<input id="q" type="search" placeholder="Rechercher : T6, Picasso, Y 7303…" aria-label="Rechercher un engin"></label>
    <div class="filtres" role="group" aria-label="Filtrer par type">${FILTRES.map(([k, l]) => `<button type="button" data-f="${k}">${l}</button>`).join('')}</div>
    <div class="cartes" id="liste"></div>
  </div>`);
  if (!el) return;
  const q = el.querySelector('#q'), liste = el.querySelector('#liste');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '');
  const maj = () => {
    el.querySelectorAll('[data-f]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.f === filtreMemo));
    const t = norm(q.value);
    const l = engins.filter((e) => (filtreMemo === 'tout' || CATEGORIES[e.categorie].groupe === filtreMemo)
      && (!t || norm(`${e.designation} ${e.surnom} ${e.constructeur}`).includes(t)));
    liste.innerHTML = l.map((e) => `
      <a class="ligne" href="#/engin/${e.id}">
        <span class="code ${COULEUR_ETAT[e.etat]}">${CATEGORIES[e.categorie].code}</span>
        <span class="txt"><span class="t">${esc(nomEngin(e))}</span><span class="m">${esc([e.constructeur, e.annee].filter(Boolean).join(' · '))}</span></span>
        <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">${pastille(ETATS[e.etat])}
          ${e.pannes_ouvertes ? `<span class="aide">${e.pannes_ouvertes} panne${e.pannes_ouvertes > 1 ? 's' : ''} en cours</span>` : ''}</span>
      </a>`).join('') || '<p class="vide">Aucun engin ne correspond.</p>';
  };
  el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filtreMemo = b.dataset.f; maj(); }));
  q.oninput = maj;
  maj();
}
