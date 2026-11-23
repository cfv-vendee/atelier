-- Clés d'envoi des notifications (VAPID) : créées par la fonction « notifier » à sa première utilisation
-- et gardées ici. Table fermée : seule la fonction serveur (service_role) y accède.
create table cles_push (
  id smallint primary key default 1 check (id = 1),
  publique text not null,
  privee jsonb not null,
  created_at timestamptz not null default now()
);
alter table cles_push enable row level security;
revoke all on cles_push from public, anon, authenticated;
grant all on cles_push to service_role;
