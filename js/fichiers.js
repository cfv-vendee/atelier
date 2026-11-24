// Remise d'un fichier produit par l'appli (PDF, tableur) et fabrication du CSV.

// Sur iPhone, une appli lancée depuis l'écran d'accueil n'a pas de dossier de téléchargement :
// l'attribut « download » n'y aboutit à rien, la feuille de partage est le seul chemin fiable.
// Partout ailleurs — ordinateur, Android, Safari ou Chrome ordinaires — on télécharge directement,
// car proposer « envoyer / partager » à la place d'un téléchargement n'a pas de sens.
const estIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const estInstallee = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export const passeParLePartage = () => estIOS() && estInstallee();

function telecharger(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

export async function livrer(blob, nomFichier) {
  if (passeParLePartage()) {
    try {
      const fichier = new File([blob], nomFichier, { type: blob.type });
      if (navigator.canShare?.({ files: [fichier] })) {
        await navigator.share({ files: [fichier], title: nomFichier });
        return true;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return true;   // partage annulé : ce n'est pas une erreur
    }
  }
  telecharger(blob, nomFichier);
  return true;
}

// Tableur : point-virgule et BOM, pour qu'Excel en français ouvre le fichier sans rien demander.
export function csv(entetes, lignes) {
  const cellule = (v) => {
    const t = String(v ?? '');
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texte = [entetes, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n');
  return new Blob(['﻿' + texte], { type: 'text/csv;charset=utf-8' });
}
