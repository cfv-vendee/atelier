// Notifications sur le téléphone (Web Push).
// Appelée par la base (clé interne « x-cfv-cle ») à chaque nouveau signalement, prise en charge ou réparation,
// ou par un membre connecté pour s'envoyer une notification d'essai.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { envoyer, b64u } from "./webpush.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reponse = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ELEMENTS: Record<string, string> = {
  pn: "Passage à niveau", rail: "Rail", eclisse: "Éclisse", traverse: "Traverse", ballast: "Ballast",
  aiguillage: "Aiguillage", ouvrage: "Viaduc / pont", vegetation: "Végétation", autre: "Voie",
};
const GRAVITES: Record<string, string> = { bloquante: "Bloquante", surveiller: "À surveiller", mineure: "Mineure" };
const pk = (x: number | null) => (x == null ? "" : ` · PK ${String(Number(x)).replace(".", ",")}`);
const nomCourt = (p: { prenom?: string; nom?: string } | null) =>
  p ? `${p.prenom ?? ""} ${p.nom ? p.nom[0] + "." : ""}`.trim() : "Un membre";

type Message = { titre: string; corps: string; url: string; tag: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const corps = await req.json().catch(() => ({}));

    // Clés VAPID : créées une seule fois, gardées dans la table fermée « cles_push ».
    async function cles() {
      const { data } = await admin.from("cles_push").select("publique, privee").eq("id", 1).maybeSingle();
      if (data) return data;
      const paire = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const publique = b64u.encode(new Uint8Array(await crypto.subtle.exportKey("raw", paire.publicKey)));
      const { kty, crv, d, x, y } = await crypto.subtle.exportKey("jwk", paire.privateKey);
      await admin.from("cles_push").upsert({ id: 1, publique, privee: { kty, crv, d, x, y } }, { onConflict: "id", ignoreDuplicates: true });
      const { data: relu } = await admin.from("cles_push").select("publique, privee").eq("id", 1).single();
      return relu!;
    }

    // Clé publique pour inscrire un téléphone (elle n'a rien de secret).
    if (corps.action === "cle") return reponse({ publique: (await cles()).publique });

    const k = await cles();
    const vapid = { publique: k.publique, priveeJwk: k.privee, sujet: "https://cfv-vendee.github.io/atelier/" };

    // Envoie un message à une liste de membres ; retire les abonnements expirés.
    async function prevenir(ids: string[], message: Message, urgence = "normal") {
      if (!ids.length) return { envoyes: 0 };
      const { data: abos } = await admin.from("abonnements_push").select("id, endpoint, p256dh, auth").in("membre_id", ids);
      let envoyes = 0;
      const erreurs: string[] = [];
      await Promise.all((abos ?? []).map(async (a) => {
        try {
          const r = await envoyer({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(message), vapid,
            { urgence, ttl: urgence === "high" ? 3 * 86400 : 86400 });
          if (r.statut === 404 || r.statut === 410) await admin.from("abonnements_push").delete().eq("id", a.id);
          else if (r.statut >= 200 && r.statut < 300) { envoyes++; await admin.from("abonnements_push").update({ utilise_at: new Date().toISOString() }).eq("id", a.id); }
          else erreurs.push(`${r.statut} ${r.texte}`);
        } catch (e) { erreurs.push(String((e as Error)?.message ?? e)); }
      }));
      return { envoyes, erreurs };
    }

    // ── Notification d'essai, demandée par un membre connecté ──
    if (corps.action === "test") {
      const jeton = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
      const { data: { user } } = await admin.auth.getUser(jeton);
      if (!user) return reponse({ erreur: "Non connecté." }, 401);
      const r = await prevenir([user.id], { titre: "CFV Atelier", corps: "Les notifications fonctionnent sur ce téléphone.", url: "#/profil", tag: "essai" });
      return reponse(r);
    }

    // ── Appel de la base : vérification de la clé interne ──
    const { data: ok } = await admin.rpc("verifier_cle_notifier", { cle: req.headers.get("x-cfv-cle") ?? "" });
    if (!ok) return reponse({ erreur: "Accès refusé." }, 403);

    const { data: membres } = await admin.from("profils").select("id, prenom, nom, role, est_admin, referent_voie, actif, notifications").eq("actif", true);
    const actifs = membres ?? [];
    const veut = (m: any, quoi: string) => m.notifications?.[quoi] !== false;

    if (corps.table === "pannes") {
      const { data: p } = await admin.from("pannes")
        .select("id, cible, gravite, titre, element, pk, auteur_id, engin:engins(designation, surnom)").eq("id", corps.id).single();
      if (!p) return reponse({ erreur: "Panne introuvable." }, 404);
      // Responsables : techniciens pour le matériel, référents voie pour la voie, et les administrateurs.
      const responsable = (m: any) => m.est_admin ||
        (p.cible === "voie" ? m.referent_voie : ["conducteur_technicien", "technicien"].includes(m.role));
      const pref = p.gravite === "bloquante" ? "bloquantes" : "signalements";
      const ids = actifs.filter((m) => m.id !== p.auteur_id && responsable(m) && veut(m, pref)).map((m) => m.id);
      const auteur = actifs.find((m) => m.id === p.auteur_id);
      const sujet = p.cible === "voie" ? `Voie · ${ELEMENTS[p.element] ?? "Voie"}${pk(p.pk)}`
        : `${(p as any).engin?.designation ?? "Matériel"}${(p as any).engin?.surnom ? ` « ${(p as any).engin.surnom} »` : ""}`;
      const r = await prevenir(ids, {
        titre: p.gravite === "bloquante" ? `⚠ Panne bloquante · ${sujet}` : `Nouveau signalement · ${sujet}`,
        corps: `${p.titre} — ${GRAVITES[p.gravite]}, signalé par ${nomCourt(auteur)}`,
        url: `#/panne/${p.id}`, tag: `panne-${p.id}`,
      }, p.gravite === "bloquante" ? "high" : "normal");
      return reponse({ destinataires: ids.length, ...r });
    }

    if (corps.table === "evenements") {
      const { data: ev } = await admin.from("evenements").select("id, type, auteur_id, panne_id").eq("id", corps.id).single();
      if (!ev) return reponse({ erreur: "Événement introuvable." }, 404);
      const { data: p } = await admin.from("pannes").select("id, titre, auteur_id").eq("id", ev.panne_id).single();
      const auteur = actifs.find((m) => m.id === p?.auteur_id);
      // L'auteur du signalement suit son signalement (sauf s'il a fait l'action lui-même).
      if (!p || !auteur || auteur.id === ev.auteur_id || !veut(auteur, "suivi")) return reponse({ destinataires: 0 });
      const qui = nomCourt(actifs.find((m) => m.id === ev.auteur_id) ?? null);
      const r = await prevenir([auteur.id], {
        titre: ev.type === "reparee" ? "✓ Votre signalement est réparé" : "Votre signalement est pris en charge",
        corps: `${p.titre} — ${ev.type === "reparee" ? "réparé" : "pris en charge"} par ${qui}`,
        url: `#/panne/${p.id}`, tag: `panne-${p.id}`,
      });
      return reponse({ destinataires: 1, ...r });
    }

    return reponse({ erreur: "Demande inconnue." }, 400);
  } catch (e) {
    return reponse({ erreur: String((e as Error)?.message ?? e) }, 500);
  }
});
