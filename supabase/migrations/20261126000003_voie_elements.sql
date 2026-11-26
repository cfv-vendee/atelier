-- Corrections et ajouts sur le plan de la ligne (js/voie-cfv.js, tiré d'OpenStreetMap) :
-- type d'un passage à niveau (manuel / automatique), classement d'un évitement ou d'un tiroir, nom d'un viaduc,
-- éléments manquants (ouvrage, PN). Réservé aux référents voie et aux administrateurs ; lisible par tous les membres.
create table voie_elements (
  id uuid primary key default gen_random_uuid(),
  cle text unique check (char_length(cle) <= 80),                 -- élément du plan d'origine corrigé (null = élément ajouté)
  genre text check (genre in ('pn', 'viaduc', 'pont', 'tunnel', 'evitement', 'tiroir')),
  nom text check (char_length(nom) <= 120),
  pn_type text check (pn_type in ('manuel', 'auto')),
  pk numeric(7, 3) check (pk between 0 and 9999),
  masque boolean not null default false,                          -- élément du plan d'origine à retirer de la carte
  auteur_id uuid references profils (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cle is not null or (genre in ('pn', 'viaduc', 'pont', 'tunnel') and pk is not null and nom is not null))
);
create function public.avant_voie_element() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.auteur_id := auth.uid(); new.created_at := now(); end if;
  return new;
end $$;
revoke execute on function public.avant_voie_element() from public, anon, authenticated;
create trigger avant_voie_element before insert or update on voie_elements for each row execute function public.avant_voie_element();

alter table voie_elements enable row level security;
create policy "plan : lecture" on voie_elements for select to authenticated using ((select public.membre_actif()));
create policy "plan : ajout" on voie_elements for insert to authenticated with check ((select public.peut_inspecter()));
create policy "plan : correction" on voie_elements for update to authenticated using ((select public.peut_inspecter())) with check ((select public.peut_inspecter()));
create policy "plan : suppression" on voie_elements for delete to authenticated using ((select public.peut_inspecter()));
grant select, insert, delete on voie_elements to authenticated;
grant update (genre, nom, pn_type, pk, masque) on voie_elements to authenticated;
grant all on voie_elements to service_role;
