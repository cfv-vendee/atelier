# À faire plus tard (côté Malo)

Actions mises de côté le 23/11/2026, à reprendre quand ce sera possible.

## Réglages Supabase (projet cfv-atelier, *Authentication*)
- [ ] Vérifier que les inscriptions libres sont fermées (*Sign In / Providers → Email → Allow new users to sign up* : désactivé)
- [ ] Longueur minimale du mot de passe : 8 caractères
- [ ] Activer « Leaked password protection »
- [ ] Vérifier *URL Configuration* : Site URL `https://cfv-vendee.github.io/atelier/` et Redirect URL `https://cfv-vendee.github.io/atelier/**`

## Envoi des e-mails (bloque l'invitation des membres)
- [ ] Choisir l'adresse expéditrice (adresse de l'association de préférence)
- [ ] Créer un compte Brevo (gratuit) et brancher son SMTP dans Supabase (*Authentication → Emails → SMTP*)
- [ ] Ensuite : modèles d'e-mails en français (invitation, mot de passe oublié) — Claude fournit les textes

## Données de l'association
- [ ] Mise en route du module Voie (plan + calcul automatique du PK par GPS) — suivre la notice « Module Voie — notice de mise en route » (https://claude.ai/artifact/VRqfoi2Gqhnt3CC6q6pJL6) :
  - [x] Référence des PK : bornes SNCF, du PK 37 au PK 55 (reste à confirmer le sens, croissant depuis Mortagne ou depuis Les Herbiers)
  - [ ] Vérifier le tracé de la ligne préparé par Claude (début/fin, voies annexes)
  - [ ] Relever sur le terrain les repères PK (une borne par km + extrémités) avec l'écran *Voie → Configuration de la voie : relevé des repères PK* (ou à la main : PK, latitude, longitude, précision, photo)
  - [ ] Relever les points remarquables : gares, PN numérotés, ponts/viaducs, aiguillages, heurtoirs, zones sans réseau
  - [ ] Prévenir Claude quand le relevé est fini (il lit les repères directement dans la base), puis contrôle sur le terrain (écart < 20 m)
  - [ ] Quand tout est bon : « Terminer la configuration de la voie » (l'écran de relevé disparaît)
- [ ] Numéros réels des 7 voitures ÖBB / DRG et du fourgon B3Dt (modifiables dans l'appli : fiche engin → « Modifier la fiche »)
- [ ] Vérifier la fiche du Y 7303 (deux descriptions différentes)
- [ ] Une photo de chaque engin
- [ ] Logo du CFV en haute définition (icône d'appli nette)

## Vérifications
- [ ] Faire un vrai signalement avec photo, puis le supprimer (bouton administrateur)
- [ ] Tester le scanner QR et le mode hors connexion (mode Avion) sur l'iPhone
- [ ] GitHub : organisation `cfv-vendee` → *People* → présence en « Private »
- [ ] Ajouter un second propriétaire (adresse de l'association ou du président) sur GitHub et Supabase

## Décisions à faire valider par le président
- [ ] Nom de l'appli (« CFV Atelier »), administrateurs, validation de la remise en service après une panne bloquante, son des notifications
