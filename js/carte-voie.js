// Plan interactif de la ligne Les Herbiers – Mortagne-sur-Sèvre : dessin vectoriel (SVG), sans fond de carte en ligne,
// donc utilisable hors connexion. Glisser pour déplacer, pincer ou molette pour zoomer, toucher un élément pour le détail.
import { VOIE } from './voie-cfv.js';
import { esc, GRAVITES, formatPk as formatPkPrecis, ELEMENTS } from './ui.js';
const formatPk = (pk) => formatPkPrecis(Math.round(Number(pk) * 10) / 10);      // au dixième : c'est la précision des données

const LAT0 = 46.93;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110540;
const monde = (lng, lat) => [(lng + 1) * KX, -(lat - LAT0) * KY];          // mètres, y vers le bas (écran)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const longueur = (c) => c.reduce((s, p, i) => (i ? s + dist(p, c[i - 1]) : 0), 0);
const NS = 'http://www.w3.org/2000/svg';

// Géométrie en mètres, calculée une fois.
const LIGNE = VOIE.ligne.map((p) => monde(p[0], p[1]));
const CUMUL = LIGNE.reduce((a, p, i) => (a.push(i ? a[i - 1] + dist(p, LIGNE[i - 1]) : 0), a), []);
const ANNEXES = VOIE.annexes.map((a) => ({ ...a, m: a.c.map((p) => monde(p[0], p[1])) }));
const OUVRAGES = VOIE.ouvrages.map((o) => ({ ...o, m: o.c.map((p) => monde(p[0], p[1])) }));

function abscisse(q) {                                    // abscisse (m) de la projection d'un point sur la ligne
  let best = [Infinity, 0];
  for (let i = 0; i < LIGNE.length - 1; i++) {
    const [ax, ay] = LIGNE[i], [bx, by] = LIGNE[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((q[0] - ax) * dx + (q[1] - ay) * dy) / l2));
    const e = Math.hypot(q[0] - ax - t * dx, q[1] - ay - t * dy);
    if (e < best[0]) best = [e, CUMUL[i] + t * Math.sqrt(l2)];
  }
  return best[1];
}
function pointA(s) {
  s = Math.max(0, Math.min(CUMUL[CUMUL.length - 1], s));
  for (let i = 0; i < LIGNE.length - 1; i++) if (s <= CUMUL[i + 1]) {
    const t = (s - CUMUL[i]) / ((CUMUL[i + 1] - CUMUL[i]) || 1);
    return [LIGNE[i][0] + (LIGNE[i + 1][0] - LIGNE[i][0]) * t, LIGNE[i][1] + (LIGNE[i + 1][1] - LIGNE[i][1]) * t];
  }
  return LIGNE[LIGNE.length - 1];
}
// PK → abscisse, par interpolation entre les jalons kilométriques.
const REPERES = [[VOIE.pkDebut, 0], ...VOIE.jalons.map((j) => [j.pk, abscisse(monde(j.c[0], j.c[1]))]), [VOIE.pkFin, CUMUL[CUMUL.length - 1]]]
  .sort((a, b) => a[0] - b[0]);
function pointAuPk(pk) {
  const r = REPERES;
  for (let i = 0; i < r.length - 1; i++) if (pk >= r[i][0] && pk <= r[i + 1][0] && r[i + 1][0] > r[i][0])
    return pointA(r[i][1] + (r[i + 1][1] - r[i][1]) * (pk - r[i][0]) / (r[i + 1][0] - r[i][0]));
  return pk < r[0][0] ? pointA(0) : pointA(Infinity);
}

const TYPES_PN = {
  auto: { label: 'Automatique', detail: 'feux et cloche (d’après OpenStreetMap)', couleur: '#175CD3' },
  barrieres: { label: 'À barrières', detail: 'barrières sans feux relevés (d’après OpenStreetMap), type à confirmer', couleur: '#C26A00' },
  inconnu: { label: 'Type non renseigné', detail: 'à préciser sur le terrain', couleur: '#8A919C' },
};
const typePn = (p) => TYPES_PN[p.type] || TYPES_PN.inconnu;
const COUL_ANNEXE = { evitement: '#175CD3', tiroir: '#7A3FB0' };
const LIB_ANNEXE = { evitement: "Voie d'évitement", tiroir: 'Tiroir (voie en cul-de-sac)' };
const COUCHES = [['gares', 'Gares'], ['pn', 'Passages à niveau'], ['pk', 'PK'], ['annexes', 'Évitements et tiroirs'], ['pannes', 'Problèmes']];

const el = (nom, attrs = {}, parent) => {
  const n = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n); return n;
};
const chemin = (pts) => 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L');

export function monterCarte(conteneur, { pannes = [], onChoisir = () => {}, choisi = null } = {}) {
  const visibles = { gares: true, pn: true, pk: true, annexes: true, pannes: true };
  conteneur.innerHTML = `
    <div class="cv-zone"><svg class="cv-svg" role="img" aria-label="Plan de la ligne"></svg>
      <div class="cv-zoom"><button type="button" data-z="+" aria-label="Zoom avant">+</button><button type="button" data-z="-" aria-label="Zoom arrière">−</button>
        <button type="button" data-z="0" aria-label="Voir toute la ligne">⤢</button></div>
      <div class="cv-detail" hidden></div></div>
    <div class="cv-couches" role="group" aria-label="Éléments affichés">${COUCHES.map(([id, nom]) => `<button type="button" data-c="${id}" aria-pressed="true">${esc(nom)}</button>`).join('')}</div>
    <div class="cv-legende" aria-label="Légende">
      <span><i class="cv-l-pn" style="background:#175CD3"></i>PN automatique</span><span><i class="cv-l-pn" style="background:#C26A00"></i>PN à barrières</span>
      <span><i class="cv-l-pn" style="background:#8A919C"></i>PN type non renseigné</span><span><i class="cv-l-li" style="background:#175CD3"></i>Évitement</span>
      <span><i class="cv-l-li" style="background:#7A3FB0"></i>Tiroir</span></div>
    <p class="aide cv-source">Tracé, gares et passages à niveau : © contributeurs OpenStreetMap. PK : SNCF Réseau, via Carto Tchoo. Données à confirmer avec le relevé de terrain.</p>`;
  const svg = conteneur.querySelector('.cv-svg'), detail = conteneur.querySelector('.cv-detail');
  const g = el('g', {}, svg), gLignes = el('g', {}, g);
  const gMarq = el('g', {}, svg);
  let k = 0.05, tx = 0, ty = 0, kMin = 0.01, ajuste = false, selection = choisi;
  const taille = () => svg.getBoundingClientRect();

  // ── Tracé : annexes, ouvrages, puis ligne principale « façon rail » ──
  const gAnn = el('g', {}, gLignes);
  ANNEXES.forEach((a, i) => el('path', { d: chemin(a.m), fill: 'none', stroke: COUL_ANNEXE[a.genre], 'stroke-width': 3.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, gAnn));
  OUVRAGES.filter((o) => o.genre === 'pont').forEach((o) => el('path', { d: chemin(o.m), fill: 'none', stroke: '#8A919C', 'stroke-width': 10, 'stroke-linecap': 'butt', 'vector-effect': 'non-scaling-stroke', opacity: .55 }, gLignes));
  el('path', { d: chemin(LIGNE), fill: 'none', stroke: '#2F3540', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, gLignes);
  el('path', { d: chemin(LIGNE), fill: 'none', stroke: '#FFFFFF', 'stroke-width': 1.6, 'stroke-dasharray': '6 6', 'vector-effect': 'non-scaling-stroke' }, gLignes);
  OUVRAGES.filter((o) => o.genre === 'tunnel').forEach((o) => el('path', { d: chemin(o.m), fill: 'none', stroke: '#2F3540', 'stroke-width': 9, 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' }, gLignes));

  // ── Marqueurs (positions recalculées à chaque déplacement, taille fixe à l'écran) ──
  const marq = [];       // { id, genre, x, y, noeud, couche, rendu(k) }
  const ajouter = (m) => { m.noeud = el('g', { 'data-id': m.id, class: 'cv-m cv-m-' + m.genre }, gMarq); marq.push(m); m.dessin(m.noeud); return m; };
  const texte = (parent, t, dx, dy, cls = '') => { const n = el('text', { x: dx, y: dy, class: 'cv-t ' + cls }, parent); n.textContent = t; return n; };

  VOIE.jalons.forEach((j) => {
    const [x, y] = monde(j.c[0], j.c[1]);
    ajouter({ id: 'pk' + j.pk, genre: 'pk', couche: 'pk', x, y, pk: j.pk, dessin: (n) => { el('circle', { r: 3.2, class: 'cv-pk' }, n); texte(n, String(j.pk), 8, 4, 'cv-t-pk'); } });
  });
  VOIE.gares.forEach((ga) => {
    const [x, y] = monde(ga.lng, ga.lat);
    ajouter({ id: 'gare:' + ga.nom, genre: 'gare', couche: 'gares', x, y, data: ga, dessin: (n) => {
      el('circle', { r: 20, fill: 'transparent' }, n); el('rect', { x: -8, y: -8, width: 16, height: 16, rx: 4, class: 'cv-gare' }, n);
      texte(n, ga.nom, 13, 4, 'cv-t-gare'); } });
  });
  VOIE.pn.forEach((p) => {
    const [x, y] = monde(p.lng, p.lat), c = typePn(p).couleur;
    ajouter({ id: 'pn:' + p.nom, genre: 'pn', couche: 'pn', x, y, data: p, dessin: (n) => {
      el('circle', { r: 17, fill: 'transparent' }, n); el('circle', { r: 6, fill: c, stroke: '#fff', 'stroke-width': 2 }, n);
      el('path', { d: 'M-3 -3 3 3M3 -3 -3 3', stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, n);
      texte(n, p.nom.replace('PN ', ''), 9, -7, 'cv-t-pn'); } });
  });
  VOIE.tampons.forEach((t, i) => {
    const [x, y] = monde(t.lng, t.lat);
    ajouter({ id: 'tampon' + i, genre: 'tampon', couche: 'annexes', x, y, dessin: (n) => el('rect', { x: -3, y: -3, width: 6, height: 6, fill: '#2F3540' }, n) });
  });
  ANNEXES.forEach((a, i) => {
    const mid = a.m[Math.floor(a.m.length / 2)], L = longueur(a.m);
    if (L < 60) return;
    ajouter({ id: 'annexe:' + i, genre: 'annexe', couche: 'annexes', x: mid[0], y: mid[1], data: { ...a, longueur: Math.round(L) }, dessin: (n) => {
      el('circle', { r: 15, fill: 'transparent' }, n); el('circle', { r: 4.5, fill: '#fff', stroke: COUL_ANNEXE[a.genre], 'stroke-width': 2.5 }, n); } });
  });
  pannes.filter((p) => p.cible === 'voie' && p.statut !== 'reparee').forEach((p) => {
    const pt = p.lat != null && p.lng != null ? monde(p.lng, p.lat) : p.pk != null ? pointAuPk(Number(p.pk)) : null;
    if (!pt) return;
    ajouter({ id: 'panne:' + p.id, genre: 'panne', couche: 'pannes', x: pt[0], y: pt[1], data: p, dessin: (n) => {
      el('circle', { r: 20, fill: 'transparent' }, n);
      el('path', { d: 'M0 -17 11 3H-11Z', fill: GRAVITES[p.gravite].couleur, stroke: '#fff', 'stroke-width': 2, 'stroke-linejoin': 'round' }, n);
      texte(n, '!', 0, 0.5, 'cv-t-alerte'); } });
  });

  // ── Rendu ──
  function rendre() {
    g.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
    const larg = taille().width, pxKm = k * 1000, pas = pxKm < 22 ? 5 : pxKm < 55 ? 2 : 1;
    for (const m of marq) {
      m.noeud.setAttribute('transform', `translate(${(m.x * k + tx).toFixed(1)} ${(m.y * k + ty).toFixed(1)})`);
      let vis = visibles[m.couche];
      if (m.genre === 'pk') vis = vis && m.pk % pas === 0;
      if (m.genre === 'annexe') vis = vis && k > 0.03;
      m.noeud.style.display = vis ? '' : 'none';
      m.noeud.classList.toggle('cv-choisi', m.id === selection);
      m.noeud.classList.toggle('cv-sans-nom', m.genre === 'pn' && k < 0.045);
      if (m.genre === 'gare') {                       // le nom passe à gauche du point près du bord droit
        const gauche = m.x * k + tx > larg * 0.5, t = m.noeud.querySelector('text');
        t.setAttribute('x', gauche ? -13 : 13); t.setAttribute('text-anchor', gauche ? 'end' : 'start');
      }
    }
  }
  function ajuster() {
    const r = taille(); if (!r.width) return;
    const xs = LIGNE.map((p) => p[0]), ys = LIGNE.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), marge = 44;
    k = Math.min((r.width - 2 * marge) / (x1 - x0), (r.height - 2 * marge) / (y1 - y0));
    kMin = k * 0.8; tx = r.width / 2 - ((x0 + x1) / 2) * k; ty = r.height / 2 - ((y0 + y1) / 2) * k; ajuste = true; rendre();
  }
  function zoomer(facteur, cx, cy) {
    const r = taille(); cx ??= r.width / 2; cy ??= r.height / 2;
    const k2 = Math.max(kMin, Math.min(1.6, k * facteur)), f = k2 / k;
    tx = cx - (cx - tx) * f; ty = cy - (cy - ty) * f; k = k2; rendre();
  }
  function centrerSur(x, y, kCible) {
    const r = taille(); k = Math.max(kMin, Math.min(1.6, kCible || k)); tx = r.width / 2 - x * k; ty = r.height / 2 - y * k; rendre();
  }

  // ── Gestes : un doigt déplace, deux doigts pincent ──
  const doigts = new Map(); let deplace = false, depart = null, ecartPince = 0;
  svg.style.touchAction = 'none';
  svg.addEventListener('pointerdown', (e) => {
    doigts.set(e.pointerId, [e.clientX, e.clientY]); deplace = false; depart = [e.clientX, e.clientY];
    if (doigts.size === 2) { const [a, b] = [...doigts.values()]; ecartPince = Math.hypot(a[0] - b[0], a[1] - b[1]); deplace = true; }
  });
  svg.addEventListener('pointermove', (e) => {
    const avant = doigts.get(e.pointerId); if (!avant) return;
    const r = taille(), apres = [e.clientX, e.clientY];
    if (doigts.size === 1) {
      if (!deplace && Math.hypot(apres[0] - depart[0], apres[1] - depart[1]) > 6) { deplace = true; try { svg.setPointerCapture(e.pointerId); } catch {} }
      if (deplace) { tx += apres[0] - avant[0]; ty += apres[1] - avant[1]; rendre(); }
    } else if (doigts.size === 2) {
      const autre = [...doigts.entries()].find(([id]) => id !== e.pointerId)[1];
      const d0 = Math.hypot(avant[0] - autre[0], avant[1] - autre[1]), d1 = Math.hypot(apres[0] - autre[0], apres[1] - autre[1]);
      if (d0 > 0) zoomer(d1 / d0, (apres[0] + autre[0]) / 2 - r.left, (apres[1] + autre[1]) / 2 - r.top);
    }
    doigts.set(e.pointerId, apres);
  });
  const fin = (e) => {
    const etait = doigts.size; doigts.delete(e.pointerId);
    if (e.type === 'pointerup' && etait === 1 && !deplace) {
      const cible = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-id]');
      choisir(cible && cible.style.display !== 'none' ? cible.dataset.id : null);
    }
  };
  svg.addEventListener('pointerup', fin); svg.addEventListener('pointercancel', fin);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const r = taille(); zoomer(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  conteneur.querySelector('.cv-zoom').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.z === '0') ajuster(); else zoomer(b.dataset.z === '+' ? 1.6 : 1 / 1.6);
  });
  conteneur.querySelector('.cv-couches').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    visibles[b.dataset.c] = !visibles[b.dataset.c]; b.setAttribute('aria-pressed', visibles[b.dataset.c]); rendre();
  });

  // ── Détail de l'élément choisi ──
  function choisir(id) {
    selection = id; rendre();
    const m = marq.find((x) => x.id === id);
    if (!m || m.genre === 'tampon') { detail.hidden = true; onChoisir(null); return; }
    let h = '';
    if (m.genre === 'gare') h = `<b>${esc(m.data.nom)}</b><span>Gare · ${esc(formatPk(m.data.pk))}</span>`;
    else if (m.genre === 'pn') { const t = typePn(m.data); h = `<b>${esc(m.data.nom)}</b><span>Passage à niveau · ${esc(formatPk(m.data.pk))}</span>
      <span class="cv-pastille" style="--c:${t.couleur}">${esc(t.label)}</span><span class="aide">${esc(t.detail)}</span>`; }
    else if (m.genre === 'annexe') h = `<b>${esc(LIB_ANNEXE[m.data.genre])}</b><span>Environ ${m.data.longueur} m</span><span class="aide">Classement automatique d’après OpenStreetMap, à vérifier sur le terrain.</span>`;
    else if (m.genre === 'pk') h = `<b>${esc(formatPk(m.pk))}</b><span>Point kilométrique</span>`;
    else if (m.genre === 'panne') { const p = m.data;
      h = `<b>${esc(p.titre)}</b><span>${esc(GRAVITES[p.gravite].label)} · ${esc(ELEMENTS[p.element] || 'Voie')}${p.pk != null ? ' · ' + esc(formatPk(p.pk)) : ''}</span>
        <a class="btn second" href="#/panne/${esc(p.id)}">Voir le problème</a>`; }
    detail.innerHTML = h; detail.hidden = false; onChoisir(m);
  }

  new ResizeObserver(() => { if (!ajuste) ajuster(); else rendre(); }).observe(svg);
  rendre();
  return { ajuster, choisir, centrerSur, pointAuPk, destroy() {} };
}

export { VOIE, pointAuPk };
