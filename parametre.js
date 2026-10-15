const client = window.supabaseClient;

const emailInput = document.getElementById('email');
const pseudoInput = document.getElementById('pseudo');
const formPseudo = document.getElementById('form-pseudo');
const btnLogout = document.getElementById('btn-logout');
const btnDelete = document.getElementById('btn-delete');
const message = document.getElementById('message');

let currentUser = null;
let currentUsername = '';

async function loadProfile() {
    const { data } = await client.auth.getSession();

    if (!data.session) {
        window.location.href = 'index.html';
        return;
    }

    currentUser = data.session.user;
    emailInput.value = data.session.user.email;

    if (data.session.user.user_metadata?.username) {
        currentUsername = data.session.user.user_metadata.username;
        pseudoInput.value = data.session.user.user_metadata.username;
    } 
}

formPseudo.addEventListener('submit', async (e) => {
    e.preventDefault();
    message.textContent = '';
    message.style.color = 'black';

    const nouveauPseudo = pseudoInput.value.trim();

    if (!nouveauPseudo) {
        message.style.color = 'red';
        message.textContent = "Le pseudo ne peut pas être vide.";
        return;
    }

    if (nouveauPseudo.toLowerCase() === currentUsername.toLowerCase()) {
        message.style.color = 'orange';
        message.textContent = "C'est déjà votre pseudo actuel.";
        return;
    }

    message.textContent = "Vérification...";

    const { data } = await client
        .from('profiles')
        .select('id')
        .ilike('username', nouveauPseudo)
        .maybeSingle();

    if (data) {
        message.style.color = 'red';
        message.textContent = "Ce nom d'utilisateur est déjà pris.";
        return;
    }

    const { error } = await client
        .from('profiles')
        .update({ username: nouveauPseudo })
        .eq('id', currentUser.id);

    if (error) {
        message.style.color = 'red';
        message.textContent = "Erreur lors de la modification : " + error.message;
        return;
    }

    currentUsername = nouveauPseudo;
    await client.auth.updateUser({ data: { username: nouveauPseudo } });
    message.style.color = 'green';
    message.textContent = "Pseudo modifié avec succès !";
});

btnLogout.addEventListener('click', async () => {
    await client.auth.signOut();
    window.location.href = 'index.html';
});

btnDelete.addEventListener('click', async () => {
    const confirmation = confirm("Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.");
    if (!confirmation) return;

    await client
        .from('profiles')
        .delete()
        .eq('id', currentUser.id);

    await client.auth.signOut();
    window.location.href = 'index.html';
});

loadProfile();
