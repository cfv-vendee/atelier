-- Référent voie : droit qui s'ajoute au rôle (comme Administrateur).
-- Il donne accès aux tournées d'inspection, à la configuration de la voie et au traitement des problèmes de voie.
-- Les autres membres peuvent seulement signaler un problème de voie et suivre son état.

alter table profils add column referent_voie boolean not null default false;
grant select (referent_voie) on profils to authenticated;
grant update (referent_voie) on profils to authenticated;

-- Un membre ne peut pas se donner lui-même ce droit (comme le rôle et le droit Administrateur).
create or replace function public.proteger_profil() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;  -- invitation côté serveur
  end if;
  if not public.est_admin() then
    new.role := old.role; new.est_admin := old.est_admin; new.referent_voie := old.referent_voie;
    new.actif := old.actif; new.email := old.email;
  end if;
  return new;
end $$;
revoke execute on function public.proteger_profil() from public, anon, authenticated;

-- Référent voie ou administrateur, et compte actif.
create function public.peut_inspecter() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif and (referent_voie or est_admin));
$$;
revoke execute on function public.peut_inspecter() from public, anon;
grant execute on function public.peut_inspecter() to authenticated;

-- Qui peut ajouter quoi à l'historique d'une panne :
--   voie     → référents voie et administrateurs (commentaires compris) ;
--   matériel → commentaire : tous ceux qui signalent ; actions : techniciens et administrateurs.
create function public.peut_agir_panne(p_panne uuid, p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when (select cible from pannes where id = p_panne) = 'voie' then public.peut_inspecter()
    when p_type = 'commentaire' then public.peut_signaler()
    else public.peut_reparer()
  end;
$$;
revoke execute on function public.peut_agir_panne(uuid, text) from public, anon;
grant execute on function public.peut_agir_panne(uuid, text) to authenticated;

drop policy "historique : ajouter" on evenements;
create policy "historique : ajouter" on evenements for insert to authenticated with check (
  auteur_id = (select auth.uid())
  and type in ('commentaire', 'prise_en_charge', 'intervention', 'reparee', 'reouverte')
  and public.peut_agir_panne(panne_id, type::text)
);

-- Tournées : démarrées par les référents voie et les administrateurs.
drop policy "tournées : démarrer" on tournees;
create policy "tournées : démarrer" on tournees for insert to authenticated
  with check ((select public.peut_inspecter()) and auteur_id = (select auth.uid()));

-- Configuration de la voie (repères) : référents voie et administrateurs.
drop policy "repères : relevé (admin)" on reperes;
drop policy "repères : correction (admin)" on reperes;
drop policy "repères : suppression (admin)" on reperes;
create policy "repères : relevé" on reperes for insert to authenticated
  with check ((select public.peut_inspecter()) and auteur_id = (select auth.uid()));
create policy "repères : correction" on reperes for update to authenticated using ((select public.peut_inspecter()));
create policy "repères : suppression" on reperes for delete to authenticated using ((select public.peut_inspecter()));

-- Photo d'un repère supprimé : effacée aussi par un référent voie.
create policy "photos fichiers : repères" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (select public.peut_inspecter())
         and (storage.foldername(name))[1] in (select id::text from public.reperes));

-- « Configuration de la voie terminée » : modifiable par les référents voie ; le reste par les administrateurs.
drop policy "paramètres : ajout (admin)" on parametres;
drop policy "paramètres : modification (admin)" on parametres;
create policy "paramètres : ajout" on parametres for insert to authenticated
  with check ((select public.est_admin()) or (cle = 'voie_configuree' and (select public.peut_inspecter())));
create policy "paramètres : modification" on parametres for update to authenticated
  using ((select public.est_admin()) or (cle = 'voie_configuree' and (select public.peut_inspecter())))
  with check ((select public.est_admin()) or (cle = 'voie_configuree' and (select public.peut_inspecter())));
