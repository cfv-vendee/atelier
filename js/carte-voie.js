// Plan interactif de la ligne Les Herbiers – Mortagne-sur-Sèvre : dessin vectoriel (SVG), sans fond de carte en ligne,
// donc utilisable hors connexion. Glisser pour déplacer, pincer ou molette pour zoomer, toucher un élément pour le détail.
import { VOIE } from './voie-cfv.js';
import { esc, GRAVITES, formatPk as formatPkPrecis, ELEMENTS, feuille, toast, pkDansLaLigne, messagePkHorsLigne, LIGNE as PK_LIGNE } from './ui.js';
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
  auto: { label: 'Automatique', detail: 'feux et cloche', couleur: '#175CD3' },
  manuel: { label: 'Manuel', detail: 'gardé ou manœuvré à la main', couleur: '#C26A00' },
  barrieres: { label: 'À barrières (à confirmer)', detail: 'barrières relevées sur OpenStreetMap, manuel ou automatique à confirmer', couleur: '#C26A00' },
  inconnu: { label: 'Type non renseigné', detail: 'à préciser sur le terrain', couleur: '#8A919C' },
};
const typePn = (p) => TYPES_PN[p.type] || TYPES_PN.inconnu;
const LIB_OUVRAGE = { viaduc: 'Viaduc', pont: 'Pont', tunnel: 'Tunnel' };
const COUL_OUVRAGE = '#7A5C2E';
const mil = (c) => c[Math.floor(c.length / 2)];
const cleDe = (prefixe, c) => { const p = mil(c); return `${prefixe}:${p[1].toFixed(4)},${p[0].toFixed(4)}`; };
const COUL_ANNEXE = { evitement: '#175CD3', tiroir: '#7A3FB0' };
const LIB_ANNEXE = { evitement: "Voie d'évitement", tiroir: 'Tiroir (voie en cul-de-sac)' };
const COUCHES = [['gares', 'Gares'], ['pn', 'Passages à niveau'], ['ouvrages', 'Ouvrages'], ['pk', 'PK'], ['annexes', 'Évitements et tiroirs'], ['pannes', 'Problèmes']];

const el = (nom, attrs = {}, parent) => {
  const n = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n); return n;
};
const chemin = (pts) => 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L');

export function monterCarte(conteneur, { pannes = [], corrections = [], peutModifier = false, onSauver = async () => {}, onSupprimer = async () => {}, onChoisir = () => {}, choisi = null, etat = null } = {}) {
  const visibles = { gares: true, pn: true, ouvrages: true, pk: true, annexes: true, pannes: true, ...(etat?.visibles || {}) };
  const corr = new Map(corrections.filter((c) => c.cle).map((c) => [c.cle, c]));
  const ajouts = corrections.filter((c) => !c.cle);
  const retires = corrections.filter((c) => c.cle && c.masque);
  conteneur.innerHTML = `
    <div class="cv-zone"><svg class="cv-svg" role="img" aria-label="Plan de la ligne"></svg>
      <div class="cv-zoom"><button type="button" data-z="+" aria-label="Zoom avant">+</button><button type="button" data-z="-" aria-label="Zoom arrière">−</button>
        <button type="button" data-z="0" aria-label="Voir toute la ligne">⤢</button></div>
      <div class="cv-detail" hidden></div></div>
    <div class="cv-couches" role="group" aria-label="Éléments affichés">${COUCHES.map(([id, nom]) => `<button type="button" data-c="${id}" aria-pressed="${visibles[id]}">${esc(nom)}</button>`).join('')}</div>
    ${peutModifier ? `<div class="cv-edition"><button type="button" class="btn neutre" data-ajout>${'+'} Ajouter un ouvrage ou un PN</button>
      ${retires.length ? `<button type="button" class="btn neutre" data-retablir>Rétablir ${retires.length} élément${retires.length > 1 ? 's' : ''} retiré${retires.length > 1 ? 's' : ''}</button>` : ''}</div>` : ''}
    <div class="cv-legende" aria-label="Légende">
      <span><i class="cv-l-pn" style="background:#175CD3"></i>PN automatique</span><span><i class="cv-l-pn" style="background:#C26A00"></i>PN à barrières</span>
      <span><i class="cv-l-pn" style="background:#8A919C"></i>PN type non renseigné</span><span><i class="cv-l-li" style="background:#175CD3"></i>Évitement</span>
      <span><i class="cv-l-li" style="background:#7A3FB0"></i>Tiroir</span><span><i class="cv-l-li" style="background:#7A5C2E"></i>Viaduc, pont</span></div>
    <p class="aide cv-source">Tracé, gares et passages à niveau : © contributeurs OpenStreetMap. PK : SNCF Réseau, via Carto Tchoo. Données à confirmer avec le relevé de terrain.</p>`;
  const svg = conteneur.querySelector('.cv-svg'), detail = conteneur.querySelector('.cv-detail');
  const g = el('g', {}, svg), gLignes = el('g', {}, g);
  const gMarq = el('g', {}, svg);
  let k = 0.05, tx = 0, ty = 0, kMin = 0.01, ajuste = false, selection = choisi;
  const taille = () => svg.getBoundingClientRect();

  // ── Éléments du plan d'origine, avec les corrections des référents voie ──
  const annexes = ANNEXES.map((x) => { const cle = cleDe('annexe', x.c), c = corr.get(cle); return { ...x, cle, corr: c, genre: c?.genre || x.genre, masque: !!c?.masque }; }).filter((x) => !x.masque);
  const ouvrages = OUVRAGES.map((o) => {
    const cle = cleDe('ouvrage', o.c), c = corr.get(cle), defaut = o.genre === 'pont' && o.longueur >= 100 ? 'viaduc' : o.genre;
    return { ...o, cle, corr: c, genre: c?.genre || defaut, nom: c?.nom || o.nom, masque: !!c?.masque };
  }).filter((o) => !o.masque);
  const pns = VOIE.pn.map((q) => { const cle = 'pn:' + q.nom, c = corr.get(cle); return { ...q, cle, corr: c, type: c?.pn_type || q.type, masque: !!c?.masque }; }).filter((q) => !q.masque);

  // ── Tracé : annexes, ouvrages, puis ligne principale « façon rail » ──
  const gAnn = el('g', {}, gLignes);
  annexes.forEach((x) => el('path', { d: chemin(x.m), fill: 'none', stroke: COUL_ANNEXE[x.genre], 'stroke-width': 3.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, gAnn));
  ouvrages.filter((o) => o.genre !== 'tunnel').forEach((o) => el('path', { d: chemin(o.m), fill: 'none', stroke: COUL_OUVRAGE, 'stroke-width': 11, 'stroke-linecap': 'butt', 'vector-effect': 'non-scaling-stroke', opacity: .55 }, gLignes));
  el('path', { d: chemin(LIGNE), fill: 'none', stroke: '#2F3540', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, gLignes);
  el('path', { d: chemin(LIGNE), fill: 'none', stroke: '#FFFFFF', 'stroke-width': 1.6, 'stroke-dasharray': '6 6', 'vector-effect': 'non-scaling-stroke' }, gLignes);
  ouvrages.filter((o) => o.genre === 'tunnel').forEach((o) => el('path', { d: chemin(o.m), fill: 'none', stroke: '#2F3540', 'stroke-width': 9, 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' }, gLignes));

  // ── Marqueurs (positions recalculées à chaque déplacement, taille fixe à l'écran) ──
  const marq = [];       // { id, genre, x, y, noeud, couche, rendu(k) }
  const ajouter = (m) => { m.noeud = el('g', { 'data-id': m.id, class: 'cv-m cv-m-' + m.genre }, gMarq); marq.push(m); m.dessin(m.noeud); return m; };
  const texte = (parent, t, dx, dy, cls = '') => { const n = el('text', { x: dx, y: dy, class: 'cv-t ' + cls }, parent); n.textContent = t; return n; };
  const dessinPn = (q) => (n) => {
    el('circle', { r: 17, fill: 'transparent' }, n); el('circle', { r: 6, fill: typePn(q).couleur, stroke: '#fff', 'stroke-width': 2 }, n);
    el('path', { d: 'M-3 -3 3 3M3 -3 -3 3', stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, n);
    texte(n, q.nom.replace('PN ', ''), 9, -7, 'cv-t-pn');
  };
  const dessinOuvrage = (o) => (n) => {
    el('circle', { r: 17, fill: 'transparent' }, n); el('rect', { x: -10, y: -8, width: 20, height: 16, rx: 4, fill: COUL_OUVRAGE, stroke: '#fff', 'stroke-width': 2 }, n);
    el('path', { d: o.genre === 'tunnel' ? 'M-5 4V0a5 5 0 0 1 10 0v4' : 'M-6 4v-2M6 4v-2M-6 2a3 3 0 0 1 6 0M0 2a3 3 0 0 1 6 0', fill: 'none', stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, n);
    texte(n, o.nom || LIB_OUVRAGE[o.genre], 14, 4, 'cv-t-ouv');
  };

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
  pns.forEach((q) => { const [x, y] = monde(q.lng, q.lat); ajouter({ id: 'pn:' + q.nom, genre: 'pn', couche: 'pn', x, y, data: q, dessin: dessinPn(q) }); });
  ajouts.filter((e) => e.genre === 'pn').forEach((e) => {
    const [x, y] = pointAuPk(Number(e.pk)), q = { nom: e.nom, pk: Number(e.pk), type: e.pn_type, cle: null, corr: e };
    ajouter({ id: 'ajout:' + e.id, genre: 'pn', couche: 'pn', x, y, data: q, dessin: dessinPn(q) });
  });
  ouvrages.forEach((o, i) => {
    const m0 = mil(o.m);
    ajouter({ id: 'ouvrage:' + i, genre: 'ouvrage', couche: 'ouvrages', x: m0[0], y: m0[1], data: o, dessin: dessinOuvrage(o) });
  });
  ajouts.filter((e) => e.genre !== 'pn').forEach((e) => {
    const [x, y] = pointAuPk(Number(e.pk)), o = { genre: e.genre, nom: e.nom, pk: Number(e.pk), longueur: null, cle: null, corr: e };
    ajouter({ id: 'ajout:' + e.id, genre: 'ouvrage', couche: 'ouvrages', x, y, data: o, dessin: dessinOuvrage(o) });
  });
  VOIE.tampons.forEach((t, i) => {
    const [x, y] = monde(t.lng, t.lat);
    ajouter({ id: 'tampon' + i, genre: 'tampon', couche: 'annexes', x, y, dessin: (n) => el('rect', { x: -3, y: -3, width: 6, height: 6, fill: '#2F3540' }, n) });
  });
  annexes.forEach((x0, i) => {
    const m0 = mil(x0.m), L = longueur(x0.m);
    if (L < 60) return;
    ajouter({ id: 'annexe:' + i, genre: 'annexe', couche: 'annexes', x: m0[0], y: m0[1], data: { ...x0, longueur: Math.round(L) }, dessin: (n) => {
      el('circle', { r: 15, fill: 'transparent' }, n); el('circle', { r: 4.5, fill: '#fff', stroke: COUL_ANNEXE[x0.genre], 'stroke-width': 2.5 }, n); } });
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
      m.noeud.classList.toggle('cv-sans-nom', (m.genre === 'pn' && k < 0.045) || (m.genre === 'ouvrage' && k < 0.03));
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
  const fiche = (m) => {
    const d = m.data;
    if (m.genre === 'gare') return `<b>${esc(d.nom)}</b><span>Gare · ${esc(formatPk(d.pk))}</span>`;
    if (m.genre === 'pn') { const t = typePn(d); return `<b>${esc(d.nom)}</b><span>Passage à niveau · ${esc(formatPk(d.pk))}</span>
      <span class="cv-pastille" style="--c:${t.couleur}">${esc(t.label)}</span><span class="aide">${esc(t.detail)}</span>`; }
    if (m.genre === 'ouvrage') return `<b>${esc(d.nom || LIB_OUVRAGE[d.genre])}</b><span>${esc(LIB_OUVRAGE[d.genre])} · ${esc(formatPk(d.pk))}${d.longueur ? ` · environ ${d.longueur} m` : ''}</span>
      <span class="aide">${d.corr ? 'Renseigné par un référent voie.' : 'D’après OpenStreetMap, à vérifier sur le terrain.'}</span>`;
    if (m.genre === 'annexe') return `<b>${esc(LIB_ANNEXE[d.genre])}</b><span>Environ ${d.longueur} m</span>
      <span class="aide">${d.corr ? 'Classé par un référent voie.' : 'Classement automatique d’après OpenStreetMap, à vérifier sur le terrain.'}</span>`;
    if (m.genre === 'pk') return `<b>${esc(formatPk(m.pk))}</b><span>Point kilométrique</span>`;
    if (m.genre === 'panne') return `<b>${esc(d.titre)}</b><span>${esc(GRAVITES[d.gravite].label)} · ${esc(ELEMENTS[d.element] || 'Voie')}${d.pk != null ? ' · ' + esc(formatPk(d.pk)) : ''}</span>
        <a class="btn second" href="#/panne/${esc(d.id)}">Voir le problème</a>`;
    return '';
  };
  function choisir(id) {
    selection = id; rendre();
    const m = marq.find((x) => x.id === id);
    if (!m || m.genre === 'tampon') { detail.hidden = true; onChoisir(null); return; }
    const modifiable = peutModifier && ['pn', 'ouvrage', 'annexe'].includes(m.genre);
    detail.innerHTML = fiche(m) + (modifiable ? '<button type="button" class="btn neutre cv-modifier" data-modifier>Modifier</button>' : '');
    detail.hidden = false; onChoisir(m);
    detail.querySelector('[data-modifier]')?.addEventListener('click', () => modifier(m));
  }

  // ── Édition (référents voie et administrateurs) ──
  const choix = (nom, liste, courant) => `<div class="segments ${liste.length === 3 ? 'trois' : ''}" role="group" data-groupe="${nom}">${liste.map(([v, l]) =>
    `<button type="button" data-v="${v}" aria-pressed="${v === courant}">${esc(l)}</button>`).join('')}</div>`;
  const lireChoix = (el0, nom) => el0.querySelector(`[data-groupe="${nom}"] [aria-pressed="true"]`)?.dataset.v ?? '';
  const brancherChoix = (el0) => el0.querySelectorAll('[data-groupe]').forEach((gr) => gr.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    gr.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
  async function enregistrer(fn, fermer) {
    try { await fn(); fermer(); } catch (e) { toast(e.message || 'Enregistrement impossible.'); }
  }
  function modifier(m) {
    const d = m.data, titre = m.genre === 'pn' ? d.nom : m.genre === 'annexe' ? LIB_ANNEXE[d.genre] : (d.nom || LIB_OUVRAGE[d.genre]);
    let corps = '';
    if (m.genre === 'pn') corps = `<p class="aide">Type du passage à niveau</p>${choix('type', [['manuel', 'Manuel'], ['auto', 'Automatique'], ['', 'Selon OSM']], d.corr?.pn_type || '')}`;
    if (m.genre === 'annexe') corps = `<p class="aide">Classement de cette voie</p>${choix('genre', [['evitement', 'Évitement'], ['tiroir', 'Tiroir']], d.genre)}`;
    if (m.genre === 'ouvrage') corps = `<label class="champ"><span class="etiquette">Nom (facultatif)</span><input class="saisie" id="nom" maxlength="120" value="${esc(d.nom || '')}"></label>
      <p class="aide">Type d’ouvrage</p>${choix('genre', [['viaduc', 'Viaduc'], ['pont', 'Pont'], ['tunnel', 'Tunnel']], d.genre)}`;
    const ajoute = !d.cle;     // élément ajouté à la main : on peut le supprimer ; sinon on peut seulement le retirer de la carte
    const { el: f, fermer } = feuille(titre, `${corps}<p class="erreur" id="err" role="alert"></p>
      <button type="button" class="btn grand" data-ok>Enregistrer</button>
      <button type="button" class="btn neutre" data-retirer>${ajoute ? 'Supprimer cet élément' : 'Retirer de la carte'}</button>`, { focusChamp: false });
    brancherChoix(f);
    f.querySelector('[data-ok]').onclick = () => enregistrer(async () => {
      const base = d.cle ? { id: d.corr?.id, cle: d.cle } : { id: d.corr.id };
      const champs = {};
      if (m.genre === 'pn') champs.pn_type = lireChoix(f, 'type') || null;
      if (m.genre === 'annexe') champs.genre = lireChoix(f, 'genre');
      if (m.genre === 'ouvrage') { champs.genre = lireChoix(f, 'genre'); champs.nom = f.querySelector('#nom').value.trim() || null; }
      await onSauver({ ...base, ...champs, masque: false });
    }, fermer);
    f.querySelector('[data-retirer]').onclick = () => enregistrer(async () => {
      if (ajoute) await onSupprimer(d.corr.id); else await onSauver({ id: d.corr?.id, cle: d.cle, masque: true });
    }, fermer);
  }
  function ajouterElement() {
    const { el: f, fermer } = feuille('Ajouter à la carte', `
      <p class="aide">Ce qui manque sur la carte : un ouvrage ou un passage à niveau, placé à son PK.</p>
      ${choix('genre', [['viaduc', 'Viaduc'], ['pont', 'Pont'], ['tunnel', 'Tunnel'], ['pn', 'Passage à niveau']], 'viaduc').replace('class="segments "', 'class="segments cv-quatre"')}
      <label class="champ"><span class="etiquette">Nom</span><input class="saisie" id="nom" maxlength="120" placeholder="ex. Viaduc de Barbin"></label>
      <label class="champ"><span class="etiquette">PK</span><input class="saisie" id="pk" inputmode="decimal" placeholder="ex. 64,2"></label>
      <div id="bloc-pn" hidden><p class="aide">Type du passage à niveau</p>${choix('type', [['manuel', 'Manuel'], ['auto', 'Automatique'], ['', 'À préciser']], '')}</div>
      <p class="erreur" id="err" role="alert"></p><button type="button" class="btn grand" data-ok>Ajouter</button>`, { focusChamp: false });
    brancherChoix(f);
    f.querySelector('[data-groupe="genre"]').addEventListener('click', () => { f.querySelector('#bloc-pn').hidden = lireChoix(f, 'genre') !== 'pn'; });
    f.querySelector('[data-ok]').onclick = () => {
      const err = f.querySelector('#err'), genre = lireChoix(f, 'genre');
      const nom = f.querySelector('#nom').value.trim(), pkTxt = f.querySelector('#pk').value.trim().replace(',', '.'), pk = Number(pkTxt);
      if (!nom) return (err.textContent = 'Donnez un nom, par exemple « Viaduc de Barbin » ou « PN 47 ».');
      if (!pkTxt || Number.isNaN(pk) || !pkDansLaLigne(pk)) return (err.textContent = messagePkHorsLigne);
      enregistrer(() => onSauver({ genre, nom, pk, pn_type: genre === 'pn' ? lireChoix(f, 'type') || null : null }), fermer);
    };
  }
  conteneur.querySelector('[data-ajout]')?.addEventListener('click', ajouterElement);
  conteneur.querySelector('[data-retablir]')?.addEventListener('click', () => enregistrer(async () => { for (const c of retires) await onSauver({ id: c.id, masque: false }); }, () => {}));

  new ResizeObserver(() => {
    if (!ajuste) { if (etat?.k) { k = etat.k; tx = etat.tx; ty = etat.ty; kMin = etat.kMin; ajuste = true; rendre(); if (selection) choisir(selection); } else ajuster(); }
    else rendre();
  }).observe(svg);
  rendre();
  return { ajuster, choisir, centrerSur, pointAuPk, etat: () => ({ k, tx, ty, kMin, visibles: { ...visibles }, selection }), destroy() {} };
}

export { VOIE, pointAuPk };
