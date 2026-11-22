import { esc, icone, ROLES, feuille, toast } from '../ui.js';

const DROITS = [
  ['Tout consulter, exporter', [1, 1, 1, 1, 1]],
  ['Signaler, commenter', [0, 1, 1, 1, 1]],
  ['Intervenir, déclarer réparé', [0, 0, 1, 1, 1]],
  ['Gérer les membres', [0, 0, 0, 0, 1]],
];

export async function afficher(ctx) {
  const { api, moi } = ctx;
  const membres = await api.membres();
  const el = ctx.rendre(`
  <div class="barre"><a class="retour" href="#/profil" data-retour aria-label="Retour au profil">${icone('retour')}</a><h1>Administration</h1>
    <span class="pastille admin">Admin</span></div>
  <div class="page">
    <button class="btn" id="ajouter">${icone('plus', 20)}Ajouter un membre</button>
    <h2 class="titre-section">Membres (${membres.filter((m) => m.actif).length} actifs)</h2>
    <div class="carte liste">${membres.map((m) => `
      <button class="ligne" data-id="${m.id}" style="width:100%;background:none;border:0;border-bottom:1px solid #EEF0F2;text-align:left;cursor:pointer;${m.actif ? '' : 'opacity:.6'}">
        <span class="code green" style="border-radius:22px">${esc(((m.prenom?.[0] || '') + (m.nom?.[0] || '')).toUpperCase() || '?')}</span>
        <span class="txt"><span class="t">${esc(m.prenom)} ${esc(m.nom)}${m.id === moi.id ? ' (vous)' : ''}</span>
          <span style="display:flex;gap:6px;flex-wrap:wrap">${m.actif ? `<span class="pastille ${ROLES[m.role].cls}">${esc(ROLES[m.role].label)}</span>` : '<span class="pastille grey">Accès retiré</span>'}
          ${m.est_admin ? '<span class="pastille admin">Admin</span>' : ''}</span></span>
        ${icone('crayon', 20)}
      </button>`).join('')}</div>
    <div class="carte pad"><b>Qui peut faire quoi ?</b>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
        <thead><tr><th scope="col" style="text-align:left"></th>${['Bur.', 'Cond.', 'C + T', 'Tech.', 'Admin'].map((c) => `<th scope="col" style="color:var(--gris);padding:6px 1px">${c}</th>`).join('')}</tr></thead>
        <tbody>${DROITS.map(([l, v]) => `<tr style="border-top:1px solid #EEF0F2"><th scope="row" style="text-align:left;font-weight:500;padding:8px 0">${l}</th>
          ${v.map((x) => `<td style="text-align:center;font-weight:800;color:${x ? 'var(--ok)' : '#9AA1AB'}">${x ? '✓' : '—'}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
  </div>`);
  if (!el) return;

  el.querySelector('#ajouter').onclick = () => formulaire(ctx, null);
  el.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => formulaire(ctx, membres.find((m) => m.id === b.dataset.id))));
}

function formulaire(ctx, m) {
  const nouveau = !m;
  const { el, fermer } = feuille(nouveau ? 'Ajouter un membre' : `${m.prenom} ${m.nom}`, `
    <div class="btns"><div class="champ"><label for="p">Prénom</label><input class="saisie" id="p" value="${esc(m?.prenom || '')}"></div>
      <div class="champ"><label for="n">Nom</label><input class="saisie" id="n" value="${esc(m?.nom || '')}"></div></div>
    ${nouveau ? `<div class="champ"><label for="e">Adresse e-mail</label><input class="saisie" id="e" type="email" autocomplete="off">
      <span class="aide">Le membre recevra un e-mail pour choisir son mot de passe.</span></div>`
      : `<p class="aide" style="margin:0">${esc(m.email || '')}</p>`}
    <div class="champ"><label for="t">Téléphone <span class="aide">(facultatif)</span></label><input class="saisie" id="t" type="tel" value="${esc(m?.telephone || '')}"></div>
    <div class="champ"><label for="r">Rôle</label><select class="saisie" id="r">
      ${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${(m?.role || 'conducteur') === k ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
    <label style="display:flex;align-items:center;gap:10px;min-height:44px;font-weight:600"><input type="checkbox" id="a" ${m?.est_admin ? 'checked' : ''} style="width:22px;height:22px">
      Administrateur (gère les membres et les paramètres)</label>
    <p class="erreur" id="err" role="alert"></p>
    <div class="btns"><button class="btn neutre" id="annuler">Annuler</button><button class="btn" id="ok">${nouveau ? 'Envoyer l’invitation' : 'Enregistrer'}</button></div>
    ${!nouveau && m.id !== ctx.moi.id ? `<button class="btn ${m.actif ? 'danger' : 'second'} plein" id="acces">${m.actif ? 'Retirer l’accès' : 'Rétablir l’accès'}</button>
      ${m.actif ? '<p class="aide" style="margin:0">Ses signalements restent dans l’historique.</p>' : ''}` : ''}`);
  const err = el.querySelector('#err');
  el.querySelector('#annuler').onclick = fermer;
  el.querySelector('#ok').onclick = async (ev) => {
    const val = (id) => el.querySelector(id)?.value.trim();
    const champs = { prenom: val('#p'), nom: val('#n'), telephone: val('#t') || null, role: val('#r'), est_admin: el.querySelector('#a').checked };
    if (!champs.prenom || !champs.nom) { err.textContent = 'Le prénom et le nom sont nécessaires.'; return; }
    if (!nouveau && m.id === ctx.moi.id && !champs.est_admin) { err.textContent = 'Vous ne pouvez pas retirer vos propres droits d’administrateur.'; return; }
    ev.target.disabled = true;
    try {
      if (nouveau) { await ctx.api.gererCompte({ action: 'inviter', email: val('#e'), ...champs }); toast('Invitation envoyée'); }
      else { await ctx.api.majMembre(m.id, champs); toast('Enregistré'); if (m.id === ctx.moi.id) await ctx.rafraichirMoi(); }
      fermer(); ctx.aller('admin');
    } catch (x) { err.textContent = x.message; ev.target.disabled = false; }
  };
  el.querySelector('#acces')?.addEventListener('click', async () => {
    if (m.actif && !confirmerDansFeuille(el)) return;
    try { await ctx.api.gererCompte({ action: m.actif ? 'retirer' : 'retablir', id: m.id }); fermer(); toast(m.actif ? 'Accès retiré' : 'Accès rétabli'); ctx.aller('admin'); }
    catch (x) { err.textContent = x.message; }
  });
}

// Deuxième appui pour confirmer (pas de fenêtre système bloquante).
function confirmerDansFeuille(el) {
  const b = el.querySelector('#acces');
  if (b.dataset.confirme) return true;
  b.dataset.confirme = '1'; b.textContent = 'Appuyez encore pour confirmer';
  return false;
}
