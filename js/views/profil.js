import { esc, icone, ROLES, feuille, toast, avatar } from '../ui.js';
import { lignePanne } from './accueil.js';
import { recadrer } from '../recadrage.js';
import * as notifications from '../notifications.js';
import { VERSION } from '../version.js';

export async function afficher(ctx) {
  const { api, moi } = ctx;
  const mesPannes = await api.pannes({ auteurId: moi.id, limite: 5 });
  const el = ctx.rendre(`
  <div class="entete"><h1>Profil</h1></div>
  <div class="page" style="padding-top:8px">
    <div class="carte pad" style="display:flex;align-items:center;gap:14px">
      ${avatar(moi, 64).replace('class="avatar"', 'class="avatar fort"')}
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
    <div class="carte pad notifs" id="notifs"><p class="aide" style="margin:0">Chargement…</p></div>
    ${api.demo ? '' : '<button class="btn neutre" id="mdp">Changer mon mot de passe</button>'}
    <button class="btn danger" id="sortir">Se déconnecter</button>
    <div style="text-align:center;display:flex;flex-direction:column;gap:4px;align-items:center">
      <p style="color:var(--gris-clair);font-size:12px;margin:0">CFV Atelier · version ${VERSION}</p>
      <button class="lien" id="forcer-maj" style="font-size:12px">Forcer la mise à jour</button>
    </div>
  </div>`);
  if (!el) return;
  el.querySelector('#forcer-maj').onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = 'Mise à jour…';
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      await Promise.all(regs.map((r) => r.unregister()));
      const noms = await caches.keys();
      await Promise.all(noms.map((n) => caches.delete(n)));
    } catch {}
    location.reload();
  };
  el.querySelector('#sortir').onclick = async () => {
    const enAttente = await ctx.envois.lister().catch(() => []);
    if (!enAttente.length) { await notifications.oublierCeTelephone(api); return api.deconnexion(); }
    const { el: f, fermer } = feuille('Envois en attente', `
      <p style="margin:0">Vous avez <b>${enAttente.length} envoi${enAttente.length > 1 ? 's' : ''}</b> ${enAttente.length > 1 ? 'qui ne sont pas encore partis' : "qui n'est pas encore parti"} (pas de réseau).
      Si vous vous déconnectez maintenant, ${enAttente.length > 1 ? 'ils seront perdus' : 'il sera perdu'}.</p>
      <button class="btn plein" id="garder">Rester connecté</button>
      <button class="btn danger plein" id="perdre">Se déconnecter et les supprimer</button>`);
    f.querySelector('#garder').onclick = fermer;
    f.querySelector('#perdre').onclick = async () => {
      for (const it of enAttente) await ctx.envois.retirer(it.id);
      fermer(); await notifications.oublierCeTelephone(api); api.deconnexion();
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
      <div class="photo-profil"><span id="apercu-photo">${avatar(moi, 72)}</span>
        <div class="actions">
          <label class="btn second" for="photo" style="cursor:pointer">${icone('photo', 20)}${moi.photo_url ? 'Changer la photo' : 'Ajouter une photo'}</label>
          <input id="photo" class="sr" type="file" accept="image/*">
          <button type="button" class="btn neutre" id="recadrer" hidden>Recadrer</button>
          ${moi.photo_url ? '<button type="button" class="btn neutre" id="sans-photo">Retirer la photo</button>' : ''}
        </div></div>
      <div class="champ"><label for="p">Prénom</label><input class="saisie" id="p" value="${esc(moi.prenom)}" autocomplete="given-name"></div>
      <div class="champ"><label for="n">Nom</label><input class="saisie" id="n" value="${esc(moi.nom)}" autocomplete="family-name"></div>
      <div class="champ"><label for="t">Téléphone <span class="aide">(facultatif)</span></label><input class="saisie" id="t" type="tel" value="${esc(moi.telephone || '')}" autocomplete="tel"></div>
      <p class="erreur" id="err" role="alert"></p>
      <div class="btns"><button class="btn neutre" id="annuler">Annuler</button><button class="btn" id="ok">Enregistrer</button></div>`);
    f.querySelector('#annuler').onclick = fermer;
    let photo = null, original = null, retirer = false;
    const apercu = f.querySelector('#apercu-photo');
    // Chaque photo choisie passe par l'écran de recadrage (déplacer, zoomer dans le rond).
    const recadrerPhoto = async () => {
      let carre;
      try { carre = await recadrer(original); }
      catch { carre = original; }   // écran de recadrage indisponible : la photo sera centrée automatiquement
      if (!carre) return;
      photo = new File([carre], 'cfv-profil.jpg', { type: 'image/jpeg' }); retirer = false;
      apercu.innerHTML = avatar({ ...moi, photo_url: URL.createObjectURL(photo) }, 72);
      f.querySelector('#recadrer').hidden = false;
      const sans = f.querySelector('#sans-photo'); if (sans) sans.hidden = false;
    };
    f.querySelector('#photo').addEventListener('change', (e) => {
      const choisi = e.target.files[0]; e.target.value = '';
      if (choisi) { original = choisi; recadrerPhoto(); }
    });
    f.querySelector('#recadrer').addEventListener('click', recadrerPhoto);
    f.querySelector('#sans-photo')?.addEventListener('click', (e) => {
      photo = null; original = null; retirer = true; apercu.innerHTML = avatar({ ...moi, photo_url: null }, 72);
      e.currentTarget.hidden = true; f.querySelector('#recadrer').hidden = true;
    });
    f.querySelector('#ok').onclick = async (ev) => {
      const prenom = f.querySelector('#p').value.trim(), nom = f.querySelector('#n').value.trim();
      if (!prenom || !nom) { f.querySelector('#err').textContent = 'Le prénom et le nom sont nécessaires.'; return; }
      ev.target.disabled = true;
      try {
        if (photo) await api.changerPhoto(photo);
        else if (retirer) await api.retirerPhoto();
        await api.majMoi({ prenom, nom, telephone: f.querySelector('#t').value.trim() || null });
        await ctx.rafraichirMoi(); fermer(); toast('Enregistré'); ctx.aller('profil');
      } catch (x) { f.querySelector('#err').textContent = x.message; ev.target.disabled = false; }
    };
  };
  afficherNotifications(ctx, el.querySelector('#notifs'));
}

// ───── Notifications : activation sur ce téléphone et choix des alertes ─────
const PREFS = {
  bloquantes: { label: 'Pannes bloquantes', aide: 'Dès qu’une panne bloquante est signalée', pour: 'responsable' },
  signalements: { label: 'Nouveaux signalements', aide: 'Les autres gravités : à surveiller, mineure', pour: 'responsable' },
  suivi: { label: 'Suivi de mes signalements', aide: 'Quand ils sont pris en charge, puis réparés', pour: 'signale' },
};
async function afficherNotifications(ctx, boite) {
  const { api, moi } = ctx;
  const responsable = moi.est_admin || moi.referent_voie || ['conducteur_technicien', 'technicien'].includes(moi.role);
  const signale = moi.role !== 'bureau' || moi.est_admin;
  const visibles = Object.entries(PREFS).filter(([, p]) => (p.pour === 'responsable' ? responsable : signale));
  if (!visibles.length) { boite.innerHTML = '<p class="aide" style="margin:0">Le rôle Bureau ne reçoit pas d’alertes.</p>'; return; }
  const prefs = { bloquantes: true, signalements: true, suivi: true, ...(moi.notifications || {}) };
  const e = await notifications.etat();
  const domaines = moi.est_admin ? ['le matériel', 'la voie']
    : [['conducteur_technicien', 'technicien'].includes(moi.role) && 'le matériel', moi.referent_voie && 'la voie'].filter(Boolean);
  const qui = domaines.length ? `les nouveaux problèmes sur ${domaines.join(' et ')}` : null;
  const ETATS = {
    actif: `<p class="notif-etat ok">${icone('check', 18)} Activées sur ce téléphone</p>`,
    inactif: `<button class="btn plein" id="activer">Activer les notifications sur ce téléphone</button>`,
    refuse: `<p class="notif-etat">Les notifications sont bloquées pour l’appli. Autorisez-les dans les réglages du téléphone (Réglages → Notifications → CFV Atelier), puis revenez ici.</p>`,
    installer: `<p class="notif-etat">Sur iPhone, les notifications marchent seulement quand l’appli est <b>ajoutée à l’écran d’accueil</b> (iOS 16.4 ou plus) : dans Safari, <b>Partager → Sur l’écran d’accueil</b>, puis ouvrez l’appli depuis cette icône.</p>`,
    impossible: `<p class="notif-etat">Ce navigateur ne permet pas de recevoir des notifications.</p>`,
  };
  boite.innerHTML = `
    ${ETATS[e]}
    ${qui ? `<p class="aide" style="margin:0">Vous êtes prévenu pour ${qui}, et pour le suivi de vos propres signalements.</p>` : ''}
    <div class="interrupteurs">${visibles.map(([k, p]) => `
      <label class="interrupteur"><span><b>${p.label}</b><small>${p.aide}</small></span>
        <input type="checkbox" role="switch" data-pref="${k}" ${prefs[k] ? 'checked' : ''}><i aria-hidden="true"></i></label>`).join('')}</div>
    ${e === 'actif' ? `<div class="btns"><button class="btn second" id="essai">Envoyer un essai</button><button class="btn neutre" id="desactiver">Désactiver ici</button></div>` : ''}
    <p class="erreur" id="err-notif" role="alert"></p>`;
  const err = boite.querySelector('#err-notif');
  const recharger = () => afficherNotifications(ctx, boite);
  boite.querySelector('#activer')?.addEventListener('click', async (ev) => {
    ev.target.disabled = true; err.textContent = '';
    try { await notifications.activer(api); toast('Notifications activées'); recharger(); }
    catch (x) { err.textContent = x.message; ev.target.disabled = false; }
  });
  boite.querySelector('#desactiver')?.addEventListener('click', async () => {
    await notifications.desactiver(api); toast('Notifications désactivées sur ce téléphone'); recharger();
  });
  boite.querySelector('#essai')?.addEventListener('click', async (ev) => {
    ev.target.disabled = true; err.textContent = '';
    try {
      const r = await api.testerNotification();
      if (!r?.envoyes) err.textContent = 'Aucun téléphone n’a pu être prévenu. Désactivez puis réactivez les notifications.';
      else toast('Essai envoyé : la notification arrive dans quelques secondes');
    } catch (x) { err.textContent = x.message; }
    ev.target.disabled = false;
  });
  boite.querySelectorAll('[data-pref]').forEach((c) => c.addEventListener('change', async () => {
    const nouvelles = { ...prefs, [c.dataset.pref]: c.checked };
    try { await api.majNotifications(nouvelles); Object.assign(prefs, nouvelles); moi.notifications = nouvelles; await ctx.rafraichirMoi().catch(() => {}); }
    catch (x) { c.checked = !c.checked; err.textContent = x.message; }
  }));
}
