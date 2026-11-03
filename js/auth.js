// js/auth.js
const AuthManager = {
  client: null,
  isSignUpMode: false,

  init() {
    this.client = window.supabaseClient;
    this.cacheDOM();
    this.applySavedTheme();
    this.bindEvents();
    this.updateMode();

    if (!this.client) {
      this.message.style.color = "#dc3545";
      this.message.textContent =
        "Erreur : supabaseClient.js introuvable (vérifiez ../supabaseClient.js).";
      return;
    }

    this.checkExistingSession();
  },

  cacheDOM() {
    this.titre = document.getElementById("titre");
    this.description = document.getElementById("description");
    this.authForm = document.getElementById("auth-form");
    this.usernameContainer = document.getElementById("username-container");
    this.usernameInput = document.getElementById("username");
    this.emailInput = document.getElementById("email");
    this.passwordInput = document.getElementById("mdp");
    this.confirmMdpContainer = document.getElementById("confirm-mdp-container");
    this.confirmMdpInput = document.getElementById("confirm-mdp");
    this.connexionOptions = document.getElementById("connexion-options");
    this.btnSubmit = document.getElementById("btn-submit");
    this.toggleText = document.getElementById("toggle-text");
    this.btnToggle = document.getElementById("btn-toggle");
    this.message = document.getElementById("message");

    this.errUsername = document.getElementById("err-username");
    this.errEmail = document.getElementById("err-email");
    this.errMdp = document.getElementById("err-mdp");
    this.errConfirm = document.getElementById("err-confirm");
  },

  applySavedTheme() {
    if (localStorage.getItem("theme") === "dark") {
      document.body.classList.add("dark-mode");
    }
  },

  async checkExistingSession() {
    try {
      // Si on vient de cliquer sur "Se déconnecter", on nettoie tout et on reste sur index.html
      const params = new URLSearchParams(window.location.search);
      if (params.get("logout") === "1") {
        localStorage.removeItem("currentUser");
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith("sb-") || key.includes("supabase")) {
            localStorage.removeItem(key);
          }
        });
        if (this.client) {
          await this.client.auth.signOut({ scope: "local" });
        }
        window.history.replaceState({}, document.title, "index.html");
        return;
      }

      const { data } = await this.client.auth.getSession();
      if (data?.session) {
        await this.syncLocalUser(data.session.user);
        window.location.href = "conversation.html";
      }
    } catch (err) {
      console.error("Erreur session:", err);
    }
  },

  async syncLocalUser(user, extra = {}) {
    let profileData = null;
    try {
      const { data } = await this.client
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      profileData = data;
    } catch (e) {
      console.error(e);
    }

    const savedAvatar = localStorage.getItem(`avatar_${user.id}`);

    const currentUserData = {
      id: user.id,
      email: user.email,
      pseudo:
        extra.username ||
        profileData?.username ||
        user.user_metadata?.username ||
        "Utilisateur",
      avatar:
        extra.avatar_url ||
        profileData?.avatar_url ||
        savedAvatar ||
        user.user_metadata?.avatar_url ||
        `https://i.pravatar.cc/150?u=${user.id}`,
      status:
        extra.status ||
        profileData?.bio ||
        user.user_metadata?.status ||
        "Disponible",
    };
    localStorage.setItem("currentUser", JSON.stringify(currentUserData));
  },

  clearErrors() {
    this.message.textContent = "";
    if (this.errUsername) this.errUsername.textContent = "";
    if (this.errEmail) this.errEmail.textContent = "";
    if (this.errMdp) this.errMdp.textContent = "";
    if (this.errConfirm) this.errConfirm.textContent = "";
  },

  updateMode() {
    this.clearErrors();
    if (this.isSignUpMode) {
      this.titre.textContent = "Inscription";
      this.description.textContent =
        "Créez un compte pour accéder à vos conversations";
      this.usernameContainer.style.display = "block";
      this.confirmMdpContainer.style.display = "block";
      this.connexionOptions.style.display = "none";
      this.btnSubmit.value = "S'inscrire";
      this.toggleText.textContent = "Vous avez déjà un compte ?";
      this.btnToggle.textContent = "Se connecter";
    } else {
      this.titre.textContent = "Connexion";
      this.description.textContent =
        "Connectez-vous pour accéder à vos conversations";
      this.usernameContainer.style.display = "none";
      this.confirmMdpContainer.style.display = "none";
      this.connexionOptions.style.display = "block";
      this.btnSubmit.value = "Se connecter";
      this.toggleText.textContent = "Vous n'avez pas de compte ?";
      this.btnToggle.textContent = "S'inscrire";
    }
  },

  bindEvents() {
    this.btnToggle.addEventListener("click", () => {
      this.isSignUpMode = !this.isSignUpMode;
      this.updateMode();
    });

    this.authForm.addEventListener("submit", (e) => this.handleSubmit(e));
  },

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  async handleSubmit(event) {
    event.preventDefault();
    this.clearErrors();

    if (!this.client) {
      this.message.style.color = "#dc3545";
      this.message.textContent = "Erreur : supabaseClient.js non chargé.";
      return;
    }

    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;
    let hasError = false;

    if (!this.isValidEmail(email)) {
      this.errEmail.textContent = "Format d’adresse courriel invalide.";
      hasError = true;
    }

    if (!password) {
      this.errMdp.textContent = "Veuillez saisir un mot de passe.";
      hasError = true;
    }

    try {
      if (!this.isSignUpMode) {
        if (hasError) return;
        this.message.style.color = "gray";
        this.message.textContent = "Connexion en cours...";

        const { data, error } = await this.client.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          this.errMdp.textContent = "Courriel ou mot de passe invalide.";
          this.message.textContent = "";
          return;
        }

        await this.syncLocalUser(data.user);
        window.location.href = "conversation.html";
      } else {
        const username = this.usernameInput.value.trim();
        const confirmPassword = this.confirmMdpInput.value;

        if (!username) {
          this.errUsername.textContent =
            "Veuillez saisir un nom d'utilisateur.";
          hasError = true;
        }

        if (password.length < 6) {
          this.errMdp.textContent =
            "Le mot de passe doit contenir au moins 6 caractères.";
          hasError = true;
        }

        if (password !== confirmPassword) {
          this.errConfirm.textContent =
            "Les mots de passe ne correspondent pas.";
          hasError = true;
        }

        if (hasError) return;

        this.message.style.color = "gray";
        this.message.textContent = "Vérification du pseudo...";

        const { data: pseudoExiste } = await this.client
          .from("profiles")
          .select("id")
          .ilike("username", username)
          .maybeSingle();

        if (pseudoExiste) {
          this.errUsername.textContent = "Ce nom d'utilisateur est déjà pris.";
          this.message.textContent = "";
          return;
        }

        this.message.textContent = "Inscription en cours...";

        const { data, error } = await this.client.auth.signUp({
          email,
          password,
          options: { data: { username, status: "Disponible" } },
        });

        if (error) {
          this.message.style.color = "#dc3545";
          this.message.textContent = error.message;
          return;
        }

        if (data?.user) {
          await this.client.from("profiles").upsert({
            id: data.user.id,
            username: username,
          });

          await this.syncLocalUser(data.user, {
            username,
            status: "Disponible",
          });
          if (data.session) {
            window.location.href = "conversation.html";
          } else {
            this.message.style.color = "#28a745";
            this.message.textContent =
              "Compte créé ! Vous pouvez vous connecter.";
          }
        }
      }
    } catch (err) {
      console.error(err);
      this.message.style.color = "#dc3545";
      this.message.textContent = "Erreur technique : " + err.message;
    }
  },
};

document.addEventListener("DOMContentLoaded", () => AuthManager.init());
