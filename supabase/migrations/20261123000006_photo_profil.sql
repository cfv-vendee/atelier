-- Photo de profil : rangée dans un espace « avatars » privé, sous <id du membre>/<photo>.jpg.
-- Chaque membre change la sienne ; un administrateur peut en retirer une.

alter table profils add column photo text
  check (photo ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and split_part(photo, '/', 1) = id::text);
grant select (photo) on profils to authenticated;
grant update (photo) on profils to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "avatars : lecture" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (select public.membre_actif()));
create policy "avatars : envoi" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (select public.membre_actif())
              and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.jpg$'));
create policy "avatars : suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.est_admin())));
