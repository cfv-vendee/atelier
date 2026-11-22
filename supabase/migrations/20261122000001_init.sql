-- CFV Atelier : schéma initial
-- Rôles, parc matériel, pannes, historique (événements), photos, sécurité (RLS).

-- ───────── Types ─────────
create type role_membre as enum ('bureau', 'conducteur', 'conducteur_technicien', 'technicien');
create type categorie_engin as enum ('vapeur', 'diesel', 'locotracteur', 'manoeuvre', 'autorail', 'draisine', 'voiture');
create type cible_panne as enum ('materiel', 'voie');
create type element_voie as enum ('pn', 'rail', 'eclisse', 'traverse', 'ballast', 'aiguillage', 'ouvrage', 'vegetation', 'autre');
create type gravite_panne as enum ('bloquante', 'surveiller', 'mineure');
create type statut_panne as enum ('ouverte', 'prise_en_charge', 'en_cours', 'reparee');
create type type_evenement as enum ('declaration', 'commentaire', 'prise_en_charge', 'intervention', 'reparee', 'reouverte');

-- ───────── Membres ─────────
create table profils (
  id uuid primary key references auth.users (id) on delete cascade,
  prenom text not null default '',
  nom text not null default '',
  email text,
  telephone text,
  role role_membre not null default 'bureau',
  est_admin boolean not null default false,
  actif boolean not null default false,
  created_at timestamptz not null default now()
);

-- Tout nouveau compte est créé inactif, sans droits : c'est l'invitation
-- (fonction invite-membre, côté serveur) qui donne le rôle et active le compte.
create function public.nouveau_compte() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profils (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.nouveau_compte();

-- ───────── Fonctions de droits ─────────
create function public.membre_actif() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif);
$$;
create function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif and est_admin);
$$;
create function public.peut_signaler() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif and (role <> 'bureau' or est_admin));
$$;
create function public.peut_reparer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif
                 and (role in ('conducteur_technicien', 'technicien') or est_admin));
$$;

-- Un membre peut modifier son nom et son téléphone, jamais son rôle ni ses droits.
-- (security invoker : current_user doit être le rôle réel de l'appelant)
create function public.proteger_profil() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;  -- invitation côté serveur
  end if;
  if not public.est_admin() then
    new.role := old.role; new.est_admin := old.est_admin; new.actif := old.actif; new.email := old.email;
  end if;
  return new;
end $$;
create trigger proteger_profil before update on profils
  for each row execute function public.proteger_profil();

-- ───────── Parc matériel ─────────
create table series (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  nom text not null,
  fiche jsonb not null default '[]'          -- [[libellé, valeur], …]
);

create table engins (
  id uuid primary key default gen_random_uuid(),
  categorie categorie_engin not null,
  designation text not null,
  surnom text,
  constructeur text,
  annee text,
  serie_id uuid references series (id) on delete set null,
  fiche jsonb not null default '[]',         -- caractéristiques propres (sinon celles de la série)
  notes text,
  photo text,                                -- chemin dans le stockage « photos »
  ordre int not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────── Pannes ─────────
create table pannes (
  id uuid primary key default gen_random_uuid(),
  annee int not null default extract(year from now())::int,
  numero int not null default 0,
  cible cible_panne not null,
  engin_id uuid references engins (id) on delete restrict,
  element element_voie,
  pk numeric(6, 3),
  lat double precision,
  lng double precision,
  precision_m real,
  titre text not null check (length(trim(titre)) > 0),
  description text,
  gravite gravite_panne not null,
  statut statut_panne not null default 'ouverte',
  auteur_id uuid not null references profils (id),
  pris_par uuid references profils (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reparee_at timestamptz,
  constraint cible_coherente check (
    (cible = 'materiel' and engin_id is not null) or (cible = 'voie' and element is not null)
  ),
  unique (annee, numero)
);
create index pannes_statut_idx on pannes (statut);
create index pannes_engin_idx on pannes (engin_id);

create table evenements (
  id uuid primary key default gen_random_uuid(),
  panne_id uuid not null references pannes (id) on delete cascade,
  auteur_id uuid not null references profils (id),
  type type_evenement not null,
  texte text,
  created_at timestamptz not null default now()
);
create index evenements_panne_idx on evenements (panne_id, created_at);

create table photos (
  id uuid primary key default gen_random_uuid(),
  panne_id uuid not null references pannes (id) on delete cascade,
  evenement_id uuid references evenements (id) on delete cascade,
  chemin text not null,
  auteur_id uuid not null references profils (id),
  created_at timestamptz not null default now()
);

-- Numéro lisible par année (2026-001, 2026-002…) et événement « déclaration » automatique.
create function public.avant_panne() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('pannes_numero'));
  new.numero := coalesce((select max(numero) from pannes where annee = new.annee), 0) + 1;
  new.statut := 'ouverte';
  new.pris_par := null;
  new.reparee_at := null;
  return new;
end $$;
create trigger avant_panne before insert on pannes
  for each row execute function public.avant_panne();

create function public.apres_panne() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into evenements (panne_id, auteur_id, type, texte)
  values (new.id, new.auteur_id, 'declaration', new.description);
  return new;
end $$;
create trigger apres_panne after insert on pannes
  for each row execute function public.apres_panne();

-- Les changements de statut passent tous par l'historique : chaque étape est tracée.
create function public.appliquer_evenement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'prise_en_charge' then
    update pannes set statut = 'prise_en_charge', pris_par = new.auteur_id, updated_at = now()
      where id = new.panne_id;
  elsif new.type = 'intervention' then
    update pannes set statut = 'en_cours', pris_par = coalesce(pris_par, new.auteur_id), updated_at = now()
      where id = new.panne_id and statut <> 'reparee';
  elsif new.type = 'reparee' then
    update pannes set statut = 'reparee', reparee_at = now(), updated_at = now() where id = new.panne_id;
  elsif new.type = 'reouverte' then
    update pannes set statut = 'ouverte', reparee_at = null, pris_par = null, updated_at = now()
      where id = new.panne_id;
  else
    update pannes set updated_at = now() where id = new.panne_id;
  end if;
  return new;
end $$;
create trigger appliquer_evenement after insert on evenements
  for each row execute function public.appliquer_evenement();

-- État de chaque engin, calculé à partir des pannes non réparées.
create view engins_etat with (security_invoker = true) as
select e.*,
  coalesce(s.nom, null) as serie_nom,
  case when jsonb_array_length(e.fiche) > 0 then e.fiche else coalesce(s.fiche, '[]'::jsonb) end as fiche_complete,
  count(p.id) filter (where p.statut <> 'reparee') as pannes_ouvertes,
  case
    when bool_or(p.statut <> 'reparee' and p.gravite = 'bloquante') then 'immobilise'
    when bool_or(p.statut <> 'reparee' and p.gravite <> 'mineure') then 'surveiller'
    else 'service'
  end as etat
from engins e
left join series s on s.id = e.serie_id
left join pannes p on p.engin_id = e.id
group by e.id, s.id;

-- ───────── Sécurité (RLS) ─────────
alter table profils enable row level security;
alter table series enable row level security;
alter table engins enable row level security;
alter table pannes enable row level security;
alter table evenements enable row level security;
alter table photos enable row level security;

create policy "membres : lecture" on profils for select using (membre_actif() or id = auth.uid());
create policy "membres : modifier son profil" on profils for update using (id = auth.uid() or est_admin());

create policy "séries : lecture" on series for select using (membre_actif());
create policy "séries : admin" on series for all using (est_admin()) with check (est_admin());
create policy "engins : lecture" on engins for select using (membre_actif());
create policy "engins : admin" on engins for all using (est_admin()) with check (est_admin());

create policy "pannes : lecture" on pannes for select using (membre_actif());
create policy "pannes : signaler" on pannes for insert with check (peut_signaler() and auteur_id = auth.uid());
create policy "pannes : admin" on pannes for update using (est_admin()) with check (est_admin());
create policy "pannes : supprimer (admin)" on pannes for delete using (est_admin());

create policy "historique : lecture" on evenements for select using (membre_actif());
create policy "historique : ajouter" on evenements for insert with check (
  auteur_id = auth.uid() and (
    (type = 'commentaire' and peut_signaler())
    or (type in ('prise_en_charge', 'intervention', 'reparee', 'reouverte') and peut_reparer())
  )
);

create policy "photos : lecture" on photos for select using (membre_actif());
create policy "photos : ajouter" on photos for insert with check (peut_signaler() and auteur_id = auth.uid());

-- ───────── Stockage des photos ─────────
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;
create policy "photos fichiers : lecture" on storage.objects for select
  using (bucket_id = 'photos' and public.membre_actif());
create policy "photos fichiers : envoi" on storage.objects for insert
  with check (bucket_id = 'photos' and public.peut_signaler());
create policy "photos fichiers : admin" on storage.objects for delete
  using (bucket_id = 'photos' and public.est_admin());
