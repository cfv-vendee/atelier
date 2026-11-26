// Tournée d'inspection de la voie : démarrage, suivi PK par PK, défauts, compte rendu.
// La tournée en cours est gardée dans le téléphone : elle survit à une coupure de réseau ou à la fermeture de l'appli.
import { esc, icone, pastille, GRAVITES, ELEMENTS, formatPk, feuille, toast, champPhotos, brancherPhotos, peutInspecter, LIGNE, pkDansLaLigne, messagePkHorsLigne } from '../ui.js';
import { lignePanne } from './accueil.js';

// ───── État local de la tournée en cours ─────
const cle = (uid) => 'cfv-tournee-en-cours:' + uid;
export function tourneeEnCours(uid) { try { return JSON.parse(localStorage.getItem(cle(uid))); } catch { return null; } }
const garder = (uid, t) => localStorage.setItem(cle(uid), JSON.stringify(t));
const oublier = (uid) => localStorage.removeItem(cle(uid));

// ───── Calcul des portions ─────
const arrondi = (x) => Math.round(x * 1000) / 1000;
const pkTexte = (x) => formatPk(x).replace('PK ', '');
export function fusionner(segments) {
  const s = segments.map(([a, b, ...r]) => [Math.min(a, b), Math.max(a, b), ...r]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const res = [];
  for (const seg of s) {
    const dernier = res[res.length - 1];
    if (dernier && seg[0] <= dernier[1] + 0.0005) dernier[1] = Math.max(dernier[1], seg[1]);
    else res.push([seg[0], seg[1]]);
  }
  return res;
}
function manquants(debut, fin, couverts) {
  const [a, b] = [Math.min(debut, fin), Math.max(debut, fin)];
  const res = [];
  let curseur = a;
  for (const [x, y] of fusionner(couverts)) {
    if (y <= a || x >= b) continue;
    if (x > curseur + 0.0005) res.push([curseur, Math.min(x, b)]);
    curseur = Math.max(curseur, y);
  }
  if (curseur < b - 0.0005) res.push([curseur, b]);
  return res.map(([x, y]) => [arrondi(x), arrondi(y)]);
}
const longueur = (segs) => segs.reduce((n, [a, b]) => n + (b - a), 0);
function bilan(t) {
  const vues = fusionner(t.journal.filter((j) => j.type === 'vu' || j.type === 'defaut').map((j) => [j.de, j.type === 'vu' ? j.a : j.pk]));
  const nonVues = t.journal.filter((j) => j.type === 'non_vu').map((j) => [Math.min(j.de, j.a), Math.max(j.de, j.a), j.raison || 'Non inspecté']);
  const total = Math.abs(t.pk_fin - t.pk_debut) || 1;
  const restants = manquants(t.pk_debut, t.pk_fin, [...vues, ...nonVues]);
  return { vues, nonVues, restants, pourcent: Math.round((longueur(vues) / total) * 100) };
}

// Barre de la portion : vu (vert), non inspecté (gris rayé), défauts (points), position (repère).
export function regle({ pk_debut, pk_fin, vues, nonVues, defauts, position }) {
  const a = Math.min(pk_debut, pk_fin), b = Math.max(pk_debut, pk_fin), L = (b - a) || 1;
  const pct = (x) => `${((Math.min(Math.max(x, a), b) - a) / L) * 100}%`;
  const larg = (x, y) => `${((Math.min(y, b) - Math.max(x, a)) / L) * 100}%`;
  return `<div class="regle" role="img" aria-label="Portion de ${esc(formatPk(a))} à ${esc(formatPk(b))}">
    <div class="regle-voie">
      ${nonVues.map(([x, y]) => `<span class="regle-nv" style="left:${pct(x)};width:${larg(x, y)}"></span>`).join('')}
      ${vues.map(([x, y]) => `<span class="regle-vu" style="left:${pct(x)};width:${larg(x, y)}"></span>`).join('')}
      ${defauts.map((d) => `<span class="regle-defaut" style="left:${pct(d.pk)};background:${GRAVITES[d.gravite].couleur}"></span>`).join('')}
      ${position != null ? `<span class="regle-pos" style="left:${pct(position)}"></span>` : ''}
    </div>
    <div class="regle-bornes"><span>PK ${esc(pkTexte(pk_debut))}</span><span>PK ${esc(pkTexte(pk_fin))}</span></div>
  </div>`;
}
const legende = `<div class="legende"><span><i style="background:var(--ok)"></i>Vu</span><span><i class="nv"></i>Non inspecté</span>
  <span><i style="background:#B42318;border-radius:5px"></i>Défaut</span><span><i style="background:var(--encre);width:3px"></i>Position</span></div>`;

const duree = (de, a = new Date()) => {
  const min = Math.max(0, Math.round((new Date(a) - new Date(de)) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
};
const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const lirePk = (v) => { const n = Number(String(v).trim().replace(',', '.')); return Number.isFinite(n) && n >= 0 && n <= 99 ? arrondi(n) : null; };

// ───── Écran ─────
export async function afficher(ctx) {
  if (ctx.params[0]) return compteRendu(ctx, ctx.params[0]);
  if (!peutInspecter(ctx.moi)) return ctx.aller('voie');
  const t = tourneeEnCours(ctx.moi.id);
  return t ? enCours(ctx, t) : demarrage(ctx);
}

function demarrage(ctx) {
  const el = ctx.rendre(`
  <div class="barre"><a class="retour" href="#/voie" data-retour aria-label="Retour">${icone('retour')}</a><h1>Nouvelle tournée</h1></div>
  <form id="f" novalidate><div class="page">
    <p class="aide" style="margin:0;font-size:15px">Indiquez la portion à inspecter. Vous avancerez ensuite PK par PK : chaque portion est notée « vue », « non inspectée » ou porte un défaut.</p>
    <div class="btns">
      <label class="champ"><span class="etiquette">PK de départ</span><input class="saisie" id="de" inputmode="decimal" value="${LIGNE.pkDebut}"></label>
      <label class="champ"><span class="etiquette">PK d'arrivée</span><input class="saisie" id="a" inputmode="decimal" value="${LIGNE.pkFin}"></label>
    </div>
    <div class="champ"><label for="part">Participants <span class="aide">(facultatif)</span></label>
      <input class="saisie" id="part" placeholder="ex. Jean, Sophie" value=""></div>
    <p class="erreur" id="err" role="alert"></p>
  </div>
  <div class="pied"><button class="btn plein" type="submit">${icone('voie', 20)}Démarrer la tournée</button></div></form>`);
  if (!el) return;
  const f = el.querySelector('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const de = lirePk(f.de.value), a = lirePk(f.a.value);
    if (de == null || a == null) { el.querySelector('#err').textContent = `Les PK doivent être des nombres, par exemple ${LIGNE.pkDebut} et ${LIGNE.pkFin}.`; return; }
    if (!pkDansLaLigne(de) || !pkDansLaLigne(a)) { el.querySelector('#err').textContent = messagePkHorsLigne; return; }
    if (de === a) { el.querySelector('#err').textContent = 'Le PK de départ et le PK d’arrivée doivent être différents.'; return; }
    const t = { id: crypto.randomUUID(), pk_debut: de, pk_fin: a, participants: f.part.value.trim() || null, debut: new Date().toISOString(), position: de, journal: [] };
    garder(ctx.moi.id, t);
    await ctx.envois.envoyerOuGarder({ type: 'tournee', tourneeId: t.id, donnees: { pk_debut: de, pk_fin: a, participants: t.participants, debut: t.debut }, resume: `Tournée PK ${pkTexte(de)} → ${pkTexte(a)}` });
    toast('Tournée démarrée');
    ctx.aller('tournee', { remplacer: true });
  };
}

function enCours(ctx, t) {
  const { moi } = ctx;
  let cible = t.position;
  const sens = t.pk_fin >= t.pk_debut ? 1 : -1;
  const b = bilan(t);
  const defauts = t.journal.filter((j) => j.type === 'defaut');

  const el = ctx.rendre(`
  <div class="barre"><a class="retour" href="#/voie" aria-label="Retour à la voie">${icone('retour')}</a><h1>Tournée en cours</h1>${pastille({ label: `${b.pourcent} % vu`, cls: 'green' })}</div>
  <div class="page">
    <div class="carte pad" style="display:flex;flex-direction:column;gap:10px">
      <div class="aide" style="font-size:14px">PK ${esc(pkTexte(t.pk_debut))} → ${esc(pkTexte(t.pk_fin))} · démarrée à ${heure(t.debut)} (${duree(t.debut)})${t.participants ? ' · ' + esc(t.participants) : ''}</div>
      ${regle({ ...t, vues: b.vues, nonVues: b.nonVues, defauts, position: t.position })}
      ${legende}
    </div>

    <div class="carte pad" style="display:flex;flex-direction:column;gap:10px">
      <div class="aide" style="font-size:14px">Dernière position notée : <b>PK ${esc(pkTexte(t.position))}</b>. Où êtes-vous maintenant ?</div>
      <div class="pas">
        <button type="button" class="choix" data-pas="-1">−1</button><button type="button" class="choix" data-pas="-0.1">−0,1</button>
        <label class="pk-grand"><span class="sr">PK actuel</span><input id="pk" inputmode="decimal" value="${esc(pkTexte(t.position))}"></label>
        <button type="button" class="choix" data-pas="0.1">+0,1</button><button type="button" class="choix" data-pas="1">+1</button>
      </div>
      <div class="btns3">
        <button class="btn" id="ras" style="background:var(--ok)">${icone('check', 20)}RAS jusqu'ici</button>
        <button class="btn" id="defaut" style="background:var(--rouge)">${icone('plus', 20)}Défaut ici</button>
        <button class="btn neutre" id="nonvu">Non inspecté jusqu'ici</button>
      </div>
      <p class="erreur" id="err" role="alert"></p>
      <button class="lien" id="note" style="align-self:center">Ajouter une note (végétation, accès, remarque…)</button>
    </div>

    <h2 class="titre-section">Journal de la tournée</h2>
    <div class="carte liste">${t.journal.length ? [...t.journal].reverse().map((j) => ligneJournal(j)).join('') : '<p class="vide">Rien encore. Avancez puis notez « RAS », un défaut ou une portion non inspectée.</p>'}</div>
  </div>
  <div class="pied"><button class="btn second plein" id="terminer">Terminer la tournée</button>
    <button class="lien" id="abandonner" style="align-self:center;color:var(--rouge)">Abandonner cette tournée</button></div>`);
  if (!el) return;

  const champ = el.querySelector('#pk'), err = el.querySelector('#err');
  const lireCible = () => { const v = lirePk(champ.value); return v; };
  el.querySelectorAll('[data-pas]').forEach((bt) => (bt.onclick = () => {
    const v = lireCible() ?? t.position;
    champ.value = pkTexte(Math.min(LIGNE.pkFin, Math.max(LIGNE.pkDebut, arrondi(v + Number(bt.dataset.pas)))));
  }));
  const verifierAvance = () => {
    err.textContent = '';
    cible = lireCible();
    if (cible == null) { err.textContent = 'Le PK doit être un nombre, par exemple 41,6.'; return false; }
    if (!pkDansLaLigne(cible)) { err.textContent = messagePkHorsLigne; return false; }
    if (cible === t.position) { err.textContent = `Vous êtes encore au PK ${pkTexte(t.position)} : indiquez le PK où vous êtes arrivé.`; return false; }
    return true;
  };
  const enregistrer = (entree) => {
    t.journal.push({ heure: new Date().toISOString(), ...entree });
    if (entree.type !== 'note') t.position = entree.type === 'defaut' ? entree.pk : entree.a;
    garder(moi.id, t);
    ctx.aller('tournee');
  };

  el.querySelector('#ras').onclick = () => { if (verifierAvance()) enregistrer({ type: 'vu', de: t.position, a: cible }); };
  el.querySelector('#nonvu').onclick = () => {
    if (!verifierAvance()) return;
    const { el: f, fermer } = feuille(`Non inspecté : PK ${pkTexte(t.position)} → ${pkTexte(cible)}`, `
      <div class="champ"><label for="raison">Pourquoi ?</label>
        <select class="saisie" id="raison"><option>Accès impossible</option><option>Végétation trop dense</option><option>Manque de temps</option><option>Circulation d'un train</option><option>Autre</option></select></div>
      <div class="btns"><button class="btn neutre" id="annuler">Annuler</button><button class="btn" id="ok">Enregistrer</button></div>`);
    f.querySelector('#annuler').onclick = fermer;
    f.querySelector('#ok').onclick = () => { const raison = f.querySelector('#raison').value; fermer(); enregistrer({ type: 'non_vu', de: t.position, a: cible, raison }); };
  };
  el.querySelector('#note').onclick = () => {
    const pk = lireCible() ?? t.position;
    const { el: f, fermer } = feuille(`Note au PK ${pkTexte(pk)}`, `
      <div class="champ"><label for="txt">Note</label><textarea class="saisie" id="txt" placeholder="ex. Végétation à couper côté gauche"></textarea></div>
      <div class="btns"><button class="btn neutre" id="annuler">Annuler</button><button class="btn" id="ok">Ajouter</button></div>`);
    f.querySelector('#annuler').onclick = fermer;
    f.querySelector('#ok').onclick = () => { const texte = f.querySelector('#txt').value.trim(); if (!texte) return; fermer(); enregistrer({ type: 'note', pk, texte }); };
  };
  el.querySelector('#defaut').onclick = () => {
    const pk = lireCible() ?? t.position;
    if (pk == null) { err.textContent = 'Le PK doit être un nombre, par exemple 4,6.'; return; }
    formulaireDefaut(ctx, t, pk, enregistrer);
  };
  el.querySelector('#terminer').onclick = () => terminer(ctx, t);
  el.querySelector('#abandonner').onclick = (e) => {
    const bt = e.currentTarget;
    if (!bt.dataset.confirme) { bt.dataset.confirme = '1'; bt.textContent = 'Appuyez encore : la tournée sera abandonnée (les défauts déjà signalés restent)'; return; }
    oublier(moi.id);
    ctx.envois.envoyerOuGarder({ type: 'tournee_fin', tourneeId: t.id, donnees: { fin: new Date().toISOString(), statut: 'terminee', notes: [{ texte: 'Tournée abandonnée', heure: new Date().toISOString() }] }, resume: 'Fin de tournée (abandonnée)' });
    toast('Tournée abandonnée'); ctx.aller('voie', { remplacer: true });
  };
}

function ligneJournal(j) {
  const h = `<span class="m">${heure(j.heure)}</span>`;
  if (j.type === 'vu') return `<div class="ligne"><span class="point" style="background:var(--ok)"></span><span class="txt"><span class="t">RAS · PK ${esc(pkTexte(j.de))} → ${esc(pkTexte(j.a))}</span>${h}</span></div>`;
  if (j.type === 'non_vu') return `<div class="ligne"><span class="point" style="background:#8A919C"></span><span class="txt"><span class="t">Non inspecté · PK ${esc(pkTexte(j.de))} → ${esc(pkTexte(j.a))}</span><span class="m">${esc(j.raison)} · ${heure(j.heure)}</span></span></div>`;
  if (j.type === 'note') return `<div class="ligne"><span class="point" style="background:var(--bleu)"></span><span class="txt"><span class="t">Note · PK ${esc(pkTexte(j.pk))}</span><span class="m">${esc(j.texte)} · ${heure(j.heure)}</span></span></div>`;
  return `<div class="ligne"><span class="point" style="background:${GRAVITES[j.gravite].couleur}"></span><span class="txt"><span class="t">${esc(j.titre)}</span>
    <span class="m">${esc(ELEMENTS[j.element])} · PK ${esc(pkTexte(j.pk))} · ${esc(GRAVITES[j.gravite].label)} · ${heure(j.heure)}</span></span></div>`;
}

function formulaireDefaut(ctx, t, pk, enregistrer) {
  const etat = { element: null, gravite: null, gps: null };
  const { el: f, fermer } = feuille(`Défaut au PK ${pkTexte(pk)}`, `
    <div class="champ"><span class="etiquette">Élément</span>
      <div class="grille3">${Object.entries(ELEMENTS).map(([k, l]) => `<button type="button" class="choix" data-element="${k}">${esc(l)}</button>`).join('')}</div></div>
    <div class="champ"><label for="titre">En quelques mots</label><input class="saisie" id="titre" maxlength="80" placeholder="ex. Boulons d'éclisse desserrés"></div>
    <div class="champ"><span class="etiquette">Gravité</span>
      <div class="grille3">${Object.entries(GRAVITES).map(([k, g]) => `<button type="button" class="choix" data-gravite="${k}"><span class="point" style="display:inline-block;background:${g.couleur}"></span> ${g.label}</button>`).join('')}</div></div>
    <div class="champ"><label for="desc">Détails <span class="aide">(facultatif)</span></label><textarea class="saisie" id="desc" style="min-height:70px"></textarea></div>
    ${champPhotos('photos-defaut')}
    <button type="button" class="btn second plein" id="gps">${icone('cible', 20)}Enregistrer ma position GPS</button>
    <p class="aide" id="gps-info" role="status"></p>
    <p class="erreur" id="err" role="alert"></p>
    <div class="btns"><button class="btn neutre" id="annuler">Annuler</button><button class="btn" id="ok">Signaler</button></div>`);
  const photos = brancherPhotos(f.querySelector('[data-photos]'));
  const maj = () => {
    f.querySelectorAll('[data-element]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.element === etat.element));
    f.querySelectorAll('[data-gravite]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.gravite === etat.gravite));
  };
  f.querySelectorAll('[data-element]').forEach((b) => (b.onclick = () => { etat.element = b.dataset.element; maj(); }));
  f.querySelectorAll('[data-gravite]').forEach((b) => (b.onclick = () => { etat.gravite = b.dataset.gravite; maj(); }));
  f.querySelector('#gps').onclick = () => {
    const info = f.querySelector('#gps-info');
    if (!navigator.geolocation) { info.textContent = 'Localisation indisponible sur ce téléphone.'; return; }
    info.textContent = 'Recherche de la position…';
    navigator.geolocation.getCurrentPosition(
      (p) => { etat.gps = { lat: p.coords.latitude, lng: p.coords.longitude, precision_m: Math.round(p.coords.accuracy) }; info.textContent = `Position enregistrée (± ${etat.gps.precision_m} m).`; },
      () => { info.textContent = 'Position introuvable : le PK suffit.'; },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };
  f.querySelector('#annuler').onclick = fermer;
  f.querySelector('#ok').onclick = async (ev) => {
    const titre = f.querySelector('#titre').value.trim(), err = f.querySelector('#err');
    if (!etat.element) { err.textContent = "Choisissez l'élément concerné."; return; }
    if (!titre) { err.textContent = 'Décrivez le défaut en quelques mots.'; return; }
    if (!etat.gravite) { err.textContent = 'Indiquez la gravité.'; return; }
    ev.target.disabled = true;
    const panneId = crypto.randomUUID();
    const donnees = { cible: 'voie', element: etat.element, pk, titre, description: f.querySelector('#desc').value.trim() || null, gravite: etat.gravite, tournee_id: t.id, ...(etat.gps || {}) };
    try {
      const r = await ctx.envois.envoyerOuGarder({ type: 'panne', panneId, donnees, fichiers: photos(), resume: titre });
      fermer();
      toast(r === 'envoye' ? 'Défaut signalé' : 'Défaut gardé dans le téléphone, envoi au retour du réseau');
      enregistrer({ type: 'defaut', de: t.position, pk, panneId, titre, gravite: etat.gravite, element: etat.element });
    } catch (x) { err.textContent = x.message; ev.target.disabled = false; }
  };
}

function terminer(ctx, t) {
  const b = bilan(t);
  const defauts = t.journal.filter((j) => j.type === 'defaut');
  const liste = (segs, raison) => segs.map(([x, y, r]) => `<li>PK ${esc(pkTexte(x))} → ${esc(pkTexte(y))}${raison ? ` (${esc(r || raison)})` : ''}</li>`).join('');
  const { el: f, fermer } = feuille('Terminer la tournée', `
    <p style="margin:0"><b>${b.pourcent} %</b> de la portion vue · <b>${defauts.length}</b> défaut${defauts.length > 1 ? 's' : ''} signalé${defauts.length > 1 ? 's' : ''} · durée ${duree(t.debut)}</p>
    ${b.nonVues.length ? `<div><b>Non inspecté :</b><ul style="margin:4px 0 0">${liste(b.nonVues, true)}</ul></div>` : ''}
    ${b.restants.length ? `<div class="bandeau"><b>Pas encore parcouru :</b><ul style="margin:4px 0 0">${liste(b.restants)}</ul>Ces portions seront notées « non parcourues » dans le compte rendu.</div>` : ''}
    <div class="champ"><label for="obs">Observation générale <span class="aide">(facultatif)</span></label><textarea class="saisie" id="obs" style="min-height:70px"></textarea></div>
    <div class="btns"><button class="btn neutre" id="annuler">Continuer la tournée</button><button class="btn" id="ok">Terminer</button></div>`);
  f.querySelector('#annuler').onclick = fermer;
  f.querySelector('#ok').onclick = async (ev) => {
    ev.target.disabled = true;
    const fin = new Date().toISOString();
    const obs = f.querySelector('#obs').value.trim();
    const notes = t.journal.filter((j) => j.type === 'note').map((j) => ({ pk: j.pk, texte: j.texte, heure: j.heure }));
    if (obs) notes.push({ texte: obs, heure: fin });
    const donnees = {
      fin, statut: 'terminee', pk_fin: t.pk_fin,
      sections_vues: b.vues.map(([x, y]) => [arrondi(x), arrondi(y)]),
      sections_non_vues: [...b.nonVues.map(([x, y, r]) => [arrondi(x), arrondi(y), r]), ...b.restants.map(([x, y]) => [x, y, 'Non parcouru'])],
      notes,
    };
    const r = await ctx.envois.envoyerOuGarder({ type: 'tournee_fin', tourneeId: t.id, donnees, resume: `Compte rendu de tournée PK ${pkTexte(t.pk_debut)} → ${pkTexte(t.pk_fin)}` });
    oublier(ctx.moi.id);
    fermer();
    if (r === 'envoye') { toast('Tournée terminée'); ctx.aller('tournee/' + t.id, { remplacer: true }); }
    else { toast('Tournée terminée : le compte rendu partira au retour du réseau.'); ctx.aller('voie', { remplacer: true }); }
  };
}

// ───── Compte rendu ─────
async function compteRendu(ctx, id) {
  const t = await ctx.api.tournee(id);
  const defauts = t.pannes.filter((p) => p.pk != null).map((p) => ({ pk: Number(p.pk), gravite: p.gravite }));
  const vues = t.sections_vues || [], nonVues = t.sections_non_vues || [];
  const total = Math.abs(t.pk_fin - t.pk_debut) || 1;
  const pourcent = Math.round((longueur(fusionner(vues)) / total) * 100);
  const date = new Date(t.debut).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const el = ctx.rendre(`
  <div class="barre"><a class="retour" href="#/voie" data-retour aria-label="Retour">${icone('retour')}</a><h1>Compte rendu</h1>
    ${t.statut === 'terminee' ? pastille({ label: 'Terminée', cls: 'green' }) : pastille({ label: 'En cours', cls: 'orange' })}</div>
  <div class="page compte-rendu">
    <div class="imprime-seul" style="display:none;align-items:center;gap:12px"><img src="img/logo.png" alt="" style="width:48px">
      <b style="font-size:18px">Chemin de fer de la Vendée · Tournée d'inspection de la voie</b></div>
    <div>
      <h2 style="margin:0;font-size:22px;font-weight:800">Tournée du ${esc(date)}</h2>
      <p class="aide" style="margin:6px 0 0;font-size:15px">PK ${esc(pkTexte(t.pk_debut))} → ${esc(pkTexte(t.pk_fin))} · ${heure(t.debut)}${t.fin ? ` – ${heure(t.fin)} (${duree(t.debut, t.fin)})` : ' · pas encore terminée'}</p>
      <p class="aide" style="margin:4px 0 0;font-size:15px">Inspecteur : ${esc(t.auteur ? `${t.auteur.prenom} ${t.auteur.nom}` : 'Ancien membre')}${t.participants ? ` · avec ${esc(t.participants)}` : ''}</p>
    </div>
    <div class="stats">
      <div class="stat"><b>${pourcent} %</b><span>de la portion vue</span></div>
      <div class="stat ${t.pannes.some((p) => p.gravite === 'bloquante') ? 'alerte' : ''}"><b>${t.pannes.length}</b><span>défaut${t.pannes.length > 1 ? 's' : ''} constaté${t.pannes.length > 1 ? 's' : ''}</span></div>
      <div class="stat"><b>${nonVues.length}</b><span>portion${nonVues.length > 1 ? 's' : ''} non vue${nonVues.length > 1 ? 's' : ''}</span></div>
    </div>
    <div class="carte pad">${regle({ pk_debut: Number(t.pk_debut), pk_fin: Number(t.pk_fin), vues, nonVues, defauts, position: null })}${legende}</div>
    <h3 class="titre-section">Défauts constatés</h3>
    <div class="carte liste">${t.pannes.length ? [...t.pannes].sort((x, y) => (x.pk ?? 0) - (y.pk ?? 0)).map(lignePanne).join('') : '<p class="vide">Aucun défaut constaté.</p>'}</div>
    <h3 class="titre-section">Portions</h3>
    <div class="carte pad" style="display:flex;flex-direction:column;gap:6px;font-size:15px">
      ${fusionner(vues).map(([x, y]) => `<div><span class="point" style="display:inline-block;background:var(--ok)"></span> Vu · PK ${esc(pkTexte(x))} → ${esc(pkTexte(y))}</div>`).join('')}
      ${nonVues.map(([x, y, r]) => `<div><span class="point" style="display:inline-block;background:#8A919C"></span> Non vu · PK ${esc(pkTexte(x))} → ${esc(pkTexte(y))} · ${esc(r || '')}</div>`).join('') || ''}
      ${!vues.length && !nonVues.length ? '<span class="aide">Aucune portion enregistrée.</span>' : ''}
    </div>
    ${(t.notes || []).length ? `<h3 class="titre-section">Notes</h3><div class="carte pad" style="display:flex;flex-direction:column;gap:6px;font-size:15px">
      ${t.notes.map((n) => `<div>${n.pk != null ? `<b>PK ${esc(pkTexte(n.pk))}</b> · ` : ''}${esc(n.texte)}</div>`).join('')}</div>` : ''}
    <button class="btn neutre no-print" id="imprimer">Imprimer / enregistrer en PDF</button>
    ${ctx.moi.est_admin ? '<button class="btn neutre no-print" id="supprimer" style="color:var(--rouge,#B3261E)">Supprimer cette tournée</button>' : ''}
  </div>`);
  if (!el) return;
  el.querySelector('#imprimer').onclick = () => window.print();
  const sup = el.querySelector('#supprimer');
  if (sup) sup.onclick = async () => {
    if (!sup.dataset.confirme) { sup.dataset.confirme = '1'; sup.textContent = 'Appuyez encore pour supprimer (les défauts signalés restent)'; return; }
    sup.disabled = true;
    try { await ctx.api.supprimerTournee(id); toast('Tournée supprimée'); ctx.aller('voie'); }
    catch (e) { sup.disabled = false; delete sup.dataset.confirme; sup.textContent = 'Supprimer cette tournée'; toast(e.message || 'Suppression impossible.'); }
  };
}

// Liste des tournées (onglet Voie).
export const ligneTournee = (t) => `
  <a class="ligne" href="#/tournee/${t.id}">
    <span class="code ${t.statut === 'terminee' ? 'green' : 'orange'}" aria-hidden="true">${icone('voie', 22)}</span>
    <span class="txt"><span class="t">Tournée du ${esc(new Date(t.debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
      <span class="m">PK ${esc(pkTexte(t.pk_debut))} → ${esc(pkTexte(t.pk_fin))} · ${esc(t.auteur ? t.auteur.prenom : '')} · ${t.pannes?.[0]?.count ?? 0} défaut${(t.pannes?.[0]?.count ?? 0) > 1 ? 's' : ''}</span></span>
    ${t.statut === 'terminee' ? '' : pastille({ label: 'En cours', cls: 'orange' })}
  </a>`;
