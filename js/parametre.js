// js/parametre.js
const ParamManager = {
  client: null,
  currentUser: null,
  currentUsername: "",
  currentAvatarDataUrl: null,

  init() {
    this.client = window.supabaseClient;
    this.cacheDOM();
    this.initTheme();
    this.bindEvents();
    this.loadProfile();
  },

  cacheDOM() {
    this.emailInput = document.getElementById("email");
    this.pseudoInput = document.getElementById("pseudo");
    this.statutSelect = document.getElementById("statut");
    this.avatarInput = document.getElementById("avatar-input");
    this.avatarPreview = document.getElementById("avatar-preview");
    this.themeToggle = document.getElementById("theme-toggle");
    this.formProfil = document.getElementById("form-profil");
    this.btnLogout = document.getElementById("btn-logout");
    this.btnDelete = document.getElementById("btn-delete");
    this.message = document.getElementById("message");
  },

  initTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.body.classList.add("dark-mode");
      if (this.themeToggle) this.themeToggle.checked = true;
    }
  },

  // Compresse la photo en 150x150 JPEG via FileReader + Canvas pour un enregistrement instantané
  compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 150;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");

        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
        callback(compressedDataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  },

  bindEvents() {
    if (this.themeToggle) {
      this.themeToggle.addEventListener("change", () => {
        if (this.themeToggle.checked) {
          document.body.classList.add("dark-mode");
          localStorage.setItem("theme", "dark");
        } else {
          document.body.classList.remove("dark-mode");
          localStorage.setItem("theme", "light");
        }
      });
    }

    if (this.avatarInput) {
      this.avatarInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        this.compressImage(file, (dataUrl) => {
          this.currentAvatarDataUrl = dataUrl;
          this.avatarPreview.src = dataUrl;
        });
      });
    }

    this.formProfil.addEventListener("submit", (e) =>
      this.handleSaveProfile(e),
    );
    this.btnLogout.addEventListener("click", () => this.handleLogout());
    this.btnDelete.addEventListener("click", () => this.handleDeleteAccount());
  },

  async loadProfile() {
    // 1. Affichage immédiat depuis localStorage
    const savedLocal = localStorage.getItem("currentUser");
    if (savedLocal) {
      try {
        const parsed = JSON.parse(savedLocal);
        if (parsed.id)
          this.currentUser = { id: parsed.id, email: parsed.email };
        if (parsed.email) this.emailInput.value = parsed.email;
        if (parsed.pseudo) {
          this.currentUsername = parsed.pseudo;
          this.pseudoInput.value = parsed.pseudo;
        }
        if (parsed.status && this.statutSelect)
          this.statutSelect.value = parsed.status;

        // Priorité à l'avatar sauvegardé localement pour cet utilisateur
        const savedAvatar =
          (parsed.id && localStorage.getItem(`avatar_${parsed.id}`)) ||
          parsed.avatar;
        if (savedAvatar && this.avatarPreview) {
          this.avatarPreview.src = savedAvatar;
          this.currentAvatarDataUrl = savedAvatar;
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (!this.client) return;

    try {
      // 2. Récupération de la session Supabase
      const { data } = await this.client.auth.getSession();

      if (!data?.session) {
        if (!this.currentUser) {
          window.location.replace("index.html");
        }
        return;
      }

      this.currentUser = data.session.user;
      this.emailInput.value = this.currentUser.email || "";

      // 3. Récupération depuis la table profiles
      const { data: profile } = await this.client
        .from("profiles")
        .select("*")
        .eq("id", this.currentUser.id)
        .maybeSingle();

      if (profile) {
        if (profile.username) {
          this.currentUsername = profile.username;
          this.pseudoInput.value = profile.username;
        }
        if (profile.bio && this.statutSelect) {
          this.statutSelect.value = profile.bio;
        }
        // Si Supabase a un avatar_url valide, on le prend, sinon on garde l'avatar local
        const localAvatar = localStorage.getItem(
          `avatar_${this.currentUser.id}`,
        );
        const bestAvatar = profile.avatar_url || localAvatar;
        if (bestAvatar && this.avatarPreview) {
          this.avatarPreview.src = bestAvatar;
          this.currentAvatarDataUrl = bestAvatar;
        }
      }
    } catch (err) {
      console.error("Erreur chargement profil :", err);
    }
  },

  async handleSaveProfile(e) {
    e.preventDefault();
    this.message.textContent = "";

    const nouveauPseudo = this.pseudoInput.value.trim();
    const nouveauStatut = this.statutSelect
      ? this.statutSelect.value
      : "Disponible";

    if (!nouveauPseudo) {
      this.message.style.color = "#dc3545";
      this.message.textContent = "Le pseudo ne peut pas être vide.";
      return;
    }

    this.message.style.color = "gray";
    this.message.textContent = "Enregistrement en cours...";

    try {
      const userId = this.currentUser?.id || "local";

      // Sauvegarder immédiatement l'avatar dans une clé dédiée persistante
      if (this.currentAvatarDataUrl) {
        localStorage.setItem(`avatar_${userId}`, this.currentAvatarDataUrl);
      }

      if (this.client && this.currentUser?.id) {
        if (
          nouveauPseudo.toLowerCase() !== this.currentUsername.toLowerCase()
        ) {
          const { data: existing } = await this.client
            .from("profiles")
            .select("id")
            .ilike("username", nouveauPseudo)
            .maybeSingle();

          if (existing && existing.id !== this.currentUser.id) {
            this.message.style.color = "#dc3545";
            this.message.textContent = "Ce nom d'utilisateur est déjà pris.";
            return;
          }
        }

        // Utilisation de upsert pour forcer l'écriture dans profiles
        const updates = {
          id: this.currentUser.id,
          username: nouveauPseudo,
          bio: nouveauStatut,
          avatar_url: this.currentAvatarDataUrl,
        };

        const { error: errUpdate } = await this.client
          .from("profiles")
          .upsert(updates);

        if (errUpdate) {
          console.warn("Avertissement colonnes profiles :", errUpdate.message);
          await this.client
            .from("profiles")
            .upsert({ id: this.currentUser.id, username: nouveauPseudo });
        }

        await this.client.auth.updateUser({
          data: {
            username: nouveauPseudo,
            status: nouveauStatut,
          },
        });
      }

      this.currentUsername = nouveauPseudo;
      const finalAvatar =
        this.currentAvatarDataUrl ||
        localStorage.getItem(`avatar_${userId}`) ||
        this.avatarPreview.src;

      localStorage.setItem(
        "currentUser",
        JSON.stringify({
          id: userId,
          email: this.emailInput.value,
          pseudo: nouveauPseudo,
          status: nouveauStatut,
          avatar: finalAvatar,
        }),
      );

      this.avatarPreview.src = finalAvatar;
      this.message.style.color = "#28a745";
      this.message.textContent = "Modifications enregistrées avec succès !";
    } catch (err) {
      console.error(err);
      this.message.style.color = "#dc3545";
      this.message.textContent = "Erreur : " + err.message;
    }
  },

  async handleLogout() {
    const client = this.client || window.supabaseClient;
    if (client) {
      try {
        await client.auth.signOut({ scope: "local" });
      } catch (e) {
        console.error("Erreur signOut :", e);
      }
    }

    localStorage.removeItem("currentUser");
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("sb-") || key.includes("supabase")) {
        localStorage.removeItem(key);
      }
    });
    sessionStorage.clear();

    window.location.replace("index.html?logout=1");
  },

  async handleDeleteAccount() {
    const confirmation = confirm(
      "Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.",
    );
    if (!confirmation) return;

    const client = this.client || window.supabaseClient;
    if (client && this.currentUser?.id) {
      try {
        await client.from("profiles").delete().eq("id", this.currentUser.id);
        await client.auth.signOut({ scope: "local" });
      } catch (e) {
        console.error(e);
      }
    }

    localStorage.removeItem("currentUser");
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("sb-") || key.includes("supabase")) {
        localStorage.removeItem(key);
      }
    });
    sessionStorage.clear();

    window.location.replace("index.html?logout=1");
  },
};

document.addEventListener("DOMContentLoaded", () => ParamManager.init());
