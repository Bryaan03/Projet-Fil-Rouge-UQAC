const client = window.supabaseClient;

const form = document.getElementById('invite-form');
const contactList = document.getElementById('contact-list');

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    contactList.textContent = '';

    const pseudo = document.getElementById('pseudo').value.trim();

    const { data, error } = await client
        .from('profiles')
        .select('username')
        .ilike('username', `%${pseudo}%`)

        
    if (error || !data || data.length === 0) {
        contactList.textContent = 'Aucun contact trouvé.';
        return;
    }

    data.forEach((contact) => {
        const p = document.createElement('p');
        p.textContent = `Contact trouvé : ${contact.username} `;

        const lien = document.createElement('a');
        lien.textContent = 'Message';
        lien.href = 'conversation.html';

        p.appendChild(lien);
        contactList.appendChild(p);
    });
});
