// Relevé des repères PK sur le terrain (configuration du module Voie, réservé aux référents voie et aux administrateurs).
// Au repère, la position est mesurée pendant 15 s puis moyennée. Sans réseau, le relevé est gardé
// dans le téléphone et envoyé au retour du réseau. L'écran disparaît une fois la configuration terminée.
import { esc, icone, formatPk, feuille, toast, quand, nomPersonne, peutInspecter } from '../ui.js';

export const TYPES_REPERE = {
  borne_km: { label: 'Borne km', court: 'km', pk: true, aide: 'Le nombre écrit sur la borne' },
  borne_hm: { label: 'Borne hm', court: 'hm', pk: true, aide: 'Le nombre écrit sur la borne' },
  gare: { label: 'Gare, halte', court: 'Gare', nom: 'Nom de la gare, début ou fin de quai' },
  pn: { label: 'Passage à niveau', court: 'PN', nom: 'Numéro et route croisée' },
  pont: { label: 'Pont', court: 'Pont', nom: 'Nom, début ou fin du pont' },
  viaduc: { label: 'Viaduc', court: 'Viad.', nom: 'Nom, début ou fin du viaduc' },
  tunnel: { label: 'Tunnel', court: 'Tun.', nom: 'Nom, début ou fin du tunnel' },
  aiguillage: { label: 'Aiguillage', court: 'Aig.', nom: 'Numéro, voie desservie' },
  heurtoir: { label: 'Heurtoir', court: 'Heurt.', nom: 'Voie concernée' },
  zone: { label: 'Zone particulière', court: 'Zone', nom: 'Tranchée, zone sans réseau, limitation… début ou fin' },
};
const COTES = { gauche: 'Gauche', droite: 'Droite' };
const DUREE = 15;                 // secondes de mesure au repère
const PRECISION_FAIBLE = 20;      // mètres

export const voieConfiguree = (params) => !!params?.voie_configuree?.termine;

// Choix gardés d'un repère à l'autre (on enchaîne souvent les bornes du même type).
const choix = { type: 'borne_km', cote: null };
let mesureurActif = null;

// ───── Mesure GPS : suivi en continu, puis moyenne sur 15 s au repère ─────
function creerMesureur(surMaj) {
  const m = { derniere: null, erreur: null, echantillons: null, debut: 0, resultat: null };
  let suivi = null, minuteur = null;
  if (!navigator.geolocation) m.erreur = 'Ce téléphone ne permet pas la localisation.';
  else {
    suivi = navigator.geolocation.watchPosition((p) => {
      m.erreur = null;
      m.derniere = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
      if (m.echantillons) m.echantillons.push(m.derniere);
      surMaj();
    }, (e) => {
      if (e.code === 1) m.erreur = "La localisation est refusée pour l'appli : autorisez-la dans les réglages du téléphone (Confidentialité → Service de localisation).";
      else if (!m.derniere) m.erreur = null;   // pas encore de signal : on continue de chercher
      surMaj();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
  const finir = () => {
    clearInterval(minuteur); minuteur = null;
    const ech = m.echantillons || [];
    m.echantillons = null;
    m.resultat = moyenne(ech);
    if (!m.resultat) m.erreur = 'Aucune position reçue pendant la mesure. Vérifiez que la localisation est activée, puis recommencez.';
    surMaj();
  };
  return Object.assign(m, {
    mesurer() {
      m.resultat = null; m.erreur = null; m.debut = Date.now();
      // Une position toute fraîche compte déjà (le téléphone n'en envoie pas toujours de nouvelle s'il ne bouge pas).
      m.echantillons = m.derniere && Date.now() - m.derniere.t < 3000 ? [m.derniere] : [];
      minuteur = setInterval(() => (Date.now() - m.debut >= DUREE * 1000 ? finir() : surMaj()), 250);
      surMaj();
    },
    arreter: finir,
    oublier() { m.resultat = null; surMaj(); },
    couper() { clearInterval(minuteur); if (suivi != null) navigator.geolocation.clearWatch(suivi); suivi = null; },
  });
}
// Moyenne pondérée par la précision, en écartant les positions nettement moins bonnes que la meilleure.
export function moyenne(ech) {
  if (!ech.length) return null;
  const meilleure = Math.min(...ech.map((e) => e.acc));
  const gardes = ech.filter((e) => e.acc <= meilleure * 2 + 3);
  let sw = 0, slat = 0, slng = 0;
  for (const e of gardes) { const w = 1 / Math.max(e.acc, 1) ** 2; sw += w; slat += e.lat * w; slng += e.lng * w; }
  const accs = gardes.map((e) => e.acc).sort((a, b) => a - b);
  return { lat: +(slat / sw).toFixed(7), lng: +(slng / sw).toFixed(7), precision_m: Math.round(accs[Math.floor(accs.length / 2)] * 10) / 10, nb_mesures: gardes.length };
}

// ───── Contrôles de cohérence ─────
export function distance(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const pkTxt = (pk) => formatPk(pk).replace('PK ', '');
const metres = (m) => `${Math.round(m).toLocaleString('fr-FR')} m`;
export function verifier(reperes) {
  const alertes = [];
  const bornes = reperes.filter((r) => (r.type === 'borne_km' || r.type === 'borne_hm') && r.pk != null).sort((a, b) => a.pk - b.pk);
  for (let i = 1; i < bornes.length; i++) {
    const a = bornes[i - 1], b = bornes[i];
    const attendu = (b.pk - a.pk) * 1000, d = distance(a, b);
    if (attendu === 0) alertes.push(`Le PK ${pkTxt(a.pk)} a été relevé deux fois : supprimez le moins précis.`);
    else if (d > attendu * 1.05 + 30) alertes.push(`Entre PK ${pkTxt(a.pk)} et PK ${pkTxt(b.pk)} : ${metres(d)} à vol d'oiseau pour ${metres(attendu)} de voie. Une position ou un PK est sans doute faux.`);
    else if (attendu >= 200 && d < attendu * 0.5 - 30) alertes.push(`Entre PK ${pkTxt(a.pk)} et PK ${pkTxt(b.pk)} : seulement ${metres(d)} à vol d'oiseau pour ${metres(attendu)} de voie. PK mal lu ?`);
  }
  const faibles = reperes.filter((r) => r.precision_m > PRECISION_FAIBLE).length;
  if (faibles) alertes.push(`${faibles} repère${faibles > 1 ? 's ont' : ' a'} une précision faible (plus de ${PRECISION_FAIBLE} m) : à refaire si possible.`);
  return alertes;
}

export function lirePk(texte) {
  const t = String(texte || '').trim().replace(/^pk\s*/i, '').replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  if (!/^\d{1,4}(\.\d{1,3})?$/.test(t)) return NaN;
  return Number(t);
}

// Tableau CSV (séparateur « ; », virgule décimale : s'ouvre directement dans Excel ou Numbers).
function telechargerCsv(reperes) {
  const nb = (x) => (x == null ? '' : String(x).replace('.', ','));
  const cel = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const lignes = [['Type', 'Nom ou numéro', 'PK', 'Latitude', 'Longitude', 'Précision (m)', 'Mesures', 'Côté', 'Remarque', 'Relevé le', 'Par', 'Photo'].join(';'),
    ...reperes.map((r) => [cel(TYPES_REPERE[r.type]?.label), cel(r.nom), nb(r.pk), nb(r.lat), nb(r.lng), nb(r.precision_m), r.nb_mesures ?? '',
      cel(COTES[r.cote] || ''), cel(r.remarque), cel(new Date(r.created_at).toLocaleString('fr-FR')), cel(r.attente ? 'En attente d’envoi' : nomPersonne(r.auteur)), r.photo ? 'oui' : ''].join(';'))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lignes.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `CFV-reperes-voie-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ───── Écran ─────
export async function afficher(ctx) {
  const { api, moi, envois } = ctx;
  mesureurActif?.couper(); mesureurActif = null;
  const barre = `<div class="barre"><a class="retour" href="#/voie" data-retour aria-label="Retour à la voie">${icone('retour')}</a><h1>Relevé des repères</h1></div>`;
  if (!peutInspecter(moi)) {
    ctx.rendre(`${barre}<div class="page"><div class="bandeau">Le relevé des repères de la voie est réservé aux référents voie et aux administrateurs.</div></div>`);
    return;
  }
  const [serveur, params, enAttente] = await Promise.all([api.reperes(), api.parametres().catch(() => ({})), envois.lister().catch(() => [])]);
  if (voieConfiguree(params)) {
    const el = ctx.rendre(`${barre}<div class="page"><div class="carte pad"><b>La configuration de la voie est terminée.</b>
      <p class="aide">Le relevé des repères n'est plus proposé dans l'onglet Voie. Rouvrez-le seulement s'il faut ajouter ou refaire des repères.</p>
      <button class="btn second plein" id="rouvrir">Rouvrir le relevé</button></div></div>`);
    el && (el.querySelector('#rouvrir').onclick = async () => {
      try { await api.majParametre('voie_configuree', { termine: false }); toast('Relevé rouvert'); ctx.aller('releve', { remplacer: true }); }
      catch (e) { toast(e.message); }
    });
    return;
  }

  const ids = new Set(serveur.map((r) => r.id));
  const attente = enAttente.filter((it) => it.type === 'repere' && !ids.has(it.repereId))
    .map((it) => ({ ...it.donnees, id: it.repereId, created_at: it.cree, photo: it.fichiers?.length ? 'oui' : null, attente: true, refus: it.erreur }));
  const tous = [...serveur, ...attente];
  const tries = [...tous].sort((a, b) => (a.pk ?? 1e9) - (b.pk ?? 1e9) || a.created_at.localeCompare(b.created_at));
  const nbBornes = tous.filter((r) => r.type === 'borne_km').length;
  const pks = tous.map((r) => r.pk).filter((x) => x != null);
  const alertes = verifier(tous);

  // PK probable de la prochaine borne kilométrique (d'après les deux dernières relevées).
  const kms = tous.filter((r) => r.type === 'borne_km' && r.pk != null).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sens = kms.length >= 2 && kms[kms.length - 1].pk < kms[kms.length - 2].pk ? -1 : 1;
  const suivant = kms.length ? kms[kms.length - 1].pk + sens : null;

  const el = ctx.rendre(`${barre}
  <div class="page">
    ${tous.length ? '' : `<div class="bandeau">À chaque repère : choisissez le type, notez le PK écrit sur la borne, puis appuyez sur « Mesurer » en restant immobile ${DUREE} secondes à côté.</div>`}
    <div class="carte pad gps-etat" id="gps" role="status" aria-live="polite"></div>

    <div class="champ"><span class="etiquette">Type de repère</span>
      <div class="grille3" role="group" aria-label="Type de repère">
        ${Object.entries(TYPES_REPERE).map(([k, t]) => `<button type="button" class="choix" data-type="${k}">${esc(t.label)}</button>`).join('')}
      </div></div>
    <div class="champ"><label for="pk">PK <span class="aide" id="pk-aide"></span></label>
      <input class="saisie" id="pk" inputmode="decimal" autocomplete="off"></div>
    <div class="champ" id="champ-nom"><label for="nom">Nom ou numéro <span class="aide">(facultatif)</span></label>
      <input class="saisie" id="nom" maxlength="120" autocomplete="off"></div>
    <div class="champ"><span class="etiquette">Côté de la voie <span class="aide">(dans le sens des PK croissants)</span></span>
      <div class="segments trois" role="group" aria-label="Côté de la voie">
        <button type="button" data-cote="">Non précisé</button><button type="button" data-cote="gauche">Gauche</button><button type="button" data-cote="droite">Droite</button>
      </div></div>
    <div class="champ"><label for="rem">Remarque <span class="aide">(facultatif)</span></label>
      <textarea class="saisie" id="rem" rows="2" maxlength="1000" placeholder="Ex. borne penchée, chiffre à moitié effacé"></textarea></div>
    <div class="champ">
      <label class="ajout-photo" for="photo">${icone('photo', 20)}<span id="photo-txt">Photo du repère</span></label>
      <input id="photo" class="sr" type="file" accept="image/*" capture="environment">
      <div class="photos" id="apercu"></div>
    </div>
    <p class="erreur" id="err" role="alert"></p>
    <button class="btn grand" id="enregistrer" disabled>${icone('check')}Enregistrer ce repère</button>

    <h2 class="titre-section">Repères relevés (${tous.length})</h2>
    ${tous.length ? `<p class="aide" style="margin:-4px 0 0">${nbBornes} borne${nbBornes > 1 ? 's' : ''} kilométrique${nbBornes > 1 ? 's' : ''} · ${tous.length - nbBornes} autre${tous.length - nbBornes > 1 ? 's' : ''} point${tous.length - nbBornes > 1 ? 's' : ''}${pks.length ? ` · de PK ${esc(pkTxt(Math.min(...pks)))} à PK ${esc(pkTxt(Math.max(...pks)))}` : ''}</p>` : ''}
    ${alertes.length ? `<div class="bandeau" role="note"><b>À vérifier sur place</b><ul style="margin:6px 0 0;padding-left:18px">${alertes.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
    <div class="carte liste">${tries.map((r) => `
      <button class="ligne" data-rid="${esc(r.id)}" ${r.attente ? 'disabled' : ''}>
        <span class="code ${r.type === 'borne_km' || r.type === 'borne_hm' ? 'green' : 'grey'}" style="width:58px;font-size:12px;line-height:1.15;text-align:center">${esc(TYPES_REPERE[r.type]?.court || '')}${r.pk != null ? `<br>${esc(pkTxt(r.pk))}` : ''}</span>
        <span class="txt"><span class="t">${esc(r.nom || TYPES_REPERE[r.type]?.label || 'Repère')}</span>
          <span class="m">± ${esc(String(r.precision_m ?? '?').replace('.', ','))} m${r.cote ? ' · ' + esc(COTES[r.cote]) : ''}${r.photo ? ' · photo' : ''} · ${esc(quand(r.created_at))}</span>
          ${r.refus ? `<span class="erreur" style="font-size:13px">Refusé : ${esc(r.refus)}</span>` : ''}</span>
        ${r.attente ? '<span class="pastille orange">En attente</span>' : icone('chevron', 20)}
      </button>`).join('') || '<p class="vide">Aucun repère pour le moment.</p>'}</div>
    ${tous.length ? `<button class="btn second plein" id="csv">Télécharger le tableau (CSV)</button>` : ''}

    <div class="carte pad"><b>Tous les repères sont relevés ?</b>
      <p class="aide">Terminer la configuration retire cet écran de l'onglet Voie. Un administrateur pourra le rouvrir depuis Profil → Administration si besoin.</p>
      <button class="btn danger plein" id="terminer">Terminer la configuration de la voie</button></div>
  </div>`);
  if (!el) return;

  const $ = (s) => el.querySelector(s);
  const gpsEl = $('#gps'), btnOk = $('#enregistrer'), err = $('#err');
  let photo = null, confirmeFaible = false;

  const majChoix = () => {
    const t = TYPES_REPERE[choix.type];
    el.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.type === choix.type));
    el.querySelectorAll('[data-cote]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.cote === (choix.cote || '')));
    $('#pk-aide').textContent = t.pk ? `(${t.aide})` : '(facultatif : seulement s’il est affiché sur place)';
    $('#nom').placeholder = t.nom || 'Facultatif';
    $('#pk').placeholder = choix.type === 'borne_km' && suivant != null && suivant >= 0 ? `Suivant probable : ${pkTxt(suivant)}` : 'Ex. 41 ou 41,400';
  };
  el.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => { choix.type = b.dataset.type; majChoix(); }));
  el.querySelectorAll('[data-cote]').forEach((b) => (b.onclick = () => { choix.cote = b.dataset.cote || null; majChoix(); }));
  majChoix();

  $('#photo').addEventListener('change', (e) => {
    photo = e.target.files[0] || null;
    $('#apercu').innerHTML = photo ? `<img alt="Photo du repère" src="${URL.createObjectURL(photo)}">` : '';
    $('#photo-txt').textContent = photo ? 'Changer la photo' : 'Photo du repère';
  });

  // Affichage de l'état du GPS et de la mesure.
  const m = creerMesureur(() => afficherGps());
  mesureurActif = m;
  window.addEventListener('hashchange', () => { if (mesureurActif === m) { m.couper(); mesureurActif = null; } }, { once: true });
  function afficherGps() {
    if (!gpsEl.isConnected) return;
    const d = m.derniere, niveau = (acc) => (acc <= 10 ? 'green' : acc <= PRECISION_FAIBLE ? 'orange' : 'red');
    const signal = d ? `<span class="pastille ${niveau(d.acc)}">Signal GPS ± ${Math.round(d.acc)} m</span>` : '<span class="pastille grey">Recherche du signal GPS…</span>';
    let corps;
    if (m.echantillons) {
      const ecoule = Math.min(DUREE, (Date.now() - m.debut) / 1000);
      corps = `<p style="margin:10px 0 6px;font-weight:700">Mesure en cours : restez immobile au repère… ${Math.ceil(DUREE - ecoule)} s</p>
        <div class="jauge" aria-hidden="true"><span style="width:${(ecoule / DUREE) * 100}%"></span></div>
        <p class="aide" style="margin:6px 0 10px">${m.echantillons.length} position${m.echantillons.length > 1 ? 's' : ''} reçue${m.echantillons.length > 1 ? 's' : ''}</p>
        <button type="button" class="btn neutre plein" id="stop">Arrêter maintenant</button>`;
    } else if (m.resultat) {
      const r = m.resultat;
      corps = `<p style="margin:10px 0 4px">${icone('check', 18)} <b>Position mesurée : ± ${esc(String(r.precision_m).replace('.', ','))} m</b> (${r.nb_mesures} mesure${r.nb_mesures > 1 ? 's' : ''})</p>
        <p class="aide" style="margin:0 0 10px">${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}</p>
        ${r.precision_m > PRECISION_FAIBLE ? `<p class="erreur" style="margin:0 0 10px">Précision faible : dégagez-vous des arbres ou du talus, puis mesurez à nouveau.</p>` : ''}
        <button type="button" class="btn second plein" id="mesurer">${icone('cible', 20)}Mesurer à nouveau</button>`;
    } else {
      corps = `${d && d.acc > 10 ? '<p class="aide" style="margin:8px 0 0">Signal encore imprécis : attendez quelques secondes, ciel bien dégagé.</p>' : ''}
        <button type="button" class="btn second plein" id="mesurer" style="margin-top:10px" ${m.erreur && !d ? 'disabled' : ''}>${icone('cible', 20)}Je suis au repère : mesurer (${DUREE} s)</button>`;
    }
    gpsEl.innerHTML = `${signal}${m.erreur ? `<p class="erreur" style="margin:8px 0 0">${esc(m.erreur)}</p>` : ''}${corps}`;
    gpsEl.querySelector('#mesurer')?.addEventListener('click', () => { confirmeFaible = false; m.mesurer(); });
    gpsEl.querySelector('#stop')?.addEventListener('click', () => m.arreter());
    btnOk.disabled = !m.resultat;
    if (!confirmeFaible) btnOk.innerHTML = `${icone('check')}Enregistrer ce repère`;
  }
  afficherGps();

  btnOk.onclick = async () => {
    err.textContent = '';
    const t = TYPES_REPERE[choix.type], r = m.resultat;
    const pk = lirePk($('#pk').value);
    if (Number.isNaN(pk) || pk > 9999) { err.textContent = 'PK invalide : écrivez par exemple 41 ou 41,400.'; return; }
    if (t.pk && pk == null) { err.textContent = 'Indiquez le PK écrit sur la borne.'; $('#pk').focus(); return; }
    if (!r) { err.textContent = 'Mesurez d’abord la position.'; return; }
    if (r.precision_m > PRECISION_FAIBLE && !confirmeFaible) {
      confirmeFaible = true;
      btnOk.textContent = `Précision faible (± ${Math.round(r.precision_m)} m) : appuyez encore pour enregistrer quand même`;
      return;
    }
    const donnees = { type: choix.type, nom: $('#nom').value.trim() || null, pk, lat: r.lat, lng: r.lng, precision_m: r.precision_m,
      nb_mesures: r.nb_mesures, cote: choix.cote, remarque: $('#rem').value.trim() || null };
    btnOk.disabled = true;
    try {
      const res = await envois.envoyerOuGarder({ type: 'repere', repereId: crypto.randomUUID(), donnees, fichiers: photo ? [photo] : [],
        resume: `${t.label}${pk != null ? ' · ' + formatPk(pk) : ''}${donnees.nom ? ' · ' + donnees.nom : ''}` });
      toast(res === 'envoye' ? 'Repère enregistré' : 'Repère gardé dans le téléphone : envoi au retour du réseau');
      ctx.aller('releve', { remplacer: true });
    } catch (e) { err.textContent = e.message; btnOk.disabled = false; }
  };

  $('#csv')?.addEventListener('click', () => telechargerCsv(tries));
  el.querySelectorAll('[data-rid]:not([disabled])').forEach((b) => (b.onclick = () => fiche(ctx, serveur.find((r) => r.id === b.dataset.rid))));

  const fin = $('#terminer');
  fin.onclick = async () => {
    if (!fin.dataset.confirme) {
      fin.dataset.confirme = '1';
      fin.textContent = attente.length ? `${attente.length} repère(s) pas encore envoyé(s) : appuyez encore pour terminer quand même` : 'Appuyez encore pour confirmer';
      return;
    }
    fin.disabled = true;
    try {
      await api.majParametre('voie_configuree', { termine: true, le: new Date().toISOString() });
      toast('Configuration de la voie terminée');
      ctx.aller('voie', { remplacer: true });
    } catch (e) { toast(e.message); fin.disabled = false; }
  };
}

// Détail d'un repère : photo, carte, correction, suppression.
function fiche(ctx, r) {
  if (!r) return;
  const t = TYPES_REPERE[r.type];
  const { el, fermer } = feuille(`${t?.label || 'Repère'}${r.pk != null ? ' · ' + formatPk(r.pk) : ''}`, `
    ${r.url ? `<img src="${esc(r.url)}" alt="Photo du repère" style="width:100%;border-radius:12px;max-height:260px;object-fit:cover">` : ''}
    <dl class="infos">
      ${r.nom ? `<dt>Nom ou numéro</dt><dd>${esc(r.nom)}</dd>` : ''}
      <dt>Position</dt><dd>${r.lat.toFixed(6)}, ${r.lng.toFixed(6)} · ± ${esc(String(r.precision_m ?? '?').replace('.', ','))} m${r.nb_mesures ? ` (${r.nb_mesures} mesures)` : ''}</dd>
      ${r.cote ? `<dt>Côté</dt><dd>${esc(COTES[r.cote])}</dd>` : ''}
      ${r.remarque ? `<dt>Remarque</dt><dd>${esc(r.remarque)}</dd>` : ''}
      <dt>Relevé</dt><dd>${esc(quand(r.created_at))} par ${esc(nomPersonne(r.auteur))}</dd>
    </dl>
    <a class="btn second plein" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}">${icone('pin', 20)}Voir sur la carte</a>
    <div class="btns"><button class="btn neutre" id="modifier">${icone('crayon', 20)}Corriger</button><button class="btn danger" id="suppr">Supprimer</button></div>
    <p class="erreur" id="err" role="alert"></p>`);
  const err = el.querySelector('#err');
  el.querySelector('#suppr').onclick = async (ev) => {
    const b = ev.currentTarget;
    if (!b.dataset.confirme) { b.dataset.confirme = '1'; b.textContent = 'Appuyez encore pour supprimer'; return; }
    b.disabled = true;
    try { await ctx.api.supprimerRepere(r.id); fermer(); toast('Repère supprimé'); ctx.aller('releve', { remplacer: true }); }
    catch (e) { err.textContent = e.message; b.disabled = false; }
  };
  el.querySelector('#modifier').onclick = () => { fermer(); corriger(ctx, r); };
}

function corriger(ctx, r) {
  const { el, fermer } = feuille('Corriger le repère', `
    <div class="champ"><label for="c-type">Type</label><select class="saisie" id="c-type">
      ${Object.entries(TYPES_REPERE).map(([k, t]) => `<option value="${k}" ${k === r.type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
    <div class="champ"><label for="c-pk">PK</label><input class="saisie" id="c-pk" inputmode="decimal" value="${r.pk != null ? esc(pkTxt(r.pk)) : ''}"></div>
    <div class="champ"><label for="c-nom">Nom ou numéro</label><input class="saisie" id="c-nom" maxlength="120" value="${esc(r.nom || '')}"></div>
    <div class="champ"><label for="c-cote">Côté</label><select class="saisie" id="c-cote">
      <option value="">Non précisé</option>${Object.entries(COTES).map(([k, l]) => `<option value="${k}" ${k === r.cote ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="champ"><label for="c-rem">Remarque</label><textarea class="saisie" id="c-rem" rows="2" maxlength="1000">${esc(r.remarque || '')}</textarea></div>
    <p class="aide" style="margin:0">La position ne se corrige pas : pour la refaire, supprimez le repère et relevez-le à nouveau.</p>
    <p class="erreur" id="err" role="alert"></p>
    <div class="btns"><button class="btn neutre" id="annuler">Annuler</button><button class="btn" id="ok">Enregistrer</button></div>`);
  const v = (s) => el.querySelector(s).value.trim();
  el.querySelector('#annuler').onclick = fermer;
  el.querySelector('#ok').onclick = async (ev) => {
    const type = v('#c-type'), pk = lirePk(v('#c-pk'));
    const err = el.querySelector('#err');
    if (Number.isNaN(pk) || pk > 9999) { err.textContent = 'PK invalide : écrivez par exemple 41 ou 41,400.'; return; }
    if (TYPES_REPERE[type].pk && pk == null) { err.textContent = 'Une borne doit avoir son PK.'; return; }
    ev.target.disabled = true;
    try {
      await ctx.api.majRepere(r.id, { type, pk, nom: v('#c-nom') || null, cote: v('#c-cote') || null, remarque: v('#c-rem') || null });
      fermer(); toast('Repère corrigé'); ctx.aller('releve', { remplacer: true });
    } catch (e) { err.textContent = e.message; ev.target.disabled = false; }
  };
}
