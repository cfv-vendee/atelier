import { esc, icone, ELEMENTS, GRAVITES, CATEGORIES, nomEngin, toast, champPhotos, brancherPhotos, peutSignaler } from '../ui.js';
import { scannerQR, idEnginDepuisQR } from '../scanner.js';

export async function afficher(ctx) {
  const { api, moi, query } = ctx;
  if (!peutSignaler(moi)) return ctx.aller('accueil');
  const engins = await api.engins();
  const etat = { cible: query.get('cible') === 'voie' ? 'voie' : 'materiel', element: null, gravite: null, gps: null };
  const enginInitial = query.get('engin');

  const groupes = {};
  for (const e of engins) (groupes[CATEGORIES[e.categorie].label] ??= []).push(e);

  const el = ctx.rendre(`
  <div class="barre"><a class="retour" href="#/accueil" data-retour aria-label="Retour">${icone('retour')}</a><h1>Signaler un problème</h1></div>
  <form id="f" novalidate>
  <div class="page">
    <div class="champ"><span class="etiquette">1. Sur quoi ?</span>
      <div class="segments" role="group" aria-label="Catégorie">
        <button type="button" data-cible="materiel">${icone('materiel', 20)}Matériel roulant</button>
        <button type="button" data-cible="voie">${icone('voie', 20)}Voie</button>
      </div></div>

    <div class="champ" data-bloc="materiel"><label for="engin">2. Quel engin ?</label>
      <select class="saisie" id="engin"><option value="">Choisir…</option>
        ${Object.entries(groupes).map(([g, l]) => `<optgroup label="${esc(g)}">${l.map((e) =>
          `<option value="${e.id}" ${e.id === enginInitial ? 'selected' : ''}>${esc(nomEngin(e))}</option>`).join('')}</optgroup>`).join('')}
      </select>
      <button type="button" class="btn second plein" id="scan-engin">${icone('qr', 20)}Scanner le QR code de l'engin</button></div>

    <div class="champ" data-bloc="voie"><span class="etiquette">2. Quel élément ?</span>
      <div class="grille3" role="group" aria-label="Élément de voie">
        ${Object.entries(ELEMENTS).map(([k, l]) => `<button type="button" class="choix" data-element="${k}">${esc(l)}</button>`).join('')}
      </div>
      <span class="etiquette" style="margin-top:8px">Où ?</span>
      <button type="button" class="btn second plein" id="gps">${icone('cible', 22)}Je suis sur place : enregistrer ma position</button>
      <p class="aide" id="gps-info" role="status"></p>
      <label class="saisie pk" for="pk"><span>PK</span><input id="pk" inputmode="decimal" placeholder="ex. 12,3" autocomplete="off"></label>
    </div>

    <div class="champ"><label for="titre">3. Le problème en quelques mots</label>
      <input class="saisie" id="titre" maxlength="80" placeholder="ex. Fuite injecteur gauche" required></div>

    <div class="champ"><span class="etiquette">4. Est-ce grave ?</span>
      ${Object.entries(GRAVITES).map(([k, g]) => `<button type="button" class="choix gravite" data-gravite="${k}">
        <span class="point" style="width:14px;height:14px;border-radius:7px;background:${g.couleur}"></span>
        <span class="g"><b>${g.label}</b><small>${g.aide}</small></span></button>`).join('')}
    </div>

    <div class="champ"><label for="desc">5. Que se passe-t-il ? <span class="aide">(facultatif)</span></label>
      <textarea class="saisie" id="desc" placeholder="Décrivez ce que vous avez constaté…"></textarea></div>
    ${champPhotos('photos-signal')}
    <p class="erreur" id="err" role="alert"></p>
  </div>
  <div class="pied"><button class="btn plein" type="submit" id="envoyer">Envoyer le signalement</button></div>
  </form>`);
  if (!el) return;

  const f = el.querySelector('#f'), err = el.querySelector('#err');
  const photos = brancherPhotos(el.querySelector('[data-photos]'));
  const majAffichage = () => {
    el.querySelectorAll('[data-cible]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.cible === etat.cible));
    el.querySelector('[data-bloc=materiel]').hidden = etat.cible !== 'materiel';
    el.querySelector('[data-bloc=voie]').hidden = etat.cible !== 'voie';
    el.querySelectorAll('[data-element]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.element === etat.element));
    el.querySelectorAll('[data-gravite]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.gravite === etat.gravite));
  };
  el.querySelectorAll('[data-cible]').forEach((b) => (b.onclick = () => { etat.cible = b.dataset.cible; majAffichage(); }));
  el.querySelectorAll('[data-element]').forEach((b) => (b.onclick = () => { etat.element = b.dataset.element; majAffichage(); }));
  el.querySelectorAll('[data-gravite]').forEach((b) => (b.onclick = () => { etat.gravite = b.dataset.gravite; majAffichage(); }));
  majAffichage();

  el.querySelector('#scan-engin').onclick = async () => {
    const texte = await scannerQR();
    if (!texte) return;
    const id = idEnginDepuisQR(texte);
    if (id && engins.some((e) => e.id === id)) { f.engin.value = id; toast('Engin reconnu : ' + nomEngin(engins.find((e) => e.id === id))); }
    else toast("Ce QR code n'est pas une étiquette d'engin du CFV.");
  };
  const info = el.querySelector('#gps-info');
  el.querySelector('#gps').onclick = () => {
    if (!navigator.geolocation) { info.textContent = 'Ce téléphone ne permet pas la localisation.'; return; }
    info.textContent = 'Recherche de la position…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        etat.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision_m: Math.round(pos.coords.accuracy) };
        info.innerHTML = `${icone('check', 16)} Position enregistrée (précision ± ${etat.gps.precision_m} m). Le calcul automatique du PK arrivera avec le plan de la voie : indiquez-le si vous le connaissez.`;
      },
      (e) => { info.textContent = e.code === 1 ? 'Localisation refusée : autorisez-la dans les réglages du téléphone.' : 'Position introuvable. Réessayez à découvert, ou indiquez le PK.'; },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  f.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    const titre = f.titre.value.trim();
    const donnees = { cible: etat.cible, titre, description: f.desc.value.trim() || null, gravite: etat.gravite };
    if (etat.cible === 'materiel') {
      if (!f.engin.value) return (err.textContent = "Choisissez l'engin concerné.");
      donnees.engin_id = f.engin.value;
    } else {
      if (!etat.element) return (err.textContent = "Choisissez l'élément de voie concerné.");
      donnees.element = etat.element;
      const pk = f.pk.value.trim().replace(',', '.');
      if (pk) {
        if (!/^\d{1,2}(\.\d{1,3})?$/.test(pk) || Number(pk) > 30) return (err.textContent = 'Le PK doit être un nombre, par exemple 12,3.');
        donnees.pk = Number(pk);
      }
      if (etat.gps) Object.assign(donnees, etat.gps);
      if (!pk && !etat.gps) return (err.textContent = 'Indiquez le PK ou enregistrez votre position.');
    }
    if (!titre) return (err.textContent = 'Décrivez le problème en quelques mots.');
    if (!etat.gravite) return (err.textContent = 'Indiquez si le problème est grave.');
    const bouton = el.querySelector('#envoyer');
    bouton.disabled = true; bouton.textContent = 'Envoi…';
    try {
      const id = await api.signaler(donnees, photos());
      toast('Signalement envoyé, merci !');
      ctx.aller('panne/' + id);
    } catch (x) {
      err.textContent = x.message; bouton.disabled = false; bouton.textContent = 'Envoyer le signalement';
    }
  };
}
