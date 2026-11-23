import { esc, icone, pastille, ETATS, CATEGORIES, nomEngin, peutSignaler, peutReparer, feuille, toast } from '../ui.js';
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
    ${moi.est_admin ? `<button class="btn neutre" id="modifier">${icone('crayon', 20)}Modifier la fiche (administrateur)</button>` : ''}
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
  el.querySelector('#modifier')?.addEventListener('click', () => formulaireEngin(ctx, e));
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

// Ajout ou modification d'un engin (administrateurs).
export function formulaireEngin(ctx, e = null) {
  const nouveau = !e;
  const ficheTexte = (e?.fiche?.length ? e.fiche : []).map(([k, v]) => `${k} : ${v}`).join('\n');
  const { el: f, fermer } = feuille(nouveau ? 'Ajouter un engin' : `Modifier · ${nomEngin(e)}`, `
    ${nouveau ? `<div class="champ"><label for="cat">Catégorie</label><select class="saisie" id="cat">
      ${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${esc(c.label)}</option>`).join('')}</select></div>` : ''}
    <div class="champ"><label for="des">Désignation (n° ou nom officiel)</label><input class="saisie" id="des" value="${esc(e?.designation || '')}"></div>
    <div class="btns"><div class="champ"><label for="sur">Surnom</label><input class="saisie" id="sur" value="${esc(e?.surnom || '')}"></div>
      <div class="champ"><label for="an">Année</label><input class="saisie" id="an" value="${esc(e?.annee || '')}"></div></div>
    <div class="champ"><label for="cons">Constructeur</label><input class="saisie" id="cons" value="${esc(e?.constructeur || '')}"></div>
    <div class="champ"><label for="notes">Remarque affichée sur la fiche <span class="aide">(facultatif)</span></label><textarea class="saisie" id="notes" style="min-height:64px">${esc(e?.notes || '')}</textarea></div>
    <div class="champ"><label for="fiche">Fiche technique <span class="aide">(une ligne par caractéristique, « Libellé : valeur »${e?.serie_nom ? ' ; vide = fiche de la série' : ''})</span></label>
      <textarea class="saisie" id="fiche" style="min-height:140px" placeholder="Longueur : 8,81 m">${esc(ficheTexte)}</textarea></div>
    ${nouveau ? '' : `<label style="display:flex;align-items:center;gap:10px;min-height:44px;font-weight:600"><input type="checkbox" id="retire" style="width:22px;height:22px">
      Retirer cet engin du parc (vendu, ferraillé…) : il disparaît des listes, son historique est gardé</label>`}
    <p class="erreur" id="err" role="alert"></p>
    <div class="btns"><button class="btn neutre" id="annuler">Annuler</button><button class="btn" id="ok">Enregistrer</button></div>`);
  f.querySelector('#annuler').onclick = fermer;
  f.querySelector('#ok').onclick = async (ev) => {
    const val = (id) => f.querySelector(id).value.trim();
    const designation = val('#des');
    if (!designation) { f.querySelector('#err').textContent = 'La désignation est nécessaire.'; return; }
    const fiche = val('#fiche').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf(':');
      return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, ''];
    });
    const champs = { designation, surnom: val('#sur') || null, annee: val('#an') || null, constructeur: val('#cons') || null, notes: val('#notes') || null, fiche };
    if (!nouveau && f.querySelector('#retire').checked) champs.actif = false;
    ev.target.disabled = true;
    try {
      if (nouveau) {
        const id = await ctx.api.ajouterEngin({ ...champs, categorie: val('#cat') });
        fermer(); toast('Engin ajouté'); ctx.aller('engin/' + id);
      } else {
        await ctx.api.majEngin(e.id, champs);
        fermer(); toast(champs.actif === false ? 'Engin retiré du parc' : 'Fiche mise à jour');
        ctx.aller(champs.actif === false ? 'materiel' : 'engin/' + e.id, { remplacer: champs.actif === false });
      }
    } catch (x) { f.querySelector('#err').textContent = x.message; ev.target.disabled = false; }
  };
}
