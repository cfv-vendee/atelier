-- Tournées d'inspection de la voie.
-- Une tournée couvre une portion (PK de début → PK de fin), garde les sections vues et non vues,
-- et les défauts constatés sont des pannes de voie rattachées à la tournée.

create table tournees (
  id uuid primary key default gen_random_uuid(),
  auteur_id uuid not null references profils (id),
  pk_debut numeric(6, 3) not null check (pk_debut between 0 and 99),
  pk_fin numeric(6, 3) not null check (pk_fin between 0 and 99),
  participants text,
  debut timestamptz not null default now(),
  fin timestamptz,
  sections_vues jsonb not null default '[]',        -- [[pk_de, pk_a], …]
  sections_non_vues jsonb not null default '[]',    -- [[pk_de, pk_a, raison], …]
  notes jsonb not null default '[]',                -- [{"pk": 4.2, "texte": "…", "heure": "…"}, …]
  statut text not null default 'en_cours' check (statut in ('en_cours', 'terminee')),
  created_at timestamptz not null default now()
);
create index tournees_auteur_idx on tournees (auteur_id);
create index tournees_debut_idx on tournees (debut desc);

alter table pannes add column tournee_id uuid references tournees (id) on delete set null;
create index pannes_tournee_idx on pannes (tournee_id);

-- Heures fournies par le téléphone (tournée faite hors connexion) : bornées comme pour les pannes.
create function public.avant_tournee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.debut := public.heure_valide(new.debut);
  if new.fin is not null then new.fin := greatest(public.heure_valide(new.fin), new.debut); end if;
  if tg_op = 'UPDATE' then
    new.auteur_id := old.auteur_id; new.debut := old.debut; new.pk_debut := old.pk_debut; new.created_at := old.created_at;
  end if;
  return new;
end $$;
revoke execute on function public.avant_tournee() from public, anon, authenticated;
create trigger avant_tournee before insert or update on tournees
  for each row execute function public.avant_tournee();

alter table tournees enable row level security;
create policy "tournées : lecture" on tournees for select to authenticated using ((select public.membre_actif()));
create policy "tournées : démarrer" on tournees for insert to authenticated
  with check ((select public.peut_signaler()) and auteur_id = (select auth.uid()));
create policy "tournées : terminer" on tournees for update to authenticated
  using (auteur_id = (select auth.uid()) or (select public.est_admin()));
create policy "tournées : suppression (admin)" on tournees for delete to authenticated using ((select public.est_admin()));

grant select, insert, delete on tournees to authenticated;
grant update (pk_fin, participants, fin, sections_vues, sections_non_vues, notes, statut) on tournees to authenticated;
grant all on tournees to service_role;
