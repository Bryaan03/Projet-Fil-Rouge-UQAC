const client = window.supabaseClient;

let isSignUpMode = true; // Mode inscription par défaut

const titre = document.getElementById('titre');
const description = document.getElementById('description');
const authForm = document.getElementById('auth-form');
const usernameContainer = document.getElementById('username-container');
const usernameInput = document.getElementById('username');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('mdp');
const confirmMdpContainer = document.getElementById('confirm-mdp-container');
const confirmMdpInput = document.getElementById('confirm-mdp');
const connexionOptions = document.getElementById('connexion-options');
const btnSubmit = document.getElementById('btn-submit');
const toggleText = document.getElementById('toggle-text');
const btnToggle = document.getElementById('btn-toggle');
const message = document.getElementById('message');

function updateMode() {
    message.textContent = '';
    if (isSignUpMode) {
        titre.textContent = 'Inscription';
        description.textContent = 'Créez un compte pour accéder à vos conversations';
        usernameContainer.style.display = 'block';
        usernameInput.required = true;
        confirmMdpContainer.style.display = 'block';
        confirmMdpInput.required = true;
        connexionOptions.style.display = 'none';
        btnSubmit.value = "S'inscrire";
        toggleText.textContent = 'Vous avez déjà un compte ?';
        btnToggle.textContent = 'Se connecter';
    } else {
        titre.textContent = 'Connexion';
        description.textContent = 'Connectez-vous pour accéder à vos conversations';
        usernameContainer.style.display = 'none';
        usernameInput.required = false;
        confirmMdpContainer.style.display = 'none';
        confirmMdpInput.required = false;
        connexionOptions.style.display = 'block';
        btnSubmit.value = 'Se connecter';
        toggleText.textContent = "Vous n'avez pas de compte ?";
        btnToggle.textContent = "S'inscrire";
    }
}

updateMode();

btnToggle.addEventListener('click', () => {
    isSignUpMode = !isSignUpMode;
    updateMode();
});

authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!isSignUpMode) {
        message.textContent = 'Connexion en cours...';

        const { error } = await client.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            message.textContent = 'Courriel ou mot de passe invalide.';
            return;
        }

        window.location.href = 'conversation.html';
    } else {
        const username = usernameInput.value.trim();
        const confirmPassword = confirmMdpInput.value;

        if (!username) {
            message.textContent = "Veuillez saisir un nom d'utilisateur pour l'inscription.";
            return;
        }

        if (password !== confirmPassword) {
            message.textContent = 'Les mots de passe ne correspondent pas.';
            return;
        }

        message.textContent = 'Inscription en cours...';

        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: username
                }
            }
        });

        if (error) {
            message.textContent = error.message;
            return;
        }

        if (data?.user) {
            const resProfiles = await client
                .from('profiles')
                .upsert({ id: data.user.id, username: username });


            if (resProfiles.error) {
                message.textContent = `Erreur lors de la création de votre profile : ${resProfiles.error.message}`;
                return;
            }

            if (data.session) {
                window.location.href = 'conversation.html';
            }
        }
    }
});