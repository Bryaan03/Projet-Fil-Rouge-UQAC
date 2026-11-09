# 💬 Web Messagerie (UQAC)

Une application web de messagerie instantanée en temps réel inspirée du design **Apple iMessage**, conçue en JavaScript Vanilla et propulsée par **Supabase**.

---

## ✨ Fonctionnalités principales

- 🔐 **Authentification** : Inscription et connexion sécurisées avec Supabase Auth.
- ⚡ **Messagerie en temps réel** : Envoi et réception instantanés de messages texte.
- 📎 **Multimédia complet** :
  - Partage de photos, vidéos et documents.
  - Enregistreur de messages vocaux intégré.
  - Recherche et envoi de GIFs animés (API Giphy).
  - Partage de position géographique GPS (Google Maps).
- **Réactions** : Ajout d'émojis sur les messages (❤️, 👍, 😂, 😮, 😢).
- **Annulation d'envoi** : Possibilité d'annuler un message envoyé.
- 🌙 **Mode sombre** : Thème clair / sombre automatique avec persistance locale.

---

## 🛠️ Technologies utilisées

- **Frontend** : HTML5, CSS3, JavaScript Vanilla.
- **Backend as a Service** : [Supabase](https://supabase.com/)
  - **Auth** : Gestion des utilisateurs et sessions.
  - **PostgreSQL Database** : Stockage des messages, conversations et profils.
  - **Realtime** : Synchronisation instantanée via WebSockets.
  - **Storage** : Stockage des médias et fichiers joints.

---

## 📁 Structure du projet

```text
├── index.html            # Page d'accueil (Connexion / Inscription)
├── supabaseClient.js     # Configuration du client Supabase
├── html/
│   ├── conversation.html # Interface principale de messagerie
│   ├── contact.html      # Recherche et création de conversations
│   └── parametre.html    # Paramètres du compte et thème
├── css/
│   ├── base.css          # Variables globales et Dark Mode
│   ├── auth.css          # Styles de connexion/inscription
│   ├── conversation.css  # Styles iMessage et responsive chat
│   ├── contact.css       # Styles recherche de contact
│   └── parametre.css     # Styles profil et paramètres
└── js/
    ├── auth.js           # Logique de connexion / inscription
    ├── conversation.js   # Logique temps réel, chat et médias
    ├── contact.js        # Recherche d'utilisateurs
    └── parametre.js      # Gestion du profil et du thème
```
