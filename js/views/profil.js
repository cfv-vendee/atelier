import { esc, icone, ROLES, feuille, toast } from '../ui.js';
import { lignePanne } from './accueil.js';

export async function afficher(ctx) {
  const { api, moi } = ctx;
  const mesPannes = await api.pannes({ auteurId: moi.id, limite: 5 });
  const initiales = ((moi.prenom?.[0] || '') + (moi.nom?.[0] || '')).toUpperCase() || '?';
  const el = ctx.rendre(`
  <div class="entete"><h1>Profil</h1></div>
  <div class="page" style="padding-top:8px">
    <div class="carte pad" style="display:flex;align-items:center;gap:14px">
      <div style="width:56px;height:56px;border-radius:28px;background:var(--vert);color:#fff;font-size:20px;font-weight:800;display:flex;align-items:center;justify-content:center;flex:none">${esc(initiales)}</div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px;min-width:0">
        <div style="font-size:18px;font-weight:800">${esc(moi.prenom)} ${esc(moi.nom)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pastille ${ROLES[moi.role].cls}">${esc(ROLES[moi.role].label)}</span>
          ${moi.referent_voie ? '<span class="pastille voie-ref">Référent voie</span>' : ''}${moi.est_admin ? '<span class="pastille admin">Administrateur</span>' : ''}</div>
      </div>
      <button class="retour" id="modifier" aria-label="Modifier mes informations">${icone('crayon', 20)}</button>
    </div>
    ${api.demo ? '<div class="bandeau">Mode démonstration : les données restent dans ce navigateur.</div>' : ''}
    ${moi.est_admin ? `<a class="btn grand" href="#/admin" style="justify-content:flex-start;padding:0 16px">${icone('bouclier', 22)}
      <span style="flex:1;text-align:left;display:flex;flex-direction:column"><span>Administration</span><small style="font-weight:500;opacity:.85;font-size:13px">Membres et droits</small></span>${icone('chevron', 20)}</a>` : ''}
    <h2 class="titre-section">Mes derniers signalements</h2>
    <div class="carte liste">${mesPannes.map(lignePanne).join('') || '<p class="vide">Vous n’avez encore rien signalé.</p>'}</div>
    <h2 class="titre-section">Notifications</h2>
    <div class="carte pad aide">Les alertes sur le téléphone (pannes bloquantes, suivi de vos signalements, son « tchou tchou ») arrivent dans la prochaine mise à jour.</div>
    ${api.demo ? '' : '<button class="btn neutre" id="mdp">Changer mon mot de passe</button>'}
    <button class="btn danger" id="sortir">Se déconnecter</button>
  </div>`);
  if (!el) return;
  el.querySelector('#sortir').onclick = async () => {
    const enAttente = await ctx.envois.lister().catch(() => []);
    if (!enAttente.length) return api.deconnexion();
    const { el: f, fermer } = feuille('Envois en attente', `
      <p style="margin:0">Vous avez <b>${enAttente.length} envoi${enAttente.length > 1 ? 's' : ''}</b> ${enAttente.length > 1 ? 'qui ne sont pas encore partis' : "qui n'est pas encore parti"} (pas de réseau).
      Si vous vous déconnectez maintenant, ${enAttente.length > 1 ? 'ils seront perdus' : 'il sera perdu'}.</p>
      <button class="btn plein" id="garder">Rester connecté</button>
      <button class="btn danger plein" id="perdre">Se déconnecter et les supprimer</button>`);
    f.querySelector('#garder').onclick = fermer;
    f.querySelector('#perdre').onclick = async () => {
      for (const it of enAttente) await ctx.envois.retirer(it.id);
      fermer(); api.deconnexion();
    };
  };
  el.querySelector('#mdp')?.addEventListener('click', () => {
    const { el: f, fermer } = feuille('Changer mon mot de passe', `
      <div class="champ"><label for="m1">Nouveau mot de passe (8 caractères minimum)</label><input class="saisie" id="m1" type="password" autocomplete="new-password"></div>
      <p class="erreur" id="err" role="alert"></p>
      <div class="btns"><button class="btn neutre" id="annuler">Annuler</button><button class="btn" id="ok">Enregistrer</button></div>`);
    f.querySelector('#annuler').onclick = fermer;
    f.querySelector('#ok').onclick = async () => {
      const v = f.querySelector('#m1').value;
      if (v.length < 8) { f.querySelector('#err').textContent = 'Au moins 8 caractères.'; return; }
      try { await api.changerMotDePasse(v); fermer(); toast('Mot de passe modifié'); } catch (x) { f.querySelector('#err').textContent = x.message; }
    };
  });
  el.querySelector('#modifier').onclick = () => {
    const { el: f, fermer } = feuille('Mes informations', `
      <div class="champ"><label for="p">Prénom</label><input class="saisie" id="p" value="${esc(moi.prenom)}" autocomplete="given-name"></div>
      <div class="champ"><label for="n">Nom</label><input class="saisie" id="n" value="${esc(moi.nom)}" autocomplete="family-name"></div>
      <div class="champ"><label for="t">Téléphone <span class="aide">(facultatif)</span></label><input class="saisie" id="t" type="tel" value="${esc(moi.telephone || '')}" autocomplete="tel"></div>
      <p class="erreur" id="err" role="alert"></p>
      <div class="btns"><button class="btn neutre" id="annuler">Annuler</button><button class="btn" id="ok">Enregistrer</button></div>`);
    f.querySelector('#annuler').onclick = fermer;
    f.querySelector('#ok').onclick = async () => {
      const prenom = f.querySelector('#p').value.trim(), nom = f.querySelector('#n').value.trim();
      if (!prenom || !nom) { f.querySelector('#err').textContent = 'Le prénom et le nom sont nécessaires.'; return; }
      try {
        await api.majMoi({ prenom, nom, telephone: f.querySelector('#t').value.trim() || null });
        await ctx.rafraichirMoi(); fermer(); toast('Enregistré'); ctx.aller('profil');
      } catch (x) { f.querySelector('#err').textContent = x.message; }
    };
  };
}
