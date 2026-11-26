-- 1. Notification quand une panne passe en « bloquante » ───────────────────────────────
-- Le trigger ne réagissait qu'aux prises en charge et aux réparations ; il réagit maintenant
-- aussi aux changements de gravité (la fonction « notifier » ne prévient que pour une HAUSSE
-- jusqu'à « bloquante »).
drop trigger if exists notifier_evenement on public.evenements;
create trigger notifier_evenement after insert on public.evenements
  for each row when (new.type in ('prise_en_charge', 'reparee', 'gravite'))
  execute function public.appeler_notifier();

-- 2. Relance d'une panne bloquante sans prise en charge : 48 h au lieu de 24 h ──────────
update public.parametres set valeur = '48'::jsonb where cle = 'relance_heures';

-- Le délai se compte depuis le moment où la panne est devenue bloquante : son signalement, ou
-- sa dernière hausse de gravité. Sans cela, une panne signalée « à surveiller » il y a trois
-- jours puis relevée en « bloquante » serait relancée dans l'heure.
create or replace function public.relancer_pannes() returns integer
language plpgsql security definer set search_path = public as $$
declare
  secret text;   -- surtout pas « cle » : le nom masquerait la colonne cle de parametres
  heure integer;
  delai integer;
  debut integer;
  fin integer;
  p record;
  envoyees integer := 0;
begin
  select coalesce((select (valeur #>> '{}')::integer from parametres where cle = 'relance_heures'), 48) into delai;
  select coalesce((select (valeur #>> '{}')::integer from parametres where cle = 'relance_debut'), 8) into debut;
  select coalesce((select (valeur #>> '{}')::integer from parametres where cle = 'relance_fin'), 21) into fin;

  -- Pas de relance la nuit : celles qui seraient dues attendent la première heure ouvrable.
  heure := extract(hour from (now() at time zone 'Europe/Paris'));
  if heure < debut or heure >= fin then return 0; end if;

  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cfv_notifier';
  if secret is null then return 0; end if;

  for p in
    select q.id from (
      select pa.id, pa.relancee_at,
             greatest(pa.created_at, coalesce((
               select max(e.created_at) from evenements e
               where e.panne_id = pa.id and e.type = 'gravite'
                 and split_part(e.texte, E'\n', 1) like '% → Bloquante'), pa.created_at)) as bloquante_depuis
      from pannes pa
      where pa.gravite = 'bloquante'
        and pa.statut = 'ouverte'                              -- personne ne s'en est encore chargé
    ) q
    where q.bloquante_depuis < now() - make_interval(hours => delai)
      -- une fois par jour ; une ancienne relance, antérieure à la dernière hausse, ne compte plus
      and (q.relancee_at is null or q.relancee_at < q.bloquante_depuis or q.relancee_at < now() - interval '20 hours')
    order by q.bloquante_depuis
  loop
    begin
      perform net.http_post(
        url := 'https://rexnjgvqwdljhtafombh.supabase.co/functions/v1/notifier',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cfv-cle', secret),
        body := jsonb_build_object('table', 'relance', 'id', p.id));
      update pannes set relancee_at = now() where id = p.id;
      envoyees := envoyees + 1;
    exception when others then
      null;   -- on passe à la panne suivante
    end;
  end loop;
  return envoyees;
end $$;
revoke execute on function public.relancer_pannes() from public, anon, authenticated;
