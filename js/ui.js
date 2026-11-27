// Libellés, mise en forme et petits composants partagés.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ROLES = {
  bureau: { label: 'Bureau · lecture seule', cls: 'grey' },
  conducteur: { label: 'Conducteur', cls: 'blue' },
  conducteur_technicien: { label: 'Conducteur + technicien', cls: 'green' },
  technicien: { label: 'Technicien', cls: 'orange' },
};
export const GRAVITES = {
  bloquante: { label: 'Bloquante', aide: 'Interdit la circulation ou la mise en service', couleur: '#B42318', cls: 'red' },
  surveiller: { label: 'À surveiller', aide: 'On peut rouler, mais il faut intervenir', couleur: '#C26A00', cls: 'orange' },
  mineure: { label: 'Mineure', aide: 'Confort, esthétique, petit entretien', couleur: '#8A919C', cls: 'grey' },
};
export const STATUTS = {
  ouverte: { label: 'Ouverte', cls: 'red' },
  prise_en_charge: { label: 'Prise en charge', cls: 'orange' },
  en_cours: { label: 'En cours', cls: 'orange' },
  reparee: { label: 'Réparée', cls: 'green' },
};
export const ETATS = {
  service: { label: 'En service', cls: 'green' },
  surveiller: { label: 'À surveiller', cls: 'orange' },
  immobilise: { label: 'Immobilisé', cls: 'red' },
};
export const ELEMENTS = {
  pn: 'Passage à niveau', rail: 'Rail', eclisse: 'Éclisse', traverse: 'Traverse', ballast: 'Ballast',
  aiguillage: 'Aiguillage', ouvrage: 'Viaduc / pont', vegetation: 'Végétation', autre: 'Autre',
};
export const CATEGORIES = {
  vapeur: { label: 'Vapeur', code: 'VAP', groupe: 'vapeur' },
  diesel: { label: 'Diesel', code: 'DIE', groupe: 'diesel' },
  locotracteur: { label: 'Locotracteur', code: 'LOC', groupe: 'loco' },
  manoeuvre: { label: 'Manœuvre', code: 'MAN', groupe: 'loco' },
  autorail: { label: 'Autorail', code: 'AR', groupe: 'autorail' },
  draisine: { label: 'Draisine', code: 'DR', groupe: 'draisine' },
  voiture: { label: 'Voiture', code: 'VOI', groupe: 'voiture' },
};
export const EVENEMENTS = {
  declaration: { label: 'Panne déclarée', couleur: '#B42318' },
  commentaire: { label: 'Commentaire', couleur: '#8A919C' },
  prise_en_charge: { label: 'Prise en charge', couleur: '#C26A00' },
  intervention: { label: 'Intervention', couleur: '#C26A00' },
  reparee: { label: 'Réparée', couleur: '#146C43' },
  reouverte: { label: 'Rouverte', couleur: '#B42318' },
  gravite: { label: 'Gravité modifiée', couleur: '#5B6472' },
};

export const peutSignaler = (me) => !!me?.actif && (me.role !== 'bureau' || me.est_admin);
export const peutReparer = (me) => !!me?.actif && (['conducteur_technicien', 'technicien'].includes(me.role) || me.est_admin);
// Référent voie (droit en plus du rôle) ou administrateur : tournées, configuration de la voie, traitement des problèmes de voie.
export const peutInspecter = (me) => !!me?.actif && (!!me.referent_voie || !!me.est_admin);
// Ce qu'un membre peut faire sur une panne : 'tout' (traiter), 'commenter' ou rien.
export function droitsPanne(me, p) {
  if (p.cible === 'voie') return peutInspecter(me) ? 'tout' : null;
  return peutReparer(me) ? 'tout' : peutSignaler(me) ? 'commenter' : null;
}

// Gravité : techniciens et administrateurs sur tout, référents voie sur la voie ; jamais les conducteurs seuls ni le bureau.
export const peutChangerGravite = (me, p) => !!me?.actif && p.statut !== 'reparee'
  && (peutReparer(me) || (p.cible === 'voie' && peutInspecter(me)));

// Le technicien « intervenu » sur une panne : il l'a prise en charge ou y a ajouté une intervention
// (depuis la dernière réouverture, s'il y en a eu une).
export function aIntervenu(me, p) {
  if (!me) return false;
  const evts = [...(p.evenements || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  let debut = 0;
  evts.forEach((e, i) => { if (e.type === 'reouverte') debut = i + 1; });
  return p.pris_par === me.id
    || evts.slice(debut).some((e) => e.auteur_id === me.id && (e.type === 'prise_en_charge' || e.type === 'intervention'));
}

// Marquer réparée (= remettre la machine en service). Sur une panne BLOQUANTE de matériel : seulement le
// technicien intervenu, ou un administrateur. Même règle que la base de données (peut_agir_panne).
export const peutMarquerReparee = (me, p) => {
  if (droitsPanne(me, p) !== 'tout') return false;
  if (p.cible === 'voie' || p.gravite !== 'bloquante' || me.est_admin) return true;
  return aIntervenu(me, p);
};

export const numPanne = (p) => `${p.annee}-${String(p.numero).padStart(3, '0')}`;
export const nomEngin = (e) => (e ? `${e.designation}${e.surnom ? ` « ${e.surnom} »` : ''}` : '');
// Rôle d'une personne tel qu'on l'affiche à côté de son nom : « Technicien · référent voie ».
export const roleTexte = (p) => {
  if (!p) return '';
  const base = ROLES[p.role]?.label.split(' ·')[0] || '';
  return [base, p.referent_voie ? 'référent voie' : '', p.est_admin ? 'admin' : ''].filter(Boolean).join(' · ');
};
export const nomPersonne = (p) => (p ? `${p.prenom || ''} ${p.nom ? p.nom.charAt(0) + '.' : ''}`.trim() || 'Membre' : 'Ancien membre');
// Ligne Les Herbiers – Mortagne-sur-Sèvre : PK de SNCF Réseau (ceux de Carto Tchoo), du 47 au 68 environ.
// Une demi-borne de tolérance aux extrémités, pour les heurtoirs et les gares qui dépassent un peu.
export const LIGNE = { pkDebut: 47, pkFin: 68 };
export const pkDansLaLigne = (pk) => pk >= LIGNE.pkDebut - 0.5 && pk <= LIGNE.pkFin + 0.5;
export const messagePkHorsLigne = `Le PK doit être compris entre ${LIGNE.pkDebut} et ${LIGNE.pkFin}, par exemple 52,3.`;
export const formatPk = (pk) => (pk == null || pk === '' ? '' : `PK ${String(Number(pk).toFixed(3)).replace(/\.?0+$/, '').replace('.', ',')}`);
export const sujetPanne = (p) => (p.cible === 'materiel' ? nomEngin(p.engin) : `Voie · ${ELEMENTS[p.element] || ''}${p.pk != null ? ' · ' + formatPk(p.pk) : ''}`);

export function quand(date) {
  const d = new Date(date), now = new Date();
  const min = Math.round((now - d) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  const hier = new Date(now); hier.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return `il y a ${h} h`;
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hier.toDateString()) return `hier ${heure}`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) + ` ${heure}`;
}

const ICONES = {
  chaudiere: '<path d="M3 13a2 2 0 0 1 2-2h11l4 2v4H5a2 2 0 0 1-2-2z"/><path d="M7 11V7h3v4M16 11V5h3v6M6 20v.01M12 20v.01M18 20v.01"/>',
  accueil: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  oeil: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  'oeil-barre': '<path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3 3.9M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>',
  materiel: '<rect x="4" y="3" width="16" height="13" rx="3"/><path d="M4 10h16M8 20l-2 2M16 20l2 2M8 16v.01M16 16v.01"/>',
  voie: '<path d="M8 2 6 22M16 2l2 20M7.5 6h9M7 11h10M6.5 16h11"/>',
  profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  retour: '<path d="M15 18l-6-6 6-6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  photo: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  cible: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>',
  recherche: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  bouclier: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
  crayon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  envoi: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 7.97"/><path d="M12 12v9M9 15l3-3 3 3"/>',
  qr: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8h3v3H8zM13 13h3v3h-3zM13 8h3M8 16h3"/>',
};
export const icone = (nom, taille = 24, extra = '') =>
  `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${ICONES[nom]}</svg>`;

// Timbre de la chaudière (homologation) : date jusqu'à laquelle une locomotive à vapeur peut rouler, ensuite il faut la requalifier.
export const dateLongue = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
export function etatTimbre(iso) {
  if (!iso) return null;
  const auj = new Date(); auj.setHours(12, 0, 0, 0);
  const jours = Math.round((new Date(iso + 'T12:00:00') - auj) / 86400000);       // la date indiquée est le dernier jour de validité
  const date = dateLongue(iso);
  if (jours < 0) return { cls: 'red', court: 'Timbre expiré', titre: 'Timbre expiré', detail: `La chaudière n’est plus homologuée depuis le ${date}. Elle doit être requalifiée avant toute utilisation.`, jours };
  if (jours <= 90) return { cls: 'orange', court: jours === 0 ? 'Timbre : dernier jour' : `Timbre : ${jours} j`, titre: jours === 0 ? 'Timbre valable jusqu’à aujourd’hui' : `Timbre valable encore ${jours} jour${jours > 1 ? 's' : ''}`, detail: `Valable jusqu’au ${date}. Pensez à programmer la requalification de la chaudière.`, jours };
  return { cls: 'green', court: '', titre: `Timbre valable jusqu’au ${date}`, detail: '', jours };
}

export function pastille(def) {
  return `<span class="pastille ${def.cls}">${esc(def.label)}</span>`;
}

export function toast(message) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = message;
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

// Fenêtre en bas d'écran. Renvoie { el, fermer }.
export function feuille(titre, contenu, { focusChamp = true } = {}) {
  const voile = document.createElement('div');
  voile.className = 'voile';
  voile.innerHTML = `<div class="feuille" role="dialog" aria-modal="true" aria-label="${esc(titre)}"><h2>${esc(titre)}</h2>${contenu}</div>`;
  const fermer = () => { voile.remove(); document.removeEventListener('keydown', echap); window.removeEventListener('hashchange', fermer); };
  window.addEventListener('hashchange', fermer);
  const echap = (e) => { if (e.key === 'Escape') fermer(); };
  voile.addEventListener('click', (e) => { if (e.target === voile) fermer(); });
  document.addEventListener('keydown', echap);
  document.body.append(voile);
  // Sans focusChamp, on met le focus sur la fenêtre elle-même : la lecture d'écran suit, mais le
  // clavier du téléphone ne s'ouvre pas tout seul sur le premier champ de texte.
  const dialogue = voile.querySelector('.feuille');
  if (focusChamp) voile.querySelector('input, textarea, select, button')?.focus();
  else { dialogue.tabIndex = -1; dialogue.focus(); }
  return { el: voile.querySelector('.feuille'), fermer };
}

// Photo de profil ronde, avec les initiales dessous si l'image manque (sans réseau, lien expiré…).
export function avatar(p, taille = 44) {
  const ini = ((p?.prenom?.[0] || '') + (p?.nom?.[0] || '')).toUpperCase() || '?';
  return `<span class="avatar" style="width:${taille}px;height:${taille}px;font-size:${Math.round(taille * 0.36)}px" aria-hidden="true">${esc(ini)}${p?.photo_url
    ? `<img src="${esc(p.photo_url)}" alt="" onerror="this.remove()">` : ''}</span>`;
}
// Photo de profil : carré centré de 400 px, JPEG.
export async function photoCarree(fichier, cote = 400) {
  const bitmap = await createImageBitmap(fichier);
  const c = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(cote, c);
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - c) / 2, (bitmap.height - c) / 2, c, c, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Photo illisible.'))), 'image/jpeg', 0.85));
}

// Réduit une photo (1600 px max, JPEG) avant envoi : plus rapide, surtout sur la voie.
export async function compresser(fichier, max = 1600, qualite = 0.8) {
  try {
    const bitmap = await createImageBitmap(fichier);
    const r = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bitmap.width * r); c.height = Math.round(bitmap.height * r);
    c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob((b) => ok(b || fichier), 'image/jpeg', qualite));
  } catch {
    return fichier;
  }
}

// Sélecteur de photos avec aperçu. Renvoie une fonction qui donne les fichiers choisis.
export function brancherPhotos(conteneur) {
  const fichiers = [];
  const input = conteneur.querySelector('input[type=file]');
  const apercu = conteneur.querySelector('.photos');
  input.addEventListener('change', () => {
    for (const f of input.files) {
      fichiers.push(f);
      const img = document.createElement('img');
      img.alt = 'Photo jointe'; img.src = URL.createObjectURL(f);
      apercu.append(img);
    }
    input.value = '';
  });
  return () => fichiers;
}
export const champPhotos = (id) => `
  <div class="champ" data-photos>
    <label class="ajout-photo" for="${id}">${icone('photo', 20)}Ajouter des photos</label>
    <input id="${id}" class="sr" type="file" accept="image/*" multiple>
    <div class="photos"></div>
  </div>`;

// Ajoute un bouton « afficher / masquer » dans chaque champ de mot de passe d'un écran.
// Appelé après l'affichage ; sans effet si on le rappelle sur le même champ.
export function voirMotDePasse(racine) {
  for (const champ of racine.querySelectorAll('input[type="password"]')) {
    if (champ.dataset.oeil) continue;
    champ.dataset.oeil = '1';
    const boite = document.createElement('div');
    boite.className = 'champ-mdp';
    champ.parentNode.insertBefore(boite, champ);
    boite.appendChild(champ);

    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'oeil';
    const majBouton = () => {
      const visible = champ.type === 'text';
      bouton.innerHTML = icone(visible ? 'oeil-barre' : 'oeil', 21);
      bouton.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
      bouton.setAttribute('aria-pressed', String(visible));
    };
    bouton.onclick = () => {
      // On garde la position du curseur : changer le type la remet à la fin sur certains navigateurs.
      const debut = champ.selectionStart, fin = champ.selectionEnd;
      champ.type = champ.type === 'password' ? 'text' : 'password';
      majBouton();
      champ.focus();
      try { champ.setSelectionRange(debut, fin); } catch { /* champ qui ne le permet pas */ }
    };
    majBouton();
    boite.appendChild(bouton);
  }
}
