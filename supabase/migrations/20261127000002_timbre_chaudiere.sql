-- Timbre de la chaudière (fiche d'homologation) des locomotives à vapeur : date jusqu'à laquelle elle peut être utilisée.
alter table public.engins add column timbre_valide_jusqu date;

-- La vue « select e.* » est figée à sa création : on la recrée pour y ajouter la nouvelle colonne.
drop view public.engins_etat;
create view public.engins_etat with (security_invoker = true) as
select e.*,
  coalesce(s.nom, null) as serie_nom,
  case when jsonb_array_length(e.fiche) > 0 then e.fiche else coalesce(s.fiche, '[]'::jsonb) end as fiche_complete,
  count(p.id) filter (where p.statut <> 'reparee') as pannes_ouvertes,
  case
    when bool_or(p.statut <> 'reparee' and p.gravite = 'bloquante') then 'immobilise'
    when bool_or(p.statut <> 'reparee' and p.gravite <> 'mineure') then 'surveiller'
    else 'service'
  end as etat
from public.engins e
left join public.series s on s.id = e.serie_id
left join public.pannes p on p.engin_id = e.id
group by e.id, s.id;
revoke all on public.engins_etat from anon, public, authenticated;
grant select on public.engins_etat to authenticated;
grant all on public.engins_etat to service_role;
