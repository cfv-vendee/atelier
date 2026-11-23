-- Corrections issues de l'audit du 23/11/2026.

-- 1) Photos : seulement des images, 10 Mo maximum, rangées sous <panne>/<photo>.jpg
update storage.buckets
  set file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  where id = 'photos';
drop policy if exists "photos fichiers : envoi" on storage.objects;
create policy "photos fichiers : envoi" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos' and (select public.peut_signaler())
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  );

-- 2) Coordonnées (e-mail, téléphone) : chacun voit les siennes, les administrateurs voient celles de tous.
revoke select, update on profils from authenticated;
grant select (id, prenom, nom, role, est_admin, actif, created_at) on profils to authenticated;
grant update (prenom, nom, telephone, role, est_admin) on profils to authenticated;

create function public.mes_coordonnees() returns table (email text, telephone text)
language sql stable security definer set search_path = public as $$
  select email, telephone from profils where id = auth.uid();
$$;
create function public.coordonnees_membres() returns table (id uuid, email text, telephone text)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.telephone from profils p where public.est_admin();
$$;
revoke execute on function public.mes_coordonnees(), public.coordonnees_membres() from public, anon;
grant execute on function public.mes_coordonnees(), public.coordonnees_membres() to authenticated;

-- 3) Il doit toujours rester au moins un administrateur actif.
create function public.garder_un_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.est_admin and old.actif and (not new.est_admin or not new.actif)
     and not exists (select 1 from profils where est_admin and actif and id <> old.id) then
    raise exception 'Il doit rester au moins un administrateur actif.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.garder_un_admin() from public, anon, authenticated;
create trigger garder_un_admin before update on profils
  for each row execute function public.garder_un_admin();

-- 4) Index sur les liens entre tables.
create index if not exists engins_serie_idx on engins (serie_id);
create index if not exists evenements_auteur_idx on evenements (auteur_id);
create index if not exists pannes_auteur_idx on pannes (auteur_id);
create index if not exists pannes_pris_par_idx on pannes (pris_par);
create index if not exists photos_auteur_idx on photos (auteur_id);
create index if not exists photos_evenement_idx on photos (evenement_id);
create index if not exists photos_panne_idx on photos (panne_id);

-- 5) Règles d'accès : évaluées une seule fois par requête, une règle par action.
drop policy "membres : lecture" on profils;
drop policy "membres : modifier son profil" on profils;
create policy "membres : lecture" on profils for select to authenticated
  using ((select public.membre_actif()) or id = (select auth.uid()));
create policy "membres : modifier" on profils for update to authenticated
  using (id = (select auth.uid()) or (select public.est_admin()));

drop policy "séries : lecture" on series;
drop policy "séries : admin" on series;
create policy "séries : lecture" on series for select to authenticated using ((select public.membre_actif()));
create policy "séries : ajout" on series for insert to authenticated with check ((select public.est_admin()));
create policy "séries : modification" on series for update to authenticated using ((select public.est_admin()));
create policy "séries : suppression" on series for delete to authenticated using ((select public.est_admin()));

drop policy "engins : lecture" on engins;
drop policy "engins : admin" on engins;
create policy "engins : lecture" on engins for select to authenticated using ((select public.membre_actif()));
create policy "engins : ajout" on engins for insert to authenticated with check ((select public.est_admin()));
create policy "engins : modification" on engins for update to authenticated using ((select public.est_admin()));
create policy "engins : suppression" on engins for delete to authenticated using ((select public.est_admin()));

drop policy "pannes : lecture" on pannes;
drop policy "pannes : signaler" on pannes;
drop policy "pannes : admin" on pannes;
drop policy "pannes : supprimer (admin)" on pannes;
create policy "pannes : lecture" on pannes for select to authenticated using ((select public.membre_actif()));
create policy "pannes : signaler" on pannes for insert to authenticated
  with check ((select public.peut_signaler()) and auteur_id = (select auth.uid()));
create policy "pannes : modification (admin)" on pannes for update to authenticated using ((select public.est_admin()));
create policy "pannes : suppression (admin)" on pannes for delete to authenticated using ((select public.est_admin()));

drop policy "historique : lecture" on evenements;
drop policy "historique : ajouter" on evenements;
create policy "historique : lecture" on evenements for select to authenticated using ((select public.membre_actif()));
create policy "historique : ajouter" on evenements for insert to authenticated with check (
  auteur_id = (select auth.uid()) and (
    (type = 'commentaire' and (select public.peut_signaler()))
    or (type in ('prise_en_charge', 'intervention', 'reparee', 'reouverte') and (select public.peut_reparer()))
  )
);

drop policy "photos : lecture" on photos;
drop policy "photos : ajouter" on photos;
create policy "photos : lecture" on photos for select to authenticated using ((select public.membre_actif()));
create policy "photos : ajouter" on photos for insert to authenticated
  with check ((select public.peut_signaler()) and auteur_id = (select auth.uid()));

-- 6) Fonction d'entretien : chemin de recherche fixé.
alter function public.ping() set search_path = public;
