-- Appel léger utilisé par une tâche automatique pour éviter la mise en pause du projet gratuit.
create function public.ping() returns boolean language sql stable security invoker as $$ select true $$;
grant execute on function public.ping() to anon, authenticated;
