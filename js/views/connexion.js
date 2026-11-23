import { esc, ROLES, toast } from '../ui.js';

export async function afficher(ctx, { erreurLien } = {}) {
  const { api } = ctx;
  if (api.demo) {
    const el = ctx.rendre(`<div class="connexion">
      <img class="logo" src="img/logo.png" alt="Logo du Chemin de fer de la Vendée">
      <h1>CFV Atelier</h1>
      <p class="sous">Pannes, réparations et entretien de la voie</p>
      <div class="demo">
        <b>Mode démonstration</b>
        <span class="aide">Choisissez un profil pour essayer l'appli. Les données restent dans ce navigateur.</span>
        ${api.profilsDemo.map((m) => `<button class="btn neutre plein" data-id="${m.id}" style="justify-content:space-between">
          <span>${esc(m.prenom)} ${esc(m.nom)}</span><span class="pastille ${m.est_admin ? 'admin' : ROLES[m.role].cls}">${m.est_admin ? 'Admin' : esc(ROLES[m.role].label) + (m.referent_voie ? ' · réf. voie' : '')}</span></button>`).join('')}
        <button class="lien" id="reinit">Remettre les données de démonstration à zéro</button>
      </div></div>`);
    if (!el) return;
    el.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => api.connexion(b.dataset.id)));
    el.querySelector('#reinit').onclick = () => { api.reinitialiser(); toast('Données de démonstration remises à zéro'); };
    return;
  }
  const el = ctx.rendre(`<form class="connexion" id="f" novalidate>
    <img class="logo" src="img/logo.png" alt="Logo du Chemin de fer de la Vendée">
    <h1>CFV Atelier</h1>
    <p class="sous">Espace réservé aux membres</p>
    ${erreurLien ? `<div class="bandeau" role="alert">Ce lien n'est plus valable. Demandez une nouvelle invitation ou utilisez « Mot de passe oublié ».</div>` : ''}
    <div class="champ"><label for="email">Adresse e-mail</label>
      <input class="saisie" id="email" type="email" autocomplete="username" required></div>
    <div class="champ"><label for="mdp">Mot de passe</label>
      <input class="saisie" id="mdp" type="password" autocomplete="current-password" required></div>
    <p class="erreur" id="err" role="alert"></p>
    <button class="btn plein" type="submit">Se connecter</button>
    <button class="lien" type="button" id="oubli">Mot de passe oublié ?</button>
  </form>`);
  if (!el) return;
  const f = el.querySelector('#f'), err = el.querySelector('#err');
  f.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    const bouton = f.querySelector('[type=submit]'); bouton.disabled = true;
    try { await api.connexion(f.email.value.trim(), f.mdp.value); }
    catch (x) { err.textContent = x.message; bouton.disabled = false; }
  };
  el.querySelector('#oubli').onclick = async () => {
    const email = f.email.value.trim();
    if (!email) { err.textContent = "Saisissez d'abord votre adresse e-mail."; f.email.focus(); return; }
    try { await api.motDePasseOublie(email); toast('Un e-mail vous a été envoyé pour choisir un nouveau mot de passe.'); }
    catch (x) { err.textContent = x.message; }
  };
}

export async function choisirMotDePasse(ctx, type, fini) {
  const el = ctx.rendre(`<form class="connexion" id="f" novalidate>
    <img class="logo" src="img/logo.png" alt="">
    <h1>${type === 'invite' ? 'Bienvenue !' : 'Nouveau mot de passe'}</h1>
    <p class="sous">${type === 'invite' ? `Bonjour ${esc(ctx.moi?.prenom || '')}, choisissez votre mot de passe pour accéder à l'appli.` : 'Choisissez votre nouveau mot de passe.'}</p>
    <div class="champ"><label for="m1">Mot de passe (8 caractères minimum)</label>
      <input class="saisie" id="m1" type="password" autocomplete="new-password" minlength="8" required></div>
    <div class="champ"><label for="m2">Confirmez le mot de passe</label>
      <input class="saisie" id="m2" type="password" autocomplete="new-password" required></div>
    <p class="erreur" id="err" role="alert"></p>
    <button class="btn plein" type="submit">Enregistrer</button>
  </form>`);
  if (!el) return;
  const f = el.querySelector('#f'), err = el.querySelector('#err');
  f.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    if (f.m1.value.length < 8) { err.textContent = 'Le mot de passe doit contenir au moins 8 caractères.'; return; }
    if (f.m1.value !== f.m2.value) { err.textContent = 'Les deux mots de passe sont différents.'; return; }
    try { await ctx.api.changerMotDePasse(f.m1.value); toast('Mot de passe enregistré'); fini(); }
    catch (x) { err.textContent = x.message; }
  };
}
