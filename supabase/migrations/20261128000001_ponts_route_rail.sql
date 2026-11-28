-- « Pont » devient « Pont route » (route qui passe au-dessus de la ligne) ou « Pont rail » (la ligne passe dessus).
alter table public.voie_elements drop constraint voie_elements_genre_check;
alter table public.voie_elements drop constraint voie_elements_check;
update public.voie_elements set genre = 'pont_rail' where genre = 'pont';
alter table public.voie_elements add constraint voie_elements_genre_check check (genre in ('pn','viaduc','pont_route','pont_rail','tunnel','evitement','tiroir'));
alter table public.voie_elements add constraint voie_elements_check check (cle is not null or (genre in ('pn','viaduc','pont_route','pont_rail','tunnel') and pk is not null and nom is not null));
