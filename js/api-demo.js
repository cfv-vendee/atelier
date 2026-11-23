// Mode démonstration : mêmes fonctions que l'accès réel, données gardées dans ce navigateur.
// Sert aux essais et à la présentation, tant que la base n'est pas branchée.
import { PARC } from '../data/parc.js';

const CLE = 'cfv-atelier-demo-v1';
const MEMBRES = [
  { id: 'm-admin', prenom: 'Benjamin', nom: 'Duchesne', email: 'president@exemple.fr', role: 'conducteur_technicien', est_admin: true, actif: true },
  { id: 'm-ct', prenom: 'Malo', nom: 'Degois', email: 'malo@exemple.fr', role: 'conducteur_technicien', est_admin: false, actif: true },
  { id: 'm-tech', prenom: 'Bernard', nom: 'L.', email: 'tech@exemple.fr', role: 'technicien', est_admin: false, actif: true },
  { id: 'm-cond', prenom: 'Sophie', nom: 'M.', email: 'cond@exemple.fr', role: 'conducteur', est_admin: false, actif: true },
  { id: 'm-bur', prenom: 'Claire', nom: 'T.', email: 'bureau@exemple.fr', role: 'bureau', est_admin: false, actif: true },
];
export const PROFILS_DEMO = MEMBRES;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const ilya = (h) => new Date(Date.now() - h * 3600e3).toISOString();

function donneesInitiales() {
  const series = Object.entries(PARC.series).map(([code, s]) => ({ id: 's-' + code, code, ...s }));
  const engins = PARC.engins.map((e, i) => ({
    id: 'e-' + (i + 1), categorie: e.cat, designation: e.des, surnom: e.sur || null, constructeur: e.cons || null,
    annee: e.an || null, serie_id: e.serie ? 's-' + e.serie : null, fiche: e.fiche || [], notes: e.notes || null,
    photo: null, ordre: e.ordre, actif: true,
  }));
  const id = (des) => engins.find((e) => e.designation === des).id;
  const d = { membres: MEMBRES.map((m) => ({ ...m, telephone: null })), series, engins, pannes: [], evenements: [], photos: [], session: null };
  const panne = (p, evts) => {
    const pid = uid();
    d.pannes.push({ id: pid, annee: 2026, numero: d.pannes.length + 1, engin_id: null, element: null, pk: null, lat: null, lng: null,
      precision_m: null, statut: 'ouverte', pris_par: null, reparee_at: null, updated_at: p.created_at, ...p });
    d.evenements.push({ id: uid(), panne_id: pid, auteur_id: p.auteur_id, type: 'declaration', texte: p.description, created_at: p.created_at });
    for (const e of evts || []) ajouterEvt(d, pid, e.auteur, e.type, e.texte, e.date);
  };
  panne({ cible: 'materiel', engin_id: id('X 3800'), titre: 'Éclairage cabine', description: 'Plafonnier cabine côté 1 éteint.', gravite: 'mineure', auteur_id: 'm-cond', created_at: ilya(240) },
    [{ auteur: 'm-tech', type: 'reparee', texte: 'Ampoule remplacée.', date: ilya(200) }]);
  panne({ cible: 'voie', element: 'pn', pk: 1.2, titre: 'Barrière de PN lente à descendre', description: 'La barrière met plusieurs secondes de plus que d’habitude.', gravite: 'surveiller', auteur_id: 'm-cond', created_at: ilya(170) });
  panne({ cible: 'materiel', engin_id: id('Fourgon B3Dt'), titre: 'Porte de compartiment bloquée', description: 'La porte du 2e compartiment ne coulisse plus.', gravite: 'surveiller', auteur_id: 'm-ct', created_at: ilya(96) });
  panne({ cible: 'materiel', engin_id: id('030 T 6'), titre: 'Fuite injecteur gauche', description: 'Fuite importante au raccord de l’injecteur gauche en montée en pression. Machine rentrée au dépôt.', gravite: 'bloquante', auteur_id: 'm-ct', created_at: ilya(26) },
    [{ auteur: 'm-tech', type: 'prise_en_charge', texte: 'Je m’en occupe.', date: ilya(23) },
     { auteur: 'm-tech', type: 'intervention', texte: 'Raccord démonté, joint cuivre écrasé.\nJoint neuf commandé, remontage prévu samedi.', date: ilya(5) }]);
  panne({ cible: 'voie', element: 'ballast', pk: 12.3, titre: 'Ballast affaissé après orage', description: 'Affaissement sur une dizaine de mètres côté gauche.', gravite: 'bloquante', auteur_id: 'm-tech', created_at: ilya(2) });
  return d;
}

function ajouterEvt(d, panneId, auteurId, type, texte, date) {
  date = date || new Date().toISOString();
  const ev = { id: uid(), panne_id: panneId, auteur_id: auteurId, type, texte: texte || null, created_at: date };
  d.evenements.push(ev);
  const p = d.pannes.find((x) => x.id === panneId);
  if (type === 'prise_en_charge' && p.statut === 'ouverte') Object.assign(p, { statut: 'prise_en_charge', pris_par: auteurId });
  if (type === 'intervention' && p.statut !== 'reparee') Object.assign(p, { statut: 'en_cours', pris_par: p.pris_par || auteurId });
  if (type === 'reparee') Object.assign(p, { statut: 'reparee', reparee_at: date });
  if (type === 'reouverte') Object.assign(p, { statut: 'ouverte', reparee_at: null, pris_par: null });
  p.updated_at = date;
  return ev;
}

const lireFichier = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });

export function creerApi() {
  let d;
  try { d = JSON.parse(localStorage.getItem(CLE)) || donneesInitiales(); } catch { d = donneesInitiales(); }
  const sauver = () => { try { localStorage.setItem(CLE, JSON.stringify(d)); } catch { /* stockage plein : on garde en mémoire */ } };
  let ecouteur = () => {};
  const moi = () => d.membres.find((m) => m.id === d.session);
  const exiger = (ok) => { if (!ok) throw new Error("Vous n'avez pas les droits pour faire cela."); };
  const peutSignaler = (m) => m?.actif && (m.role !== 'bureau' || m.est_admin);
  const peutReparer = (m) => m?.actif && (['conducteur_technicien', 'technicien'].includes(m.role) || m.est_admin);
  const personne = (id) => { const m = d.membres.find((x) => x.id === id); return m ? { prenom: m.prenom, nom: m.nom, role: m.role } : null; };
  const enrichir = (p) => {
    const e = d.engins.find((x) => x.id === p.engin_id);
    return { ...p, engin: e ? { id: e.id, designation: e.designation, surnom: e.surnom } : null, auteur: personne(p.auteur_id), technicien: personne(p.pris_par) };
  };
  const etatEngin = (e) => {
    const s = d.series.find((x) => x.id === e.serie_id);
    const ouvertes = d.pannes.filter((p) => p.engin_id === e.id && p.statut !== 'reparee');
    const etat = ouvertes.some((p) => p.gravite === 'bloquante') ? 'immobilise' : ouvertes.some((p) => p.gravite !== 'mineure') ? 'surveiller' : 'service';
    return { ...e, serie_nom: s?.nom || null, fiche_complete: e.fiche.length ? e.fiche : s?.fiche || [], pannes_ouvertes: ouvertes.length, etat };
  };
  const pause = () => new Promise((r) => setTimeout(r, 120));

  return {
    demo: true,
    profilsDemo: MEMBRES,
    async session() { return d.session ? { user: { id: d.session } } : null; },
    surAuth(cb) { ecouteur = cb; },
    async connexion(idDemo) { d.session = idDemo; sauver(); ecouteur('SIGNED_IN'); },
    async deconnexion() { d.session = null; sauver(); ecouteur('SIGNED_OUT'); },
    async motDePasseOublie() {},
    async changerMotDePasse() {},
    reinitialiser() { try { localStorage.removeItem(CLE); } catch { /* stockage indisponible */ } d = donneesInitiales(); },

    async moi() { return moi() ? { ...moi() } : null; },
    async majMoi(champs) { Object.assign(moi(), { prenom: champs.prenom, nom: champs.nom, telephone: champs.telephone }); sauver(); },

    async engins() { await pause(); return d.engins.filter((e) => e.actif).sort((a, b) => a.ordre - b.ordre).map(etatEngin); },
    async engin(id) { const e = d.engins.find((x) => x.id === id); if (!e) throw new Error('Engin introuvable.'); return etatEngin(e); },

    async pannes({ ouvertes, enginId, cible, auteurId, limite } = {}) {
      await pause();
      let l = [...d.pannes].sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (ouvertes) l = l.filter((p) => p.statut !== 'reparee');
      if (enginId) l = l.filter((p) => p.engin_id === enginId);
      if (cible) l = l.filter((p) => p.cible === cible);
      if (auteurId) l = l.filter((p) => p.auteur_id === auteurId);
      if (limite) l = l.slice(0, limite);
      return l.map(enrichir);
    },
    async panne(id) {
      await pause();
      const p = d.pannes.find((x) => x.id === id);
      if (!p) throw new Error('Panne introuvable.');
      return {
        ...enrichir(p),
        evenements: d.evenements.filter((e) => e.panne_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((e) => ({ ...e, auteur: personne(e.auteur_id) })),
        photos: d.photos.filter((x) => x.panne_id === id).map((x) => ({ ...x, url: x.donnees })),
      };
    },
    async signaler(donnees, fichiers = [], options = {}) {
      exiger(peutSignaler(moi()));
      if (!donnees.titre?.trim()) throw new Error('Indiquez un titre.');
      const id = options.id || uid(), maintenant = options.created_at || new Date().toISOString();
      if (d.pannes.some((p) => p.id === id)) return id;   // déjà envoyé
      const annee = new Date().getFullYear();
      const numero = Math.max(0, ...d.pannes.filter((p) => p.annee === annee).map((p) => p.numero)) + 1;
      d.pannes.push({ engin_id: null, element: null, pk: null, lat: null, lng: null, precision_m: null, description: null, ...donnees,
        id, annee, numero, statut: 'ouverte', pris_par: null, reparee_at: null, auteur_id: moi().id, created_at: maintenant, updated_at: maintenant });
      d.evenements.push({ id: uid(), panne_id: id, auteur_id: moi().id, type: 'declaration', texte: donnees.description || null, created_at: maintenant });
      for (const f of fichiers) d.photos.push({ id: uid(), panne_id: id, evenement_id: null, donnees: await lireFichier(f) });
      sauver();
      return id;
    },
    async ajouterEvenement(panneId, type, texte, fichiers = [], options = {}) {
      exiger(type === 'commentaire' ? peutSignaler(moi()) : peutReparer(moi()));
      if (options.id && d.evenements.some((e) => e.id === options.id)) return;   // déjà envoyé
      if (!d.pannes.some((p) => p.id === panneId)) throw new Error('Panne introuvable.');
      const ev = ajouterEvt(d, panneId, moi().id, type, texte, options.created_at);
      if (options.id) ev.id = options.id;
      for (const f of fichiers) d.photos.push({ id: uid(), panne_id: panneId, evenement_id: ev.id, donnees: await lireFichier(f) });
      sauver();
    },

    async membres() { return d.membres.map((m) => ({ ...m })); },
    async majMembre(id, champs) { exiger(moi()?.est_admin); Object.assign(d.membres.find((m) => m.id === id), champs); sauver(); },
    async gererCompte(corps) {
      exiger(moi()?.est_admin);
      if (corps.action === 'inviter') {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(corps.email || '')) throw new Error('Adresse e-mail invalide.');
        if (d.membres.some((m) => m.email === corps.email)) throw new Error('Un compte existe déjà avec cette adresse.');
        d.membres.push({ id: uid(), prenom: corps.prenom, nom: corps.nom, email: corps.email, telephone: corps.telephone || null, role: corps.role, est_admin: !!corps.est_admin, actif: true });
      } else {
        if (corps.id === moi().id) throw new Error('Vous ne pouvez pas retirer votre propre accès.');
        d.membres.find((m) => m.id === corps.id).actif = corps.action === 'retablir';
      }
      sauver();
      return { ok: true };
    },
  };
}
