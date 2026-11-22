# CFV Atelier

Application réservée aux membres du Chemin de fer de la Vendée : signalement et suivi des pannes
du matériel roulant et de la voie (Mortagne-sur-Sèvre → Les Herbiers, 22 km).

Application web installable (PWA), sans étape de compilation : HTML, CSS et JavaScript.
Données et comptes : Supabase (base PostgreSQL, authentification, stockage des photos).

## Étape 1 (cette version)

- Connexion par e-mail et mot de passe, invitation des membres par un administrateur
- Rôles : Bureau (lecture seule), Conducteur, Conducteur + technicien, Technicien, et droit Administrateur
- Signalement matériel ou voie (PK, position GPS), gravité, photos
- Suivi : prise en charge, interventions, réparation, réouverture, commentaires — tout est historisé
- Parc matériel réel (24 engins) avec fiches techniques et état calculé automatiquement
- Profil, administration des membres

À venir : notifications (et son « tchou tchou »), plan interactif et localisation PK automatique,
mode hors connexion pour les signalements, tournée d'inspection, QR codes, entretiens, exports.

## Mode démonstration

Si `js/config.js` est vide, l'appli tourne sans base : profils de démonstration, données dans le navigateur.

    python3 -m http.server 8000   # puis ouvrir http://localhost:8000

## Mise en service

1. Créer le projet Supabase (région Paris) et appliquer, dans l'ordre :
   `supabase/migrations/20261122000001_init.sql` puis `20261122000002_parc.sql`.
2. Déployer la fonction `supabase/functions/invite-membre`.
3. Authentification Supabase : désactiver les inscriptions libres ; adresse du site = adresse de l'appli.
4. Créer le premier compte administrateur, puis l'activer :
   `update profils set actif = true, est_admin = true, role = 'conducteur_technicien', prenom = '…', nom = '…' where email = '…';`
5. Renseigner `js/config.js` (adresse du projet et clé publique « anon »).
6. Publier le dépôt avec GitHub Pages.

## Sécurité

Les droits sont vérifiés par la base (règles RLS) : un conducteur ne peut pas déclarer une réparation,
un membre ne peut pas modifier son propre rôle, un compte non activé ne voit rien.
Seule la fonction `invite-membre`, côté serveur, crée des comptes et attribue les rôles.
