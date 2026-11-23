-- Mode hors connexion : un signalement fait sans réseau garde l'heure où il a été fait.
-- L'heure fournie par le téléphone est acceptée si elle date de moins de 7 jours (sinon : heure du serveur).

create or replace function public.heure_valide(t timestamptz) returns timestamptz
language sql stable set search_path = public as $$
  select case when t is null or t > now() + interval '5 minutes' or t < now() - interval '7 days' then now() else t end;
$$;
revoke execute on function public.heure_valide(timestamptz) from public, anon;
grant execute on function public.heure_valide(timestamptz) to authenticated, service_role;

create or replace function public.avant_panne() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('pannes_numero'));
  new.created_at := public.heure_valide(new.created_at);
  new.updated_at := now();
  new.annee := extract(year from new.created_at)::int;
  new.numero := coalesce((select max(numero) from pannes where annee = new.annee), 0) + 1;
  new.statut := 'ouverte';
  new.pris_par := null;
  new.reparee_at := null;
  return new;
end $$;

create or replace function public.apres_panne() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into evenements (panne_id, auteur_id, type, texte, created_at)
  values (new.id, new.auteur_id, 'declaration', new.description, new.created_at);
  return new;
end $$;

create or replace function public.avant_evenement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := public.heure_valide(new.created_at);
  return new;
end $$;
revoke execute on function public.avant_evenement() from public, anon, authenticated;
create trigger avant_evenement before insert on evenements
  for each row execute function public.avant_evenement();

create or replace function public.appliquer_evenement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'prise_en_charge' then
    update pannes set statut = 'prise_en_charge', pris_par = new.auteur_id, updated_at = now()
      where id = new.panne_id and statut = 'ouverte';
  elsif new.type = 'intervention' then
    update pannes set statut = 'en_cours', pris_par = coalesce(pris_par, new.auteur_id), updated_at = now()
      where id = new.panne_id and statut <> 'reparee';
  elsif new.type = 'reparee' then
    update pannes set statut = 'reparee', reparee_at = new.created_at, updated_at = now() where id = new.panne_id;
  elsif new.type = 'reouverte' then
    update pannes set statut = 'ouverte', reparee_at = null, pris_par = null, updated_at = now()
      where id = new.panne_id;
  else
    update pannes set updated_at = now() where id = new.panne_id;
  end if;
  return new;
end $$;
