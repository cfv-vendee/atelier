-- Notifications sur le téléphone (Web Push).
-- Chaque téléphone qui accepte les notifications enregistre un « abonnement ». À chaque nouveau signalement,
-- prise en charge ou réparation, la base appelle la fonction « notifier », qui prévient les bonnes personnes.

create extension if not exists pg_net with schema extensions;

-- Préférences de chaque membre.
alter table profils add column notifications jsonb not null
  default '{"bloquantes": true, "signalements": true, "suivi": true}';
grant select (notifications) on profils to authenticated;
grant update (notifications) on profils to authenticated;

create table abonnements_push (
  id uuid primary key default gen_random_uuid(),
  membre_id uuid not null references profils (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) < 1000),
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  appareil text check (char_length(appareil) < 200),
  created_at timestamptz not null default now(),
  utilise_at timestamptz
);
create index abonnements_membre_idx on abonnements_push (membre_id);
alter table abonnements_push enable row level security;
create policy "abonnements : les siens" on abonnements_push for select to authenticated using (membre_id = (select auth.uid()));
create policy "abonnements : retirer les siens" on abonnements_push for delete to authenticated using (membre_id = (select auth.uid()));
grant select, delete on abonnements_push to authenticated;
grant all on abonnements_push to service_role;

-- Enregistre l'abonnement de ce téléphone pour le membre connecté
-- (s'il était à quelqu'un d'autre sur le même téléphone, il change de propriétaire).
create function public.enregistrer_abonnement(p_endpoint text, p_p256dh text, p_auth text, p_appareil text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.membre_actif() then raise exception 'Compte non actif.' using errcode = '42501'; end if;
  delete from abonnements_push where endpoint = p_endpoint;
  insert into abonnements_push (membre_id, endpoint, p256dh, auth, appareil)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_appareil, 190));
end $$;
revoke execute on function public.enregistrer_abonnement(text, text, text, text) from public, anon;
grant execute on function public.enregistrer_abonnement(text, text, text, text) to authenticated;

-- Clé interne partagée entre la base et la fonction « notifier » (gardée dans le coffre-fort de Supabase).
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'cfv_notifier') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cfv_notifier', 'Clé interne : appels de la base vers la fonction notifier');
  end if;
end $$;

create function public.verifier_cle_notifier(cle text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'cfv_notifier' and decrypted_secret = cle);
$$;
revoke execute on function public.verifier_cle_notifier(text) from public, anon, authenticated;
grant execute on function public.verifier_cle_notifier(text) to service_role;

-- Appel (asynchrone, sans ralentir l'enregistrement) de la fonction « notifier ».
create function public.appeler_notifier() returns trigger
language plpgsql security definer set search_path = public as $$
declare cle text;
begin
  select decrypted_secret into cle from vault.decrypted_secrets where name = 'cfv_notifier';
  if cle is not null then
    perform net.http_post(
      url := 'https://rexnjgvqwdljhtafombh.supabase.co/functions/v1/notifier',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cfv-cle', cle),
      body := jsonb_build_object('table', tg_table_name, 'id', new.id));
  end if;
  return null;
exception when others then
  return null;   -- une notification ratée ne doit jamais empêcher un signalement
end $$;
revoke execute on function public.appeler_notifier() from public, anon, authenticated;

create trigger notifier_panne after insert on pannes for each row execute function public.appeler_notifier();
create trigger notifier_evenement after insert on evenements for each row
  when (new.type in ('prise_en_charge', 'reparee')) execute function public.appeler_notifier();
