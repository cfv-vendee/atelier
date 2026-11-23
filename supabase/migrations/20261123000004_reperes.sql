-- Configuration du module Voie : relevé des repères PK sur le terrain (bornes, gares, PN, ouvrages…)
-- et paramètres de l'appli (dont « voie_configuree », qui masque l'écran de relevé une fois terminé).

create table reperes (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('borne_km', 'borne_hm', 'gare', 'pn', 'pont', 'viaduc', 'tunnel', 'aiguillage', 'heurtoir', 'zone')),
  nom text check (char_length(nom) <= 120),
  pk numeric(7, 3) check (pk between 0 and 9999),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  precision_m real check (precision_m >= 0),
  nb_mesures smallint check (nb_mesures >= 0),
  cote text check (cote in ('gauche', 'droite')),
  remarque text check (char_length(remarque) <= 1000),
  photo text check (photo ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  auteur_id uuid not null references profils (id),
  created_at timestamptz not null default now()
);
create index reperes_pk_idx on reperes (pk);
create index reperes_auteur_idx on reperes (auteur_id);

-- Relevé fait hors connexion : l'heure du téléphone est gardée si elle est plausible.
create function public.avant_repere() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := public.heure_valide(new.created_at);
  return new;
end $$;
revoke execute on function public.avant_repere() from public, anon, authenticated;
create trigger avant_repere before insert on reperes for each row execute function public.avant_repere();

alter table reperes enable row level security;
create policy "repères : lecture" on reperes for select to authenticated using ((select public.membre_actif()));
create policy "repères : relevé (admin)" on reperes for insert to authenticated
  with check ((select public.est_admin()) and auteur_id = (select auth.uid()));
create policy "repères : correction (admin)" on reperes for update to authenticated using ((select public.est_admin()));
create policy "repères : suppression (admin)" on reperes for delete to authenticated using ((select public.est_admin()));

grant select, insert, delete on reperes to authenticated;
grant update (type, nom, pk, cote, remarque) on reperes to authenticated;
grant all on reperes to service_role;

-- Paramètres généraux de l'appli, modifiables par les administrateurs.
create table parametres (
  cle text primary key check (cle ~ '^[a-z_]{1,40}$'),
  valeur jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profils (id)
);
create function public.avant_parametre() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
revoke execute on function public.avant_parametre() from public, anon, authenticated;
create trigger avant_parametre before insert or update on parametres for each row execute function public.avant_parametre();

alter table parametres enable row level security;
create policy "paramètres : lecture" on parametres for select to authenticated using ((select public.membre_actif()));
create policy "paramètres : ajout (admin)" on parametres for insert to authenticated with check ((select public.est_admin()));
create policy "paramètres : modification (admin)" on parametres for update to authenticated using ((select public.est_admin()));

grant select, insert, update (cle, valeur) on parametres to authenticated;
grant all on parametres to service_role;
