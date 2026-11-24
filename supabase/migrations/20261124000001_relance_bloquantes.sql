-- Relance automatique des pannes bloquantes laissées sans prise en charge.
-- Réglages retenus : première relance après 24 h, puis une par jour, seulement entre 8h et 21h
-- (heure de Paris). Tout est regroupé dans la table « parametres » pour être modifiable sans
-- toucher au code.

create extension if not exists pg_cron with schema extensions;

-- Date de la dernière relance envoyée, pour ne pas prévenir plusieurs fois le même jour.
alter table public.pannes add column if not exists relancee_at timestamptz;

-- Réglages, modifiables par un administrateur (politique « parametres » existante).
insert into public.parametres (cle, valeur) values
  ('relance_heures', '24'::jsonb),
  ('relance_debut', '8'::jsonb),
  ('relance_fin', '21'::jsonb)
on conflict (cle) do nothing;

-- Parcourt les pannes bloquantes encore ouvertes et demande une notification pour chacune.
-- Volontairement tolérante : une relance qui échoue ne doit jamais faire échouer la tâche.
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
  select coalesce((select (valeur #>> '{}')::integer from parametres where cle = 'relance_heures'), 24) into delai;
  select coalesce((select (valeur #>> '{}')::integer from parametres where cle = 'relance_debut'), 8) into debut;
  select coalesce((select (valeur #>> '{}')::integer from parametres where cle = 'relance_fin'), 21) into fin;

  -- Pas de relance la nuit : celles qui seraient dues attendent la première heure ouvrable.
  heure := extract(hour from (now() at time zone 'Europe/Paris'));
  if heure < debut or heure >= fin then return 0; end if;

  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cfv_notifier';
  if secret is null then return 0; end if;

  for p in
    select id from pannes
    where gravite = 'bloquante'
      and statut = 'ouverte'                                   -- personne ne s'en est encore chargé
      and created_at < now() - make_interval(hours => delai)
      and (relancee_at is null or relancee_at < now() - interval '20 hours')   -- une fois par jour
    order by created_at
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

-- Une fois par heure : la fonction décide elle-même si l'heure est ouvrable et si le délai est écoulé.
select cron.unschedule('relance-pannes-bloquantes')
where exists (select 1 from cron.job where jobname = 'relance-pannes-bloquantes');
select cron.schedule('relance-pannes-bloquantes', '7 * * * *', $$select public.relancer_pannes()$$);
