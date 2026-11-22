// Accès aux données réelles (Supabase). Les droits sont vérifiés côté serveur (RLS).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { compresser } from './ui.js';

const PANNE_COLS = '*, engin:engins(id, designation, surnom), auteur:profils!pannes_auteur_id_fkey(prenom, nom), technicien:profils!pannes_pris_par_fkey(prenom, nom)';

export function creerApi({ url, cle }) {
  const sb = createClient(url, cle, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  const verif = ({ data, error }) => { if (error) throw new Error(traduire(error.message)); return data; };

  async function envoyerPhotos(panneId, evenementId, fichiers, auteurId) {
    for (const f of fichiers) {
      const blob = await compresser(f);
      const chemin = `${panneId}/${crypto.randomUUID()}.jpg`;
      verif(await sb.storage.from('photos').upload(chemin, blob, { contentType: 'image/jpeg' }));
      verif(await sb.from('photos').insert({ panne_id: panneId, evenement_id: evenementId, chemin, auteur_id: auteurId }));
    }
  }

  return {
    demo: false,
    async session() { return (await sb.auth.getSession()).data.session; },
    surAuth(cb) { sb.auth.onAuthStateChange((evt, session) => cb(evt, session)); },
    async connexion(email, motDePasse) { verif(await sb.auth.signInWithPassword({ email, password: motDePasse })); },
    async deconnexion() { await sb.auth.signOut(); },
    async motDePasseOublie(email) {
      verif(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
    },
    async changerMotDePasse(mdp) { verif(await sb.auth.updateUser({ password: mdp })); },

    async moi() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      return verif(await sb.from('profils').select('*').eq('id', user.id).single());
    },
    async majMoi(champs) {
      const { data: { user } } = await sb.auth.getUser();
      verif(await sb.from('profils').update(champs).eq('id', user.id));
    },

    async engins() { return verif(await sb.from('engins_etat').select('*').eq('actif', true).order('ordre')); },
    async engin(id) { return verif(await sb.from('engins_etat').select('*').eq('id', id).single()); },

    async pannes({ ouvertes, enginId, cible, auteurId, limite } = {}) {
      let q = sb.from('pannes').select(PANNE_COLS).order('created_at', { ascending: false });
      if (ouvertes) q = q.neq('statut', 'reparee');
      if (enginId) q = q.eq('engin_id', enginId);
      if (cible) q = q.eq('cible', cible);
      if (auteurId) q = q.eq('auteur_id', auteurId);
      if (limite) q = q.limit(limite);
      return verif(await q);
    },
    async panne(id) {
      const panne = verif(await sb.from('pannes').select(PANNE_COLS).eq('id', id).single());
      const evenements = verif(await sb.from('evenements').select('*, auteur:profils(prenom, nom, role)').eq('panne_id', id).order('created_at', { ascending: false }));
      const photos = verif(await sb.from('photos').select('*').eq('panne_id', id).order('created_at'));
      if (photos.length) {
        const signes = verif(await sb.storage.from('photos').createSignedUrls(photos.map((p) => p.chemin), 3600));
        photos.forEach((p, i) => { p.url = signes[i]?.signedUrl; });
      }
      return { ...panne, evenements, photos };
    },
    async signaler(donnees, fichiers = []) {
      const { data: { user } } = await sb.auth.getUser();
      const panne = verif(await sb.from('pannes').insert({ ...donnees, auteur_id: user.id }).select('id').single());
      if (fichiers.length) await envoyerPhotos(panne.id, null, fichiers, user.id);
      return panne.id;
    },
    async ajouterEvenement(panneId, type, texte, fichiers = []) {
      const { data: { user } } = await sb.auth.getUser();
      const ev = verif(await sb.from('evenements').insert({ panne_id: panneId, auteur_id: user.id, type, texte: texte || null }).select('id').single());
      if (fichiers.length) await envoyerPhotos(panneId, ev.id, fichiers, user.id);
    },

    async membres() { return verif(await sb.from('profils').select('*').order('actif', { ascending: false }).order('nom')); },
    async majMembre(id, champs) { verif(await sb.from('profils').update(champs).eq('id', id)); },
    async gererCompte(corps) {
      const { data, error } = await sb.functions.invoke('invite-membre', { body: { ...corps, redirectTo: location.origin + location.pathname } });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).erreur || msg; } catch { /* réponse non JSON */ }
        throw new Error(msg);
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
  if (/Failed to fetch|NetworkError/i.test(message)) return 'Pas de connexion internet.';
  return message;
}
