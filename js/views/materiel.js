import { esc, icone, pastille, ETATS, CATEGORIES, GRAVITES, STATUTS, nomEngin, quand } from '../ui.js';
import { formulaireEngin } from './engin.js';

const FILTRES = [['tout', 'Tout'], ['vapeur', 'Vapeur'], ['diesel', 'Diesel'], ['loco', 'Locotracteurs'], ['autorail', 'Autorails'], ['draisine', 'Draisines'], ['voiture', 'Voitures']];
const GRADES = [['tout', 'Toutes'], ['bloquante', 'Bloquantes'], ['surveiller', 'À surveiller'], ['mineure', 'Mineures']];
const COULEUR_ETAT = { immobilise: 'red', surveiller: 'orange', service: 'green' };
let filtreMemo = 'tout';
let gradeMemo = 'tout';
let vueMemo = 'engins';       // 'engins' | 'pannes'
let reparees = false;

export async function afficher(ctx) {
  // Arrivée depuis la pastille « Pannes matériel » de l'accueil : on ouvre directement la liste des pannes.
  if (ctx.query.get('vue') === 'pannes') { vueMemo = 'pannes'; reparees = false; gradeMemo = 'tout'; }
  const [engins, pannes] = await Promise.all([ctx.api.engins(), ctx.api.pannes({ cible: 'materiel' })]);
  const el = ctx.rendre(`
  <div class="entete" style="display:flex;align-items:center;gap:10px"><h1 style="flex:1">Parc matériel</h1>
    ${ctx.moi.est_admin ? `<button class="btn second" id="ajouter" style="min-height:44px;padding:0 14px;font-size:15px">${icone('plus', 18)}Ajouter</button>` : ''}</div>
  <div class="page" style="padding-top:8px">
    <div class="segments" role="group" aria-label="Affichage">
      <button type="button" data-v="engins">Les engins</button><button type="button" data-v="pannes">Les pannes</button>
    </div>
    <div id="bloc-engins" class="bloc" hidden>
      <label class="recherche">${icone('recherche', 20)}<input id="q" type="search" placeholder="Rechercher : T6, Picasso, Y 7303…" aria-label="Rechercher un engin"></label>
      <div class="filtres" role="group" aria-label="Filtrer par type">${FILTRES.map(([k, l]) => `<button type="button" data-f="${k}">${l}</button>`).join('')}</div>
      <div class="cartes" id="liste"></div>
    </div>
    <div id="bloc-pannes" class="bloc" hidden>
      <div class="filtres" role="group" aria-label="Filtrer par gravité">${GRADES.map(([k, l]) => `<button type="button" data-g="${k}">${l}</button>`).join('')}</div>
      <div class="segments" role="group" aria-label="Pannes à afficher">
        <button type="button" data-r="0">À traiter</button><button type="button" data-r="1">Tout l'historique</button>
      </div>
      <div class="carte liste" id="liste-pannes"></div>
    </div>
  </div>`);
  if (!el) return;
  const q = el.querySelector('#q'), liste = el.querySelector('#liste'), listeP = el.querySelector('#liste-pannes');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '');

  const majEngins = () => {
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

  const majPannes = () => {
    el.querySelectorAll('[data-g]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.g === gradeMemo));
    el.querySelectorAll('[data-r]').forEach((b) => b.setAttribute('aria-pressed', (b.dataset.r === '1') === reparees));
    const ORDRE = { bloquante: 0, surveiller: 1, mineure: 2 };
    const l = pannes.filter((p) => (gradeMemo === 'tout' || p.gravite === gradeMemo) && (reparees || p.statut !== 'reparee'))
      .sort((a, b) => ORDRE[a.gravite] - ORDRE[b.gravite] || String(b.created_at).localeCompare(String(a.created_at)));
    listeP.innerHTML = l.map((p) => `
      <a class="ligne" href="#/panne/${p.id}">
        <span class="point" style="background:${GRAVITES[p.gravite].couleur}" title="${esc(GRAVITES[p.gravite].label)}"></span>
        <span class="txt"><span class="t">${esc(p.titre)}</span>
          <span class="m">${esc(nomEngin(p.engin))} · ${esc(GRAVITES[p.gravite].label)} · ${esc(quand(p.created_at))}</span></span>
        ${pastille(STATUTS[p.statut])}
      </a>`).join('') || `<p class="vide">${gradeMemo === 'tout'
        ? (reparees ? 'Aucune panne sur le matériel.' : 'Rien à traiter sur le matériel.')
        : `Aucune panne ${esc(GRAVITES[gradeMemo].label.toLowerCase())}${reparees ? '' : ' à traiter'}.`}</p>`;
  };

  const maj = () => {
    el.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === vueMemo));
    el.querySelector('#bloc-engins').hidden = vueMemo !== 'engins';
    el.querySelector('#bloc-pannes').hidden = vueMemo !== 'pannes';
    if (vueMemo === 'engins') majEngins(); else majPannes();
  };
  el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { vueMemo = b.dataset.v; maj(); }));
  el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filtreMemo = b.dataset.f; majEngins(); }));
  el.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { gradeMemo = b.dataset.g; majPannes(); }));
  el.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { reparees = b.dataset.r === '1'; majPannes(); }));
  q.oninput = majEngins;
  el.querySelector('#ajouter')?.addEventListener('click', () => formulaireEngin(ctx));
  maj();
}
