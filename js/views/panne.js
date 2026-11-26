import { esc, icone, pastille, GRAVITES, STATUTS, EVENEMENTS, ELEMENTS, quand, numPanne, nomEngin, nomPersonne, roleTexte, formatPk,
  droitsPanne, peutChangerGravite, peutMarquerReparee, feuille, toast, champPhotos, brancherPhotos } from '../ui.js';

const ACTIONS = {
  commentaire: { titre: 'Ajouter un commentaire', bouton: 'Ajouter', aide: 'Précisez, signalez une aggravation, ajoutez une photo…', requis: false },
  prise_en_charge: { titre: 'Prendre en charge', bouton: 'Je m’en occupe', aide: 'Un mot pour les autres (facultatif)', requis: false },
  intervention: { titre: 'Ajouter une intervention', bouton: 'Enregistrer', aide: 'Travaux réalisés, pièces utilisées ou à commander…', requis: true },
  reparee: { titre: 'Marquer réparée', bouton: 'Confirmer la réparation', aide: 'Ce qui a été fait pour réparer', requis: true },
  reouverte: { titre: 'Rouvrir la panne', bouton: 'Rouvrir', aide: 'Pourquoi le problème revient-il ?', requis: true },
};

export async function afficher(ctx) {
  const { api, moi, params } = ctx;
  const p = await api.panne(params[0]);
  const g = GRAVITES[p.gravite];
  const sujet = p.cible === 'materiel'
    ? `<a href="#/engin/${p.engin?.id}">${esc(nomEngin(p.engin))}</a>`
    : `Voie · ${esc(ELEMENTS[p.element])}${p.pk != null ? ' · ' + esc(formatPk(p.pk)) : ''}`;
  const carte = p.lat != null
    ? `<a class="btn neutre" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">${icone('pin', 20)}Itinéraire jusqu'au point (± ${Math.round(p.precision_m || 0)} m)</a>` : '';
  const photosDecl = p.photos.filter((x) => !x.evenement_id);
  const photosDe = (evId) => p.photos.filter((x) => x.evenement_id === evId);
  const grille = (l) => (l.length ? `<div class="photos">${l.map((x) => `<a href="${esc(x.url || '#')}" target="_blank" rel="noopener"><img src="${esc(x.url || '')}" alt="Photo jointe" loading="lazy"></a>`).join('')}</div>` : '');

  let actions = '';
  const droits = droitsPanne(moi, p);
  if (droits === 'tout') {
    actions = p.statut === 'reparee'
      ? `<button class="btn neutre plein" data-action="reouverte">Rouvrir ${p.cible === 'voie' ? 'le problème' : 'la panne'}</button>`
      : `${p.statut === 'ouverte' ? '<button class="btn second plein" data-action="prise_en_charge">Prendre en charge</button>' : ''}
         ${peutMarquerReparee(moi, p)
    ? `<div class="btns"><button class="btn second" data-action="intervention">Ajouter une intervention</button>
         <button class="btn" data-action="reparee">Marquer réparée</button></div>`
    : `<button class="btn second plein" data-action="intervention">Ajouter une intervention</button>
         <p class="aide" style="text-align:center;margin:0">Cette panne est bloquante : seul le technicien qui intervient dessus, ou un administrateur, peut la marquer réparée et remettre la machine en service. Prenez-la en charge ou ajoutez une intervention pour pouvoir le faire.</p>`}`;
    actions += `<button class="lien" data-action="commentaire" style="align-self:center">Ajouter un commentaire ou une photo</button>`;
  } else if (droits === 'commenter') {
    actions = `<button class="btn neutre plein" data-action="commentaire">Ajouter un commentaire ou une photo</button>
      <p class="aide" style="text-align:center;margin:0">Profil conducteur : la réparation est réservée aux techniciens.</p>`;
  } else if (p.cible === 'voie' && moi.role !== 'bureau') {
    actions = `<p class="aide" style="text-align:center;margin:0">Le traitement des problèmes de voie est réservé aux référents voie. Vous pouvez suivre son état ici.</p>`;
  } else {
    actions = `<p class="aide" style="text-align:center;margin:0">Profil Bureau : consultation uniquement.</p>`;
  }

  const el = ctx.rendre(`
  <div class="barre"><a class="retour" href="#/accueil" data-retour aria-label="Retour">${icone('retour')}</a>
    <span class="sous">Panne n° ${esc(numPanne(p))}</span></div>
  <div class="page">
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${pastille(g)}${pastille(STATUTS[p.statut])}
        ${peutChangerGravite(moi, p) ? '<button class="lien" id="gravite" style="min-height:44px;padding:0 4px">Modifier la gravité</button>' : ''}</div>
      <h1 style="margin:0;font-size:24px;font-weight:800;line-height:1.2">${esc(p.titre)}</h1>
      <div class="aide" style="font-size:15px">${sujet}</div>
      ${p.tournee_id ? `<a href="#/tournee/${esc(p.tournee_id)}" style="font-size:14px;font-weight:600">Constaté pendant une tournée d'inspection →</a>` : ''}
    </div>
    ${p.description || photosDecl.length ? `<div class="carte pad" style="display:flex;flex-direction:column;gap:10px">
      ${p.description ? `<p style="margin:0;white-space:pre-line">${esc(p.description)}</p>` : ''}${grille(photosDecl)}</div>` : ''}
    ${carte}
    <div><h2 class="titre-section" style="margin-bottom:10px">Historique</h2>
      ${p.evenements.map((ev) => `<div class="etape"><div class="rail"><i style="background:${EVENEMENTS[ev.type].couleur}"></i><span></span></div>
        <div class="corps"><b>${EVENEMENTS[ev.type].label}</b>
        <small>${esc(nomPersonne(ev.auteur))}${ev.auteur ? ' · ' + esc(roleTexte(ev.auteur)) : ''} · ${esc(quand(ev.created_at))}</small>
        ${ev.texte && ev.type !== 'declaration' ? `<p style="white-space:pre-line">${esc(ev.texte)}</p>` : ''}${grille(photosDe(ev.id))}</div></div>`).join('')}
    </div>
  </div>
  <div class="pied">${actions}${moi.est_admin ? '<button class="lien" id="supprimer" style="align-self:center;color:var(--rouge)">Supprimer cette panne</button>' : ''}</div>`);
  if (!el) return;
  // Photo non disponible (hors connexion, lien expiré) : on l'indique au lieu d'une image cassée.
  el.querySelectorAll('.photos img').forEach((img) => {
    const remplacer = () => { const a = img.closest('a'); a.outerHTML = '<span class="photo-absente">Photo visible avec le réseau</span>'; };
    if (!img.getAttribute('src')) remplacer(); else img.addEventListener('error', remplacer, { once: true });
  });
  el.querySelector('#supprimer')?.addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (!b.dataset.confirme) { b.dataset.confirme = '1'; b.textContent = 'Appuyez encore pour supprimer définitivement (photos comprises)'; return; }
    b.disabled = true;
    ctx.api.supprimerPanne(p.id).then(() => { toast('Panne supprimée'); ctx.aller('accueil', { remplacer: true }); })
      .catch((x) => { toast(x.message); b.disabled = false; });
  });

  el.querySelector('#gravite')?.addEventListener('click', () => ouvrirGravite(ctx, p));
  el.querySelectorAll('[data-action]').forEach((b) => (b.onclick = () => ouvrirAction(ctx, p, b.dataset.action)));
}

function ouvrirAction(ctx, p, type) {
  const a = ACTIONS[type];
  const { el, fermer } = feuille(a.titre, `
    <div class="champ"><label for="txt">${a.requis ? 'Détails' : 'Message'}${a.requis ? '' : ' <span class="aide">(facultatif)</span>'}</label>
      <textarea class="saisie" id="txt" placeholder="${esc(a.aide)}"></textarea></div>
    ${champPhotos('photos-action')}
    <p class="erreur" id="err" role="alert"></p>
    <div class="btns"><button class="btn neutre" id="annuler">Annuler</button><button class="btn" id="ok">${esc(a.bouton)}</button></div>`);
  const photos = brancherPhotos(el.querySelector('[data-photos]'));
  el.querySelector('#annuler').onclick = fermer;
  el.querySelector('#ok').onclick = async (e) => {
    const texte = el.querySelector('#txt').value.trim();
    if (a.requis && !texte) { el.querySelector('#err').textContent = 'Merci de préciser en quelques mots.'; return; }
    if (type === 'commentaire' && !texte && !photos().length) { el.querySelector('#err').textContent = 'Écrivez un message ou ajoutez une photo.'; return; }
    e.target.disabled = true;
    try {
      const resultat = await ctx.envois.envoyerOuGarder({ type: 'evenement', panneId: p.id, evId: crypto.randomUUID(), typeEv: type, texte, fichiers: photos(), resume: `${a.titre} · ${p.titre}` });
      fermer();
      toast(resultat === 'envoye' ? 'Enregistré' : 'Pas de réseau : gardé dans le téléphone, envoi automatique au retour du réseau.');
      ctx.aller('panne/' + p.id);
    } catch (x) { el.querySelector('#err').textContent = x.message; e.target.disabled = false; }
  };
}

// Corriger la gravité d'une panne (ex. une panne signalée « bloquante » qui n'est qu'« à surveiller »).
function ouvrirGravite(ctx, p) {
  let choix = null;
  const { el, fermer } = feuille('Modifier la gravité', `
    <p class="aide" style="margin:0">Actuellement : <b>${esc(GRAVITES[p.gravite].label)}</b>. Le changement est enregistré dans l'historique avec votre nom.</p>
    ${Object.entries(GRAVITES).filter(([k]) => k !== p.gravite).map(([k, g]) => `<button type="button" class="choix gravite" data-gravite="${k}">
      <span class="point" style="width:14px;height:14px;border-radius:7px;background:${g.couleur}"></span>
      <span class="g"><b>${g.label}</b><small>${g.aide}</small></span></button>`).join('')}
    <div class="champ"><label for="motif">Pourquoi ? <span class="aide">(facultatif)</span></label>
      <textarea class="saisie" id="motif" placeholder="Ex. vérifié sur place, on peut rouler"></textarea></div>
    <p class="erreur" id="err" role="alert"></p>
    <div class="btns"><button class="btn neutre" id="annuler">Annuler</button><button class="btn" id="ok" disabled>Enregistrer</button></div>`, { focusChamp: false });
  el.querySelector('#annuler').onclick = fermer;
  el.querySelectorAll('[data-gravite]').forEach((b) => (b.onclick = () => {
    choix = b.dataset.gravite;
    el.querySelectorAll('[data-gravite]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    el.querySelector('#ok').disabled = false;
  }));
  el.querySelector('#ok').onclick = async (e) => {
    if (!choix) return;
    e.target.disabled = true;
    try {
      await ctx.api.changerGravite(p.id, choix, el.querySelector('#motif').value);
      fermer();
      toast('Gravité modifiée');
      ctx.aller('panne/' + p.id);
    } catch (x) { el.querySelector('#err').textContent = x.message; e.target.disabled = false; }
  };
}
