-- Fonctions de déclencheur : jamais appelables directement.
revoke execute on function public.nouveau_compte(), public.avant_panne(), public.apres_panne(),
  public.appliquer_evenement(), public.proteger_profil() from public, anon, authenticated;
-- Fonctions de droits : utilisées par les règles d'accès des membres connectés seulement.
revoke execute on function public.membre_actif(), public.est_admin(), public.peut_signaler(), public.peut_reparer()
  from public, anon;
grant execute on function public.membre_actif(), public.est_admin(), public.peut_signaler(), public.peut_reparer()
  to authenticated;
