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
- [ ] Repères de la voie avec leurs PK : gares, PN numérotés, aiguillages, viaducs/ponts, bornes kilométriques (pour le plan et le calcul du PK par GPS)
- [ ] Numéros réels des 7 boîtes à tonnerre et du fourgon B3Dt (modifiables dans l'appli : fiche engin → « Modifier la fiche »)
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
