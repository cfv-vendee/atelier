import { etatTimbre, dateLongue, esc, icone, pastille, ETATS, CATEGORIES, GRAVITES, STATUTS, nomEngin, peutSignaler, peutReparer, feuille, toast } from '../ui.js';
import { qrSvg } from '../qr.js';
import { lienEngin } from '../scanner.js';
import { lignePanne } from './accueil.js';
import { fichePdf } from '../pdf.js';
import { livrer, csv, passeParLePartage } from '../fichiers.js';

export async function afficher(ctx) {
  const { api, moi, params } = ctx;
  const [e, pannes] = await Promise.all([api.engin(params[0]), api.pannes({ enginId: params[0] })]);
  const ouvertes = pannes.filter((p) => p.statut !== 'reparee'), anciennes = pannes.filter((p) => p.statut === 'reparee');
  let onglet = ouvertes.length ? 'pannes' : 'fiche';

  const timbre = e.categorie === 'vapeur' ? etatTimbre(e.timbre_valide_jusqu) : null;
  const blocTimbre = e.categorie !== 'vapeur' ? ''
    : timbre ? `<div class="carte timbre timbre-${timbre.cls}"><b>${icone('chaudiere', 20)}${esc(timbre.titre)}</b>${timbre.detail ? `<span>${esc(timbre.detail)}</span>` : ''}<span class="aide">Timbre de la chaudière (homologation)</span></div>`
    : `<div class="carte timbre"><b>${icone('chaudiere', 20)}Timbre de la chaudière non renseigné</b>${moi.est_admin ? '<span class="aide">Indiquez la date de validité dans « Modifier la fiche ».</span>' : ''}</div>`;
  const el = ctx.rendre(`
  <div class="barre"><a class="retour" href="#/materiel" data-retour aria-label="Retour au parc">${icone('retour')}</a>
    <span class="sous">${esc(CATEGORIES[e.categorie].label)}</span></div>
  <div class="page">
    <div style="display:flex;flex-direction:column;gap:6px">
      <h1 style="margin:0;font-size:24px;font-weight:800">${esc(e.designation)}</h1>
      ${e.surnom ? `<div class="aide" style="font-size:15px">dit${e.categorie === 'vapeur' ? 'e' : ''} « ${esc(e.surnom)} »</div>` : ''}
      <div>${pastille(ETATS[e.etat])}</div>
    </div>
    ${peutSignaler(moi) ? `<a class="btn plein" href="#/signaler?engin=${e.id}">${icone('plus', 20)}Signaler</a>` : ''}
    <div class="btns">
      <button class="btn second" id="qr">${icone('qr', 20)}QR code</button>
      <button class="btn second" id="exporter">${icone('envoi', 20)}Exporter</button>
    </div>
    ${blocTimbre}
    ${e.notes ? `<div class="bandeau">${esc(e.notes)}</div>` : ''}
    ${moi.est_admin ? `<button class="btn neutre" id="modifier">${icone('crayon', 20)}Modifier la fiche</button>` : ''}
    <div class="segments" role="tablist" aria-label="Sections">
      <button role="tab" data-o="pannes">Pannes${ouvertes.length ? ` (${ouvertes.length})` : ''}</button>
      <button role="tab" data-o="fiche">Fiche technique</button>
    </div>
    <div id="contenu"></div>
  </div>`);
  if (!el) return;

  // ───── Exporter la fiche de cet engin : PDF à lire ou à imprimer, tableur pour trier ─────
  const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
  const jourHeure = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const nom = (p) => (p ? `${p.prenom || ''} ${p.nom || ''}`.trim() : '');
  const ref = (p) => (p.annee && p.numero ? `${p.annee}-${String(p.numero).padStart(3, '0')}` : '');
  const nomFichier = (ext) => `CFV-${(e.designation || 'engin').replace(/[^\w]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.${ext}`;

  function fabriquerPdf() {
    const colonnes = [
      { titre: 'Réf.', largeur: 54, grasse: true, insecable: true },
      { titre: 'Signalée le', largeur: 56, insecable: true },
      { titre: 'Problème', largeur: 178 },
      { titre: 'Gravité', largeur: 56, insecable: true },
      { titre: 'Statut', largeur: 56, insecable: true },
      { titre: 'Signalée par', largeur: 66 },
      { titre: 'Réparée le', largeur: 56, insecable: true },
    ];
    const ligne = (p) => [ref(p), jour(p.created_at), p.titre || '',
      GRAVITES[p.gravite]?.label || '', STATUTS[p.statut]?.label || '', nom(p.auteur), jour(p.reparee_at)];

    return fichePdf({
      titre: `${e.designation}${e.surnom ? ` « ${e.surnom} »` : ''}`,
      sousTitre: `Chemin de fer de la Vendée · ${ETATS[e.etat]?.label || ''}${e.categorie === 'vapeur' && e.timbre_valide_jusqu ? ` · timbre valable jusqu'au ${dateLongue(e.timbre_valide_jusqu)}` : ''} · édité le ${jour(new Date())}`,
      resume: [
        { valeur: ouvertes.length, libelle: ouvertes.length > 1 ? 'problèmes en cours' : 'problème en cours' },
        { valeur: ouvertes.filter((p) => p.gravite === 'bloquante').length, libelle: 'bloquants' },
        { valeur: anciennes.length, libelle: 'réparés à ce jour' },
      ],
      // Pas de description ni de fiche technique : on ne veut que le suivi.
      sections: [
        { titre: 'Problèmes en cours', colonnes, lignes: ouvertes.map(ligne), vide: 'Aucun problème en cours.' },
        { titre: 'Historique des réparations', colonnes, lignes: anciennes.map(ligne), vide: 'Aucune réparation enregistrée.' },
      ],
      pied: 'CFV Atelier · Chemin de fer de la Vendée',
    });
  }

  // Le tableur reprend l'identité de l'engin dans chaque ligne : on peut coller plusieurs
  // machines les unes sous les autres et trier l'ensemble.
  function fabriquerCsv() {
    const machine = `${e.designation || ''}${e.surnom ? ` (${e.surnom})` : ''}`;
    const entetes = ['Engin', 'Catégorie', 'État du jour', 'Référence', 'Signalée le', 'Problème', 'Description',
      'Gravité', 'Statut', 'Signalée par', 'Prise en charge par', 'Réparée le'];
    const lignes = [...ouvertes, ...anciennes].map((p) => [
      machine, CATEGORIES[e.categorie]?.label || '', ETATS[e.etat]?.label || '',
      ref(p), jourHeure(p.created_at), p.titre || '', p.description || '',
      GRAVITES[p.gravite]?.label || '', STATUTS[p.statut]?.label || '',
      nom(p.auteur), nom(p.technicien), jourHeure(p.reparee_at),
    ]);
    // Aucune panne : on fournit tout de même une ligne, pour que le fichier ne soit pas vide.
    if (!lignes.length) lignes.push([machine, CATEGORIES[e.categorie]?.label || '', ETATS[e.etat]?.label || '',
      '', '', 'Aucun problème enregistré', '', '', '', '', '', '']);
    return csv(entetes, lignes);
  }

  el.querySelector('#exporter').onclick = () => {
    const verbe = passeParLePartage() ? 'Partager' : 'Télécharger';
    const { el: f, fermer } = feuille('Exporter cette machine', `
      <p class="aide" style="margin:0">${verbe === 'Partager'
        ? 'Le fichier passe par la feuille de partage de l’iPhone : « Enregistrer dans Fichiers » pour le garder.'
        : 'Le fichier est enregistré directement dans vos téléchargements.'}</p>
      <button type="button" class="choix gravite" id="f-pdf">
        <span class="g"><b>Fiche PDF</b><small>Le suivi de la machine, prêt à lire ou à imprimer</small></span></button>
      <button type="button" class="choix gravite" id="f-csv">
        <span class="g"><b>Tableur (CSV)</b><small>Les problèmes de la machine, à trier dans Excel ou Numbers</small></span></button>
      <p class="erreur" id="f-err" role="alert"></p>
      <div class="btns"><button class="btn neutre" id="f-annuler">Annuler</button></div>`, { focusChamp: false });
    f.querySelector('#f-annuler').onclick = fermer;
    const lancer = async (bouton, fabriquer, ext) => {
      bouton.disabled = true;
      try {
        await livrer(fabriquer(), nomFichier(ext));
        fermer();
        toast(verbe === 'Partager' ? 'Fichier prêt à être partagé.' : 'Fichier téléchargé.');
      } catch (err) {
        f.querySelector('#f-err').textContent = err?.message || "Le fichier n'a pas pu être créé.";
        bouton.disabled = false;
      }
    };
    f.querySelector('#f-pdf').onclick = (ev) => lancer(ev.currentTarget, fabriquerPdf, 'pdf');
    f.querySelector('#f-csv').onclick = (ev) => lancer(ev.currentTarget, fabriquerCsv, 'csv');
  };

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
    <div class="champ" id="bloc-timbre" ${(e?.categorie || 'service') === 'vapeur' ? '' : 'hidden'}><label for="timbre">Timbre de la chaudière : valable jusqu'au <span class="aide">(date limite d'utilisation, puis requalification)</span></label>
      <input class="saisie" type="date" id="timbre" value="${esc(e?.timbre_valide_jusqu || '')}"></div>
    <div class="champ"><label for="cons">Constructeur</label><input class="saisie" id="cons" value="${esc(e?.constructeur || '')}"></div>
    <div class="champ"><label for="notes">Remarque affichée sur la fiche <span class="aide">(facultatif)</span></label><textarea class="saisie" id="notes" style="min-height:64px">${esc(e?.notes || '')}</textarea></div>
    <div class="champ"><label for="fiche">Fiche technique <span class="aide">(une ligne par caractéristique, « Libellé : valeur »${e?.serie_nom ? ' ; vide = fiche de la série' : ''})</span></label>
      <textarea class="saisie" id="fiche" style="min-height:140px" placeholder="Longueur : 8,81 m">${esc(ficheTexte)}</textarea></div>
    ${nouveau ? '' : `<label style="display:flex;align-items:center;gap:10px;min-height:44px;font-weight:600"><input type="checkbox" id="retire" style="width:22px;height:22px">
      Retirer cet engin du parc (vendu, ferraillé…) : il disparaît des listes, son historique est gardé</label>`}
    <p class="erreur" id="err" role="alert"></p>
    ${nouveau ? '' : '<button class="btn danger plein" id="supprimer">Supprimer définitivement</button>'}
    <div class="btns"><button class="btn neutre" id="annuler">Annuler</button><button class="btn" id="ok">Enregistrer</button></div>`,
    { focusChamp: false });
  f.querySelector('#cat')?.addEventListener('change', (ev) => { f.querySelector('#bloc-timbre').hidden = ev.target.value !== 'vapeur'; });
  f.querySelector('#annuler').onclick = fermer;
  f.querySelector('#supprimer')?.addEventListener('click', () => demanderSuppression(ctx, e, fermer));
  f.querySelector('#ok').onclick = async (ev) => {
    const val = (id) => f.querySelector(id).value.trim();
    const designation = val('#des');
    if (!designation) { f.querySelector('#err').textContent = 'La désignation est nécessaire.'; return; }
    const fiche = val('#fiche').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf(':');
      return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, ''];
    });
    const champs = { designation, surnom: val('#sur') || null, annee: val('#an') || null, constructeur: val('#cons') || null, notes: val('#notes') || null, fiche };
    if ((nouveau ? val('#cat') : e.categorie) === 'vapeur') champs.timbre_valide_jusqu = val('#timbre') || null;
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


// Suppression définitive d'un engin : on explique ce qui disparaît, puis on fait écrire SUPPRIMER.
function demanderSuppression(ctx, e, fermerFormulaire) {
  const { el: c, fermer } = feuille(`Supprimer ${nomEngin(e)} ?`, `
    <p class="aide" style="margin:0">Cette suppression est <strong>définitive</strong> : l'engin disparaît, ainsi que
      tous ses signalements et leurs photos. Pour garder l'historique, utilisez plutôt
      « Retirer cet engin du parc » dans la fiche.</p>
    <div class="champ"><label for="mot">Pour confirmer, écrivez <strong>SUPPRIMER</strong></label>
      <input class="saisie" id="mot" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="SUPPRIMER"></div>
    <p class="erreur" id="err2" role="alert"></p>
    <div class="btns"><button class="btn neutre" id="non">Annuler</button>
      <button class="btn danger" id="oui" disabled>Supprimer</button></div>`, { focusChamp: false });

  const mot = c.querySelector('#mot');
  const oui = c.querySelector('#oui');
  mot.addEventListener('input', () => { oui.disabled = mot.value.trim().toUpperCase() !== 'SUPPRIMER'; });
  c.querySelector('#non').onclick = fermer;
  oui.onclick = async (ev) => {
    if (mot.value.trim().toUpperCase() !== 'SUPPRIMER') return;
    ev.target.disabled = true;
    try {
      await ctx.api.supprimerEngin(e.id);
      fermer(); fermerFormulaire();
      toast('Engin supprimé');
      ctx.aller('materiel', { remplacer: true });
    } catch (x) {
      c.querySelector('#err2').textContent = x.message;
      ev.target.disabled = false;
    }
  };
}
