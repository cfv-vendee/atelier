-- Troisième type de passage à niveau : « non gardé » (route goudronnée, sans système automatique), distinct de l'agricole.
alter table public.voie_elements drop constraint voie_elements_pn_type_check;
alter table public.voie_elements add constraint voie_elements_pn_type_check check (pn_type in ('auto', 'agricole', 'non_garde'));
