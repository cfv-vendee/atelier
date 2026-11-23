// Gestion des comptes par un administrateur : inviter, modifier, retirer ou rétablir l'accès.
// Seule cette fonction (clé serveur) peut créer un compte et lui donner un rôle.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ROLES = ["bureau", "conducteur", "conducteur_technicien", "technicien"];

function reponse(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Qui appelle ? Il doit être administrateur et actif.
    const jeton = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jeton);
    if (!user) return reponse({ erreur: "Non connecté." }, 401);
    const { data: moi } = await admin.from("profils").select("est_admin, actif").eq("id", user.id).single();
    if (!moi?.actif || !moi?.est_admin) return reponse({ erreur: "Réservé aux administrateurs." }, 403);

    const corps = await req.json();
    const action = corps.action;

    if (action === "inviter") {
      const email = String(corps.email ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reponse({ erreur: "Adresse e-mail invalide." }, 400);
      if (!ROLES.includes(corps.role)) return reponse({ erreur: "Rôle inconnu." }, 400);
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: corps.redirectTo,
        data: { prenom: corps.prenom ?? "", nom: corps.nom ?? "" },
      });
      if (error) {
        const deja = /already|registered|exists/i.test(error.message);
        return reponse({ erreur: deja ? "Un compte existe déjà avec cette adresse." : error.message }, 400);
      }
      const { error: e2 } = await admin.from("profils").upsert({
        id: data.user.id, email,
        prenom: String(corps.prenom ?? "").trim(), nom: String(corps.nom ?? "").trim(),
        telephone: corps.telephone ? String(corps.telephone).trim() : null,
        role: corps.role, est_admin: !!corps.est_admin, referent_voie: !!corps.referent_voie, actif: true,
      });
      if (e2) return reponse({ erreur: e2.message }, 500);
      return reponse({ ok: true, id: data.user.id });
    }

    if (action === "retirer" || action === "retablir") {
      if (corps.id === user.id) return reponse({ erreur: "Vous ne pouvez pas retirer votre propre accès." }, 400);
      const actif = action === "retablir";
      await admin.auth.admin.updateUserById(corps.id, { ban_duration: actif ? "none" : "876000h" });
      const { error } = await admin.from("profils").update({ actif }).eq("id", corps.id);
      if (error) return reponse({ erreur: error.message }, 500);
      return reponse({ ok: true });
    }

    return reponse({ erreur: "Action inconnue." }, 400);
  } catch (e) {
    return reponse({ erreur: String(e?.message ?? e) }, 500);
  }
});
