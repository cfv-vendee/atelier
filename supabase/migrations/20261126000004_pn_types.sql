-- Types de passage à niveau : automatique ou agricole (il n'y en a pas d'autre sur la ligne).
update public.voie_elements set pn_type = null where pn_type = 'manuel';
alter table public.voie_elements drop constraint voie_elements_pn_type_check;
alter table public.voie_elements add constraint voie_elements_pn_type_check check (pn_type in ('auto', 'agricole'));
