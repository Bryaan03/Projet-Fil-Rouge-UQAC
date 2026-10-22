const client = window.supabaseClient;

const form = document.getElementById('invite-form');
const pseudoInput = document.getElementById('pseudo');  
const contactList = document.getElementById('contact-list');

let currentUser = null;

async function getCurrentUser() {
    const { data } = await client.auth.getSession();

    if (!data.session) {
        window.location.href = 'index.html';
        return null;
    }
    currentUser = data.session.user;
}

getCurrentUser();

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!currentUser) return;

    const pseudo = pseudoInput.value.trim();
    if (!pseudo) return;

    contactList.textContent = 'Recherche en cours...';

    const { data, error } = await client
        .from('profiles')
        .select('username')
        .ilike('username', `%${pseudo}%`)
        .neq('id', currentUser.id);

    contactList.textContent = '';

    if (error) {
        contactList.textContent = 'Erreur lors de la recherche.';
        return;
    }

    if (!data || data.length === 0) {
        contactList.textContent = 'Aucun contact trouvé.';
        return;
    }

    data.forEach((contact) => {
        const p = document.createElement('p');
        p.textContent = `${contact.username} `;

        const lien = document.createElement('a');
        lien.textContent = 'Message';
        lien.href = 'conversation.html';

        p.appendChild(lien);
        contactList.appendChild(p);
    });
});
