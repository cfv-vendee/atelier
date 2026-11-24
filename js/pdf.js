// Génère un PDF sans aucune bibliothèque : le format est écrit directement.
// On utilise les polices de base du PDF (Helvetica), donc rien à embarquer dans l'appli, et
// l'encodage WinAnsi fait passer les accents français. Tout fonctionne hors connexion.

const A4 = { largeur: 595.28, hauteur: 841.89 };
const MARGE = 40;

// Largeurs des caractères (millièmes de cadratin), nécessaires pour couper les lignes au bon endroit.
const L_NORMALE = { ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584, '·': 333, '«': 556, '»': 556, '’': 191, '–': 556, '—': 1000, '…': 1000 };
const L_GRASSE = { ' ': 278, "'": 238, '(': 333, ')': 333, ',': 278, '-': 333, '.': 278, '/': 278, ':': 333, ';': 333, '?': 611, A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500, '·': 333, '«': 556, '»': 556, '’': 238, '–': 556, '—': 1000, '…': 1000 };
for (let c = 0; c <= 9; c++) { L_NORMALE[c] = 556; L_GRASSE[c] = 556; }
// Les lettres accentuées ont la largeur de leur lettre de base.
const BASE = { à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', î: 'i', ï: 'i', í: 'i', ô: 'o', ö: 'o', ó: 'o', õ: 'o', ù: 'u', û: 'u', ü: 'u', ú: 'u', ç: 'c', ñ: 'n', ÿ: 'y', À: 'A', Â: 'A', Ä: 'A', É: 'E', È: 'E', Ê: 'E', Ë: 'E', Î: 'I', Ï: 'I', Ô: 'O', Ö: 'O', Ù: 'U', Û: 'U', Ü: 'U', Ç: 'C', Ñ: 'N', œ: 'o', Œ: 'O', '°': 'o', '€': 'E' };

function largeur(texte, taille, grasse) {
  const table = grasse ? L_GRASSE : L_NORMALE;
  let t = 0;
  for (const c of String(texte)) t += table[c] ?? table[BASE[c]] ?? (grasse ? 611 : 556);
  return (t * taille) / 1000;
}

// Caractères au-delà de Latin-1 que WinAnsi code à sa façon.
const WINANSI = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };

// Transforme en chaîne d'octets WinAnsi, échappée pour une chaîne PDF entre parenthèses.
function chaine(texte) {
  let s = '';
  for (const c of String(texte ?? '')) {
    let code = WINANSI[c] ?? c.codePointAt(0);
    if (code > 255) code = 63; // « ? » pour ce que la police ne sait pas écrire
    const ch = String.fromCharCode(code);
    s += (ch === '(' || ch === ')' || ch === '\\') ? '\\' + ch : ch;
  }
  return s;
}

// Coupe un texte pour qu'il tienne dans une largeur donnée, en revenant à la ligne entre les mots.
export function couper(texte, large, taille, grasse) {
  const mots = String(texte ?? '').split(/\s+/).filter(Boolean);
  const lignes = [];
  let courante = '';
  for (const mot of mots) {
    const essai = courante ? courante + ' ' + mot : mot;
    if (largeur(essai, taille, grasse) <= large || !courante) courante = essai;
    else { lignes.push(courante); courante = mot; }
  }
  if (courante) lignes.push(courante);
  // Un mot seul plus large que la colonne : on le coupe au caractère.
  const sorties = [];
  for (const l of lignes) {
    if (largeur(l, taille, grasse) <= large) { sorties.push(l); continue; }
    let bout = '';
    for (const c of l) {
      if (largeur(bout + c, taille, grasse) > large && bout) { sorties.push(bout); bout = ''; }
      bout += c;
    }
    if (bout) sorties.push(bout);
  }
  return sorties.length ? sorties : [''];
}

// Réduit un texte à une seule ligne qui tient dans la largeur, avec des points de suspension.
export function tronquer(texte, large, taille, grasse) {
  const t = String(texte ?? '');
  if (largeur(t, taille, grasse) <= large) return t;
  let bout = '';
  for (const c of t) {
    if (largeur(bout + c + '…', taille, grasse) > large) break;
    bout += c;
  }
  return bout ? bout + '…' : '';
}

// ───── Construction du document ─────
class Page {
  constructor() { this.flux = []; }
  texte(x, y, t, { taille = 9, grasse = false, gris = null } = {}) {
    const police = grasse ? '/F2' : '/F1';
    const couleur = gris !== null ? `${gris} ${gris} ${gris} rg\n` : '0 0 0 rg\n';
    this.flux.push(`${couleur}BT ${police} ${taille} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${chaine(t)}) Tj ET`);
  }
  trait(x1, y1, x2, y2, { epaisseur = 0.5, gris = 0.8 } = {}) {
    this.flux.push(`${gris} ${gris} ${gris} RG ${epaisseur} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }
  pave(x, y, l, h, gris) {
    this.flux.push(`${gris} ${gris} ${gris} rg ${x.toFixed(2)} ${y.toFixed(2)} ${l.toFixed(2)} ${h.toFixed(2)} re f`);
  }
  contenu() { return this.flux.join('\n'); }
}

function assembler(pages, dim) {
  const objets = [];
  const ajouter = (corps) => { objets.push(corps); return objets.length; };
  const idPages = 2;
  ajouter(`<< /Type /Catalog /Pages ${idPages} 0 R >>`);
  ajouter('');                                   // réservé pour /Pages
  const f1 = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const idsPages = [];
  for (const p of pages) {
    const flux = p.contenu();
    const idFlux = ajouter(`<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`);
    idsPages.push(ajouter(`<< /Type /Page /Parent ${idPages} 0 R /MediaBox [0 0 ${dim.largeur.toFixed(2)} ${dim.hauteur.toFixed(2)}] `
      + `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${idFlux} 0 R >>`));
  }
  objets[idPages - 1] = `<< /Type /Pages /Count ${idsPages.length} /Kids [${idsPages.map((i) => `${i} 0 R`).join(' ')}] >>`;

  let fichier = '%PDF-1.4\n';
  const positions = [];
  objets.forEach((corps, i) => {
    positions.push(fichier.length);
    fichier += `${i + 1} 0 obj\n${corps}\nendobj\n`;
  });
  const xref = fichier.length;
  fichier += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const pos of positions) fichier += `${String(pos).padStart(10, '0')} 00000 n \n`;
  fichier += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const octets = new Uint8Array(fichier.length);
  for (let i = 0; i < fichier.length; i++) octets[i] = fichier.charCodeAt(i) & 0xff;
  return new Blob([octets], { type: 'application/pdf' });
}


// ───── Composeur : gère les pages, les ruptures et les pieds de page ─────
class Composeur {
  constructor({ paysage = false, pied = '' } = {}) {
    this.dim = paysage ? { largeur: A4.hauteur, hauteur: A4.largeur } : A4;
    this.utile = this.dim.largeur - 2 * MARGE;
    this.pied = pied;
    this.pages = [];
    this.nouvelle();
  }
  nouvelle() {
    this.page = new Page();
    this.pages.push(this.page);
    this.y = this.dim.hauteur - MARGE;
    if (this.surNouvellePage) this.surNouvellePage(this);
    return this.page;
  }
  place(hauteur) {                       // réserve la place demandée, en changeant de page si besoin
    if (this.y - hauteur < MARGE + 24) this.nouvelle();
    return this.y;
  }
  entete({ titre, sousTitre, resume = [] }) {
    this.page.texte(MARGE, this.y - 14, titre, { taille: 16, grasse: true });
    this.y -= 22;
    if (sousTitre) { this.page.texte(MARGE, this.y - 10, sousTitre, { taille: 9.5, gris: 0.35 }); this.y -= 18; }
    if (resume.length) {
      this.y -= 6;
      this.page.pave(MARGE, this.y - 26, this.utile, 26, 0.95);
      let x = MARGE + 10;
      for (const r of resume) {
        this.page.texte(x, this.y - 11, String(r.valeur), { taille: 11, grasse: true });
        this.page.texte(x + largeur(String(r.valeur), 11, true) + 5, this.y - 11, r.libelle, { taille: 8.5, gris: 0.4 });
        x += largeur(String(r.valeur), 11, true) + largeur(r.libelle, 8.5, false) + 22;
      }
      this.y -= 34;
    } else this.y -= 8;
  }
  sousSection(titre) {
    this.place(30);
    this.y -= 10;
    this.page.texte(MARGE, this.y - 10, titre, { taille: 11, grasse: true });
    this.y -= 15;
    this.page.trait(MARGE, this.y, this.dim.largeur - MARGE, this.y, { gris: 0.8, epaisseur: 0.8 });
    this.y -= 4;
  }
  // Liste « libellé : valeur » sur deux colonnes
  paires(paires) {
    const colonne = this.utile / 2 - 6;
    const libelle = colonne * 0.44;
    for (let i = 0; i < paires.length; i += 2) {
      const duo = paires.slice(i, i + 2);
      const hauteurs = duo.map(([l, v]) => Math.max(
        couper(l, libelle - 6, 9, false).length, couper(v, colonne - libelle - 6, 9, false).length));
      const h = Math.max(...hauteurs) * 12 + 6;
      this.place(h);
      duo.forEach(([l, v], n) => {
        const x = MARGE + n * (colonne + 12);
        couper(l, libelle - 6, 9, false).forEach((t, k) => this.page.texte(x, this.y - 10 - k * 12, t, { taille: 9, gris: 0.42 }));
        couper(v, colonne - libelle - 6, 9, false).forEach((t, k) => this.page.texte(x + libelle, this.y - 10 - k * 12, t, { taille: 9, grasse: true }));
      });
      this.y -= h;
      this.page.trait(MARGE, this.y, this.dim.largeur - MARGE, this.y, { gris: 0.9 });
    }
  }
  paragraphe(texte) {
    for (const t of couper(texte, this.utile, 9, false)) {
      this.place(13);
      this.page.texte(MARGE, this.y - 10, t, { taille: 9 });
      this.y -= 13;
    }
    this.y -= 4;
  }
  tableau({ colonnes, lignes, vide = 'Aucune donnée.' }) {
    const total = colonnes.reduce((s, c) => s + c.largeur, 0);
    const cols = colonnes.map((c) => ({ ...c, largeur: (c.largeur / total) * this.utile }));
    const enTete = () => {
      this.page.pave(MARGE, this.y - 15, this.utile, 15, 0.92);
      let x = MARGE + 5;
      for (const c of cols) { this.page.texte(x, this.y - 11, tronquer(c.titre, c.largeur - 8, 8, true), { taille: 8, grasse: true }); x += c.largeur; }
      this.y -= 15;
    };
    this.place(44); enTete();
    this.surNouvellePage = (c) => { c.y -= 6; enTete(); };
    const TAILLE = 8.5, INTER = 10.5;
    let paire = false;
    for (const ligne of lignes) {
      const cellules = cols.map((c, i) => (c.insecable
        ? [tronquer(ligne[i], c.largeur - 10, TAILLE, !!c.grasse)]
        : couper(ligne[i], c.largeur - 10, TAILLE, !!c.grasse)));
      const h = Math.max(...cellules.map((l) => l.length)) * INTER + 7;
      this.place(h);
      if (paire) this.page.pave(MARGE, this.y - h, this.utile, h, 0.975);
      let x = MARGE + 5;
      cellules.forEach((lignesCellule, i) => {
        lignesCellule.forEach((t, n) => this.page.texte(x, this.y - 12 - n * INTER, t, { taille: TAILLE, grasse: !!cols[i].grasse, gris: cols[i].gris ?? null }));
        x += cols[i].largeur;
      });
      this.y -= h;
      this.page.trait(MARGE, this.y, this.dim.largeur - MARGE, this.y, { gris: 0.87 });
      paire = !paire;
    }
    if (!lignes.length) { this.page.texte(MARGE + 5, this.y - 14, vide, { taille: 9, gris: 0.45 }); this.y -= 20; }
    this.surNouvellePage = null;
  }
  terminer() {
    this.pages.forEach((p, i) => {
      p.trait(MARGE, MARGE + 16, this.dim.largeur - MARGE, MARGE + 16, { gris: 0.85 });
      if (this.pied) p.texte(MARGE, MARGE + 5, this.pied, { taille: 7.5, gris: 0.5 });
      const num = `Page ${i + 1} sur ${this.pages.length}`;
      p.texte(this.dim.largeur - MARGE - largeur(num, 7.5, false), MARGE + 5, num, { taille: 7.5, gris: 0.5 });
    });
    return assembler(this.pages, this.dim);
  }
}

/**
 * Rapport : un titre, quelques chiffres clés, puis un tableau qui se poursuit page après page.
 * colonnes : [{ titre, largeur, grasse, insecable }]  —  lignes : tableau de tableaux de textes
 */
export function tableauPdf({ titre, sousTitre, resume = [], colonnes, lignes, pied = '', paysage = false }) {
  const c = new Composeur({ paysage, pied });
  c.entete({ titre, sousTitre, resume });
  c.tableau({ colonnes, lignes, vide: 'Aucune donnée sur cette période.' });
  return c.terminer();
}

/**
 * Fiche d'un engin : identité, caractéristiques, remarque, problèmes en cours et historique.
 * sections : [{ titre, paires }] ou [{ titre, colonnes, lignes, vide }] ou [{ titre, texte }]
 */
export function fichePdf({ titre, sousTitre, resume = [], sections = [], pied = '' }) {
  const c = new Composeur({ paysage: false, pied });
  c.entete({ titre, sousTitre, resume });
  for (const s of sections) {
    if (s.paires && !s.paires.length) continue;
    if (s.titre) c.sousSection(s.titre);
    if (s.paires) c.paires(s.paires);
    else if (s.texte) c.paragraphe(s.texte);
    else if (s.colonnes) c.tableau({ colonnes: s.colonnes, lignes: s.lignes || [], vide: s.vide || 'Aucun.' });
  }
  return c.terminer();
}
