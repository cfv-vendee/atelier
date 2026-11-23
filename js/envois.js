// Envois en attente : quand il n'y a pas de réseau (sur la voie, au dépôt…), les signalements,
// interventions, commentaires et photos sont gardés dans le téléphone, puis envoyés tout seuls
// au retour du réseau. Chaque envoi a un identifiant fixé d'avance : le renvoyer ne crée pas de doublon.
import { compresser } from './ui.js';

const BASE = 'cfv-atelier', TABLE = 'envois';

function ouvrir() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(TABLE, { keyPath: 'id' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function operation(mode, fn) {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const t = db.transaction(TABLE, mode);
    const req = fn(t.objectStore(TABLE));
    t.oncomplete = () => { db.close(); ok(req?.result); };
    t.onerror = () => { db.close(); ko(t.error); };
  });
}
const lister = async () => ((await operation('readonly', (s) => s.getAll())) || []).sort((a, b) => a.cree.localeCompare(b.cree));
const garder = (item) => operation('readwrite', (s) => s.put(item));
const supprimer = (id) => operation('readwrite', (s) => s.delete(id));

export const estErreurReseau = (e) => !navigator.onLine || !!e?.reseau || e instanceof TypeError;

// moiId() : identifiant du membre connecté. Un envoi ne part que sous le nom de celui qui l'a fait.
export function creerEnvois(api, moiId) {
  const ecouteurs = new Set();
  let enCours = false;
  // Seulement les envois du membre connecté.
  const mesEnvois = async () => (await lister()).filter((it) => it.auteur === moiId());
  const prevenir = async () => {
    const l = await mesEnvois().catch(() => []);
    ecouteurs.forEach((f) => f(l));
  };

  // Photos réduites et identifiants fixés avant tout essai d'envoi.
  async function preparer(brut) {
    const fichiers = [];
    for (const f of brut.fichiers || []) fichiers.push(new File([await compresser(f)], 'cfv-compressee.jpg', { type: 'image/jpeg' }));
    return { id: crypto.randomUUID(), cree: new Date().toISOString(), ...brut, auteur: moiId(), fichiers, photosIds: fichiers.map(() => crypto.randomUUID()) };
  }
  async function envoyer(item) {
    if (item.type === 'tournee') return api.demarrerTournee(item.donnees, { id: item.tourneeId });
    if (item.type === 'tournee_fin') return api.terminerTournee(item.tourneeId, item.donnees);
    if (item.type === 'repere') return api.ajouterRepere(item.donnees, item.fichiers[0], { id: item.repereId, created_at: item.cree, photoId: item.photosIds[0] });
    const options = { id: item.type === 'panne' ? item.panneId : item.evId, created_at: item.cree, photosIds: item.photosIds };
    if (item.type === 'panne') await api.signaler(item.donnees, item.fichiers, options);
    else await api.ajouterEvenement(item.panneId, item.typeEv, item.texte, item.fichiers, options);
  }

  return {
    lister: mesEnvois,
    surChangement(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); },

    // Envoie tout de suite si le réseau le permet, sinon garde dans le téléphone.
    // Renvoie 'envoye' ou 'garde' ; une erreur qui n'est pas due au réseau est remontée telle quelle.
    async envoyerOuGarder(brut) {
      const item = await preparer(brut);
      if (navigator.onLine) {
        try { await envoyer(item); return 'envoye'; }
        catch (e) { if (!estErreurReseau(e)) throw e; }
      }
      await garder(item);
      prevenir();
      return 'garde';
    },

    // Envoie ce qui attend, dans l'ordre. S'arrête dès que le réseau manque.
    async synchroniser() {
      if (enCours || !navigator.onLine) return 0;
      enCours = true;
      let envoyes = 0;
      try {
        for (const item of await mesEnvois()) {
          try {
            await envoyer(item);
            await supprimer(item.id);
            envoyes++;
          } catch (e) {
            if (estErreurReseau(e)) break;
            await garder({ ...item, erreur: e.message });   // refus durable (droits, panne supprimée…)
          }
        }
      } finally {
        enCours = false;
        prevenir();
      }
      return envoyes;
    },

    async retirer(id) { await supprimer(id); prevenir(); },
  };
}
