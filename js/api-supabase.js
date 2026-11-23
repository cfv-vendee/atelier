// Accès aux données réelles (Supabase). Les droits sont vérifiés côté serveur (RLS).
// Hors connexion : les dernières données consultées sont gardées dans le téléphone.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { compresser } from './ui.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESEAU = /Failed to fetch|Load failed|NetworkError|network ?error|fetch failed|abort|timed? ?out|timeout/i;
const exigerId = (id, quoi) => { if (!UUID.test(id || '')) throw new Error(`${quoi} introuvable. Le lien ou le QR code ne correspond à rien dans l'appli du CFV.`); };
const PANNE_COLS = '*, engin:engins(id, designation, surnom), auteur:profils!pannes_auteur_id_fkey(prenom, nom), technicien:profils!pannes_pris_par_fkey(prenom, nom)';
const PREFIXE_CACHE = 'cfv-cache:';

function erreur(message, code) {
  const e = new Error(traduire(message));
  e.reseau = RESEAU.test(message || '');
  e.code = code;
  return e;
}

// Copie locale des écrans consultés, pour les revoir sans réseau.
const cache = {
  lire(cle) { try { return JSON.parse(localStorage.getItem(PREFIXE_CACHE + cle)); } catch { return null; } },
  ecrire(cle, valeur) { try { localStorage.setItem(PREFIXE_CACHE + cle, JSON.stringify(valeur)); } catch { /* stockage plein */ } },
  vider() { try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIXE_CACHE)).forEach((k) => localStorage.removeItem(k)); } catch { /* rien */ } },
};
async function avecCache(cle, lecture) {
  try {
    const r = await lecture();
    cache.ecrire(cle, r);
    return r;
  } catch (e) {
    if (e.reseau || !navigator.onLine) {
      const copie = cache.lire(cle);
      if (copie) return copie;
      throw erreur("Pas de connexion internet, et cet écran n'a pas encore été ouvert sur ce téléphone.");
    }
    throw e;
  }
}

export function creerApi({ url, cle }) {
  const cleSession = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  const sb = createClient(url, cle, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    // Réseau faible : on abandonne au bout de 30 s, l'envoi est alors gardé pour plus tard.
    global: { fetch: (u, o = {}) => fetch(u, { ...o, signal: o.signal || AbortSignal.timeout(30000) }) },
  });

  const verif = ({ data, error }) => { if (error) throw erreur(error.message, error.code); return data; };
  async function monId() {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user?.id;
    if (!id) throw erreur('Session expirée : reconnectez-vous.');
    return id;
  }
  // Les identifiants viennent de l'appli : un renvoi après coupure ne crée pas de doublon.
  const dejaFait = (error) => error && (error.code === '23505' || /duplicate|already exists/i.test(error.message));

  async function envoyerPhotos(panneId, evenementId, fichiers, auteurId, ids = []) {
    for (let i = 0; i < fichiers.length; i++) {
      const f = fichiers[i];
      const id = ids[i] || crypto.randomUUID();
      const blob = f.name === 'cfv-compressee.jpg' ? f : await compresser(f);
      const chemin = `${panneId}/${id}.jpg`;
      const up = await sb.storage.from('photos').upload(chemin, blob, { contentType: 'image/jpeg' });
      if (up.error && !dejaFait(up.error)) throw erreur(up.error.message);
      const ins = await sb.from('photos').insert({ id, panne_id: panneId, evenement_id: evenementId, chemin, auteur_id: auteurId });
      if (ins.error && !dejaFait(ins.error)) throw erreur(ins.error.message, ins.error.code);
    }
  }

  return {
    demo: false,
    async session() {
      const { data, error } = await sb.auth.getSession();
      if (data.session) return data.session;
      // Sans réseau, la session ne peut pas être renouvelée : on garde l'accès en consultation.
      if (!navigator.onLine || error) {
        try { const s = JSON.parse(localStorage.getItem(cleSession)); if (s?.user?.id) return { user: s.user, horsLigne: true }; } catch { /* rien */ }
      }
      return null;
    },
    surAuth(cb) { sb.auth.onAuthStateChange((evt, session) => cb(evt, session)); },
    async connexion(email, motDePasse) { verif(await sb.auth.signInWithPassword({ email, password: motDePasse })); },
    async deconnexion() { cache.vider(); await sb.auth.signOut(); },
    async motDePasseOublie(email) {
      verif(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
    },
    async changerMotDePasse(mdp) { verif(await sb.auth.updateUser({ password: mdp })); },

    async moi() {
      const session = await this.session();
      if (!session) return null;
      return avecCache('moi', async () => verif(await sb.from('profils').select('*').eq('id', session.user.id).single()));
    },
    async majMoi(champs) { verif(await sb.from('profils').update(champs).eq('id', await monId())); },

    async engins() { return avecCache('engins', async () => verif(await sb.from('engins_etat').select('*').eq('actif', true).order('ordre'))); },
    async engin(id) {
      exigerId(id, 'Engin');
      return avecCache('engin:' + id, async () => verif(await sb.from('engins_etat').select('*').eq('id', id).single()));
    },

    async pannes(filtres = {}) {
      const { ouvertes, enginId, cible, auteurId, limite } = filtres;
      return avecCache('pannes:' + JSON.stringify(filtres), async () => {
        let q = sb.from('pannes').select(PANNE_COLS).order('created_at', { ascending: false });
        if (ouvertes) q = q.neq('statut', 'reparee');
        if (enginId) q = q.eq('engin_id', enginId);
        if (cible) q = q.eq('cible', cible);
        if (auteurId) q = q.eq('auteur_id', auteurId);
        if (limite) q = q.limit(limite);
        return verif(await q);
      });
    },
    async panne(id) {
      exigerId(id, 'Panne');
      return avecCache('panne:' + id, async () => {
        const panne = verif(await sb.from('pannes').select(PANNE_COLS).eq('id', id).single());
        const evenements = verif(await sb.from('evenements').select('*, auteur:profils(prenom, nom, role)').eq('panne_id', id).order('created_at', { ascending: false }));
        const photos = verif(await sb.from('photos').select('*').eq('panne_id', id).order('created_at'));
        if (photos.length) {
          const signes = verif(await sb.storage.from('photos').createSignedUrls(photos.map((p) => p.chemin), 3600));
          photos.forEach((p, i) => { p.url = signes[i]?.signedUrl; });
        }
        return { ...panne, evenements, photos };
      });
    },
    async signaler(donnees, fichiers = [], { id, created_at, photosIds } = {}) {
      const uid = await monId();
      const panneId = id || crypto.randomUUID();
      const { error } = await sb.from('pannes').insert({ ...donnees, id: panneId, auteur_id: uid, ...(created_at ? { created_at } : {}) });
      if (error && !dejaFait(error)) throw erreur(error.message, error.code);
      if (fichiers.length) await envoyerPhotos(panneId, null, fichiers, uid, photosIds);
      return panneId;
    },
    async ajouterEvenement(panneId, type, texte, fichiers = [], { id, created_at, photosIds } = {}) {
      const uid = await monId();
      const evId = id || crypto.randomUUID();
      const { error } = await sb.from('evenements').insert({ id: evId, panne_id: panneId, auteur_id: uid, type, texte: texte || null, ...(created_at ? { created_at } : {}) });
      if (error && !dejaFait(error)) throw erreur(error.message, error.code);
      if (fichiers.length) await envoyerPhotos(panneId, evId, fichiers, uid, photosIds);
    },

    async membres() { return avecCache('membres', async () => verif(await sb.from('profils').select('*').order('actif', { ascending: false }).order('nom'))); },
    async majMembre(id, champs) { verif(await sb.from('profils').update(champs).eq('id', id)); },
    async gererCompte(corps) {
      const { data, error } = await sb.functions.invoke('invite-membre', { body: { ...corps, redirectTo: location.origin + location.pathname } });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).erreur || msg; } catch { /* réponse non JSON */ }
        throw erreur(msg);
      }
      return data;
    },
  };
}

function traduire(message) {
  if (/Invalid login credentials/i.test(message)) return 'Adresse e-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(message)) return "Votre adresse e-mail n'est pas encore confirmée.";
  if (/row-level security/i.test(message)) return "Vous n'avez pas les droits pour faire cela.";
  if (/Password should be/i.test(message)) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (RESEAU.test(message)) return 'Pas de connexion internet.';
  if (/invalid input syntax for type uuid|0 rows|multiple \(or no\) rows/i.test(message)) return "Élément introuvable : il a peut-être été supprimé, ou le lien n'est pas valable.";
  return message;
}
