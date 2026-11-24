// Exports : rapport PDF à imprimer ou à joindre, et tableur pour analyser les chiffres.
import { esc, icone, GRAVITES, STATUTS, ELEMENTS, ETATS, CATEGORIES, toast } from '../ui.js';
import { tableauPdf } from '../pdf.js';

const PERIODES = {
  annee: { label: 'Cette année', debut: () => new Date(new Date().getFullYear(), 0, 1) },
  douze: { label: '12 derniers mois', debut: () => { const d = new Date(); d.setMonth(d.getMonth() - 12); return d; } },
  tout: { label: 'Depuis le début', debut: () => null },
};
const SUJETS = {
  pannes: { label: 'Pannes et interventions', aide: 'Tous les signalements, qui les a pris en charge et quand ils ont été réparés' },
  parc: { label: 'État du parc', aide: 'Chaque engin, son état du moment et ses problèmes en cours' },
};

const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
const jourHeure = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const nom = (p) => (p ? `${p.prenom || ''} ${p.nom || ''}`.trim() : '');
const ref = (p) => (p.annee && p.numero ? `${p.annee}-${String(p.numero).padStart(3, '0')}` : '');
const ou = (p) => (p.cible === 'voie'
  ? ['Voie', ELEMENTS[p.element] || null, p.pk != null ? `PK ${String(p.pk).replace('.', ',')}` : null].filter(Boolean).join(' · ')
  : (p.engin ? `${p.engin.designation}${p.engin.surnom ? ` « ${p.engin.surnom} »` : ''}` : 'Matériel'));

// Enregistre ou partage le fichier. Sur iPhone, la feuille de partage est le seul chemin fiable
// pour récupérer un fichier depuis une appli installée sur l'écran d'accueil.
async function livrer(blob, nomFichier) {
  try {
    const fichier = new File([blob], nomFichier, { type: blob.type });
    if (navigator.canShare?.({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: nomFichier });
      return true;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return true;   // partage annulé : ce n'est pas une erreur
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
  return true;
}

// Tableur : point-virgule et BOM, pour qu'Excel en français ouvre le fichier sans rien demander.
function csv(entetes, lignes) {
  const cellule = (v) => {
    const t = String(v ?? '');
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texte = [entetes, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n');
  return new Blob(['﻿' + texte], { type: 'text/csv;charset=utf-8' });
}

function donneesPannes(pannes, debut) {
  const retenues = pannes
    .filter((p) => !debut || new Date(p.created_at) >= debut)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const colonnes = [
    { titre: 'Réf.', largeur: 52, grasse: true, insecable: true },
    { titre: 'Signalée le', largeur: 58, insecable: true },
    { titre: 'Engin / lieu', largeur: 86 },
    { titre: 'Problème', largeur: 190 },
    { titre: 'Gravité', largeur: 60, insecable: true },
    { titre: 'Statut', largeur: 58, insecable: true },
    { titre: 'Signalée par', largeur: 72 },
    { titre: 'Prise par', largeur: 72 },
    { titre: 'Réparée le', largeur: 58, insecable: true },
  ];
  const ligne = (p) => [
    ref(p), jour(p.created_at), ou(p), p.titre || '',
    GRAVITES[p.gravite]?.label || p.gravite || '', STATUTS[p.statut]?.label || p.statut || '',
    nom(p.auteur), nom(p.technicien), jour(p.reparee_at),
  ];
  const resume = [
    { valeur: retenues.length, libelle: retenues.length > 1 ? 'signalements' : 'signalement' },
    { valeur: retenues.filter((p) => p.gravite === 'bloquante').length, libelle: 'bloquantes' },
    { valeur: retenues.filter((p) => p.statut !== 'reparee').length, libelle: 'encore ouvertes' },
    { valeur: retenues.filter((p) => p.statut === 'reparee').length, libelle: 'réparées' },
  ];
  return {
    colonnes, resume, lignes: retenues.map(ligne),
    // Le tableur reçoit en plus la description complète et les coordonnées.
    entetesCsv: ['Référence', 'Signalée le', 'Cible', 'Engin', 'Élément de voie', 'PK', 'Problème', 'Description',
      'Gravité', 'Statut', 'Signalée par', 'Prise en charge par', 'Réparée le', 'Latitude', 'Longitude'],
    lignesCsv: retenues.map((p) => [
      ref(p), jourHeure(p.created_at), p.cible === 'voie' ? 'Voie' : 'Matériel',
      p.engin ? `${p.engin.designation}${p.engin.surnom ? ` (${p.engin.surnom})` : ''}` : '',
      ELEMENTS[p.element] || '', p.pk != null ? String(p.pk).replace('.', ',') : '',
      p.titre || '', p.description || '',
      GRAVITES[p.gravite]?.label || '', STATUTS[p.statut]?.label || '',
      nom(p.auteur), nom(p.technicien), jourHeure(p.reparee_at),
      p.lat ?? '', p.lng ?? '',
    ]),
  };
}

function donneesParc(engins, pannes) {
  const ouvertes = (id) => pannes.filter((p) => p.engin_id === id && p.statut !== 'reparee');
  const colonnes = [
    { titre: 'Engin', largeur: 120, grasse: true },
    { titre: 'Catégorie', largeur: 80, insecable: true },
    { titre: 'État', largeur: 76, insecable: true },
    { titre: 'Problèmes', largeur: 58, insecable: true },
    { titre: 'Bloquants', largeur: 58, insecable: true },
    { titre: 'Détail', largeur: 260 },
  ];
  const ligne = (e) => {
    const o = ouvertes(e.id);
    return [
      `${e.designation}${e.surnom ? ` « ${e.surnom} »` : ''}`,
      CATEGORIES[e.categorie]?.label || e.categorie || '',
      ETATS[e.etat]?.label || e.etat || '',
      String(o.length), String(o.filter((p) => p.gravite === 'bloquante').length),
      o.map((p) => p.titre).join(' · '),
    ];
  };
  const resume = [
    { valeur: engins.length, libelle: 'engins' },
    { valeur: engins.filter((e) => e.etat === 'service').length, libelle: 'en service' },
    { valeur: engins.filter((e) => e.etat !== 'service').length, libelle: 'indisponibles' },
  ];
  return {
    colonnes, resume, lignes: engins.map(ligne),
    entetesCsv: ['Engin', 'Surnom', 'Catégorie', 'Constructeur', 'Année', 'État', 'Problèmes en cours', 'Dont bloquants', 'Détail'],
    lignesCsv: engins.map((e) => {
      const o = ouvertes(e.id);
      return [e.designation, e.surnom || '', CATEGORIES[e.categorie]?.label || '', e.constructeur || '', e.annee || '',
        ETATS[e.etat]?.label || '', o.length, o.filter((p) => p.gravite === 'bloquante').length,
        o.map((p) => p.titre).join(' · ')];
    }),
  };
}

export async function afficher(ctx) {
  const { api } = ctx;
  let periode = 'annee', sujet = 'pannes';

  const el = ctx.rendre(`
  <div class="barre"><a class="retour" href="#/profil" data-retour aria-label="Retour au profil">${icone('retour')}</a><h1>Exports</h1></div>
  <div class="page">
    <p class="aide">Un rapport PDF prêt à imprimer ou à joindre à un courriel, et un tableur pour trier et calculer.</p>

    <div class="champ"><span class="etiquette">1. Quoi exporter ?</span>
      ${Object.entries(SUJETS).map(([k, s]) => `<button type="button" class="choix gravite" data-sujet="${k}" aria-pressed="${k === sujet}">
        <span class="g"><b>${esc(s.label)}</b><small>${esc(s.aide)}</small></span></button>`).join('')}
    </div>

    <div class="champ" id="bloc-periode"><span class="etiquette">2. Sur quelle période ?</span>
      <div class="grille3" role="group" aria-label="Période">
        ${Object.entries(PERIODES).map(([k, p]) => `<button type="button" class="choix" data-periode="${k}" aria-pressed="${k === periode}">${esc(p.label)}</button>`).join('')}
      </div>
    </div>

    <div class="champ"><span class="etiquette">3. Dans quel format ?</span>
      <button type="button" class="btn plein" id="pdf">Rapport PDF</button>
      <button type="button" class="btn second plein" id="tableur" style="margin-top:8px">Tableur (CSV)</button>
      <p class="aide" id="etat" role="status"></p>
    </div>
  </div>`);
  if (!el) return;

  const etat = el.querySelector('#etat');
  const presser = (boutons, actif) => boutons.forEach((b) => b.setAttribute('aria-pressed', String(b === actif)));
  const boutonsSujet = [...el.querySelectorAll('[data-sujet]')];
  const boutonsPeriode = [...el.querySelectorAll('[data-periode]')];
  boutonsSujet.forEach((b) => b.onclick = () => {
    sujet = b.dataset.sujet; presser(boutonsSujet, b);
    el.querySelector('#bloc-periode').hidden = sujet === 'parc';
    etat.textContent = '';
  });
  boutonsPeriode.forEach((b) => b.onclick = () => { periode = b.dataset.periode; presser(boutonsPeriode, b); etat.textContent = ''; });

  async function preparer() {
    const debut = sujet === 'parc' ? null : PERIODES[periode].debut();
    const [pannes, engins] = await Promise.all([
      api.pannes({}),
      sujet === 'parc' ? api.engins() : Promise.resolve([]),
    ]);
    const d = sujet === 'parc' ? donneesParc(engins, pannes) : donneesPannes(pannes, debut);
    const periodeTexte = sujet === 'parc'
      ? `situation au ${jour(new Date())}`
      : (debut ? `du ${jour(debut)} au ${jour(new Date())}` : 'depuis le début');
    return { ...d, periodeTexte, debut };
  }

  const occupe = (occupeMaintenant) => {
    el.querySelector('#pdf').disabled = occupeMaintenant;
    el.querySelector('#tableur').disabled = occupeMaintenant;
  };

  el.querySelector('#pdf').onclick = async () => {
    occupe(true); etat.textContent = 'Préparation du rapport…';
    try {
      const d = await preparer();
      const blob = tableauPdf({
        titre: SUJETS[sujet].label,
        sousTitre: `Chemin de fer de la Vendée · ${d.periodeTexte} · édité le ${jour(new Date())}`,
        resume: d.resume, colonnes: d.colonnes, lignes: d.lignes, paysage: true,
        pied: 'CFV Atelier · Chemin de fer de la Vendée',
      });
      await livrer(blob, `CFV-${sujet === 'parc' ? 'parc' : 'pannes'}-${new Date().toISOString().slice(0, 10)}.pdf`);
      etat.textContent = `${d.lignes.length} ligne${d.lignes.length > 1 ? 's' : ''} dans le rapport.`;
    } catch (e) {
      etat.textContent = '';
      toast(e?.message || "L'export a échoué.");
    } finally { occupe(false); }
  };

  el.querySelector('#tableur').onclick = async () => {
    occupe(true); etat.textContent = 'Préparation du tableur…';
    try {
      const d = await preparer();
      const blob = csv(d.entetesCsv, d.lignesCsv);
      await livrer(blob, `CFV-${sujet === 'parc' ? 'parc' : 'pannes'}-${new Date().toISOString().slice(0, 10)}.csv`);
      etat.textContent = `${d.lignesCsv.length} ligne${d.lignesCsv.length > 1 ? 's' : ''} dans le tableur.`;
    } catch (e) {
      etat.textContent = '';
      toast(e?.message || "L'export a échoué.");
    } finally { occupe(false); }
  };
}
