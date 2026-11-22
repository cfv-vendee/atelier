-- Droits explicites sur les tables (les règles RLS filtrent ensuite ligne par ligne).
-- Les projets Supabase récents ne les accordent plus automatiquement.
revoke all on profils, series, engins, engins_etat, pannes, evenements, photos from anon, authenticated;
grant select, update on profils to authenticated;
grant select, insert, update, delete on series, engins, pannes to authenticated;
grant select, insert on evenements, photos to authenticated;
grant select on engins_etat to authenticated;
grant all on profils, series, engins, engins_etat, pannes, evenements, photos to service_role;
