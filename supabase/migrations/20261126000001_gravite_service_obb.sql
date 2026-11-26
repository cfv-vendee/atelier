-- 1. Modifier la gravité d'une anomalie ─────────────────────────────────────────────
-- Un bénévole peut surestimer (« bloquante » alors que c'est « à surveiller »). La gravité d'une
-- panne ne pouvait être changée que par un administrateur : elle l'est maintenant par les
-- techniciens (matériel et voie), les référents voie (voie) et les administrateurs. Les
-- conducteurs et le bureau, eux, ne le peuvent pas. Chaque changement laisse une trace dans
-- l'historique de la panne, avec son auteur.
alter type type_evenement add value if not exists 'gravite';

create function public.changer_gravite(p_panne uuid, p_gravite gravite_panne, p_motif text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  p pannes%rowtype;
  uid uuid := auth.uid();
  autorise boolean;
  nom_g constant jsonb := '{"bloquante":"Bloquante","surveiller":"À surveiller","mineure":"Mineure"}';
  trace text;
begin
  select * into p from pannes where id = p_panne for update;
  if not found then raise exception 'Panne introuvable.'; end if;

  autorise := public.peut_reparer() or (p.cible = 'voie' and public.peut_inspecter());
  if not autorise then
    raise exception 'La gravité ne peut être modifiée que par un technicien, un référent voie ou un administrateur.' using errcode = '42501';
  end if;
  if p.statut = 'reparee' then raise exception 'Cette panne est déjà réparée.'; end if;
  if p.gravite = p_gravite then return; end if;

  trace := (nom_g ->> p.gravite::text) || ' → ' || (nom_g ->> p_gravite::text);
  if nullif(trim(p_motif), '') is not null then trace := trace || E'\n' || trim(p_motif); end if;

  update pannes set gravite = p_gravite, updated_at = now() where id = p_panne;
  insert into evenements (panne_id, auteur_id, type, texte) values (p_panne, uid, 'gravite', trace);
end $$;
revoke execute on function public.changer_gravite(uuid, gravite_panne, text) from public, anon;
grant execute on function public.changer_gravite(uuid, gravite_panne, text) to authenticated;

-- 2. Remise en service : seul le technicien intervenu (ou un administrateur) ─────────
-- Sur une panne BLOQUANTE de matériel, « marquer réparée » (ce qui remet la machine en service)
-- n'est plus ouvert à tous les techniciens : il faut avoir pris la panne en charge ou y être
-- intervenu — depuis sa dernière réouverture, s'il y en a eu une — ou être administrateur.
-- Les autres pannes et la voie ne changent pas.
create or replace function public.peut_agir_panne(p_panne uuid, p_type text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  p pannes%rowtype;
  moi uuid := auth.uid();
  depuis timestamptz;
begin
  select * into p from pannes where id = p_panne;
  if not found then return false; end if;
  if p.cible = 'voie' then return public.peut_inspecter(); end if;
  if p_type = 'commentaire' then return public.peut_signaler(); end if;
  if not public.peut_reparer() then return false; end if;

  if p_type = 'reparee' and p.gravite = 'bloquante' and not public.est_admin() then
    select coalesce(max(created_at), '-infinity') into depuis
      from evenements where panne_id = p.id and type = 'reouverte';
    return p.pris_par = moi
        or exists (select 1 from evenements
                   where panne_id = p.id and auteur_id = moi
                     and type in ('prise_en_charge', 'intervention') and created_at > depuis);
  end if;
  return true;
end $$;

-- 3. Boîtes à tonnerre → ÖBB (la n° 7 est une DRG) ─────────────────────────────────
update engins set designation = regexp_replace(designation, '^Boîte à tonnerre ', 'ÖBB ')
  where designation ~ '^Boîte à tonnerre [1-6]$';
update engins set designation = 'DRG 7' where designation = 'Boîte à tonnerre 7';
update series set nom = 'Voitures ÖBB / DRG (×7)' where code = 'bt';
