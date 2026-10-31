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

async function openOrCreateConversation(contact) {
    if (!currentUser) {
        await getCurrentUser();
        if (!currentUser) return;
    }

    try {
        // Récupère toutes les conversations de l'utilisateur
        const { data: userConversationList, error: userConversationListError } = await client
            .from('conversation_members')
            .select('conversation_id')
            .eq('user_id', currentUser.id);

        if (userConversationListError) {
            console.error('Erreur lors de la récupération des conversations utilisateur :', userConversationListError);
            alert('Une erreur est survenue.');
            return;
        }

        // Récupère toutes les conversations du contact
        const { data: contactConversation, error: contactConversationError } = await client
            .from('conversation_members')
            .select('conversation_id')
            .eq('user_id', contact.id);

        if (contactConversationError) {
            console.error('Erreur lors de la récupération des conversations contact :', contactConversationError);
            alert('Une erreur est survenue.');
            return;
        }

        const userIds = userConversationList.map(m => m.conversation_id);
        const contactIds = contactConversation.map(m => m.conversation_id);
        const commonIds = userIds.filter(id => contactIds.includes(id));

        // Vérifie si une conversation existe déjà entre les deux utilisateurs
        if (commonIds.length > 0) {
            const { data: privateConversation, error: privateConversationError } = await client
                .from('conversations')
                .select('id')
                .in('id', commonIds)
                .eq('is_group', false)
                .limit(1);

            if (privateConversation.length == 1) {
                window.location.href = `conversation.html?id=${privateConversation[0].id}`;
                return;
            } else if (privateConversationError) {
                console.error('Erreur lors de la récupération de la conversation privée :', privateConversationError);
                alert('Une erreur est survenue.');
                return;
            }
        }

        // Si aucune conversation existe, alors on la crée
        const { data: newConv, error: createError } = await client
            .from('conversations')
            .insert({
                is_group: false,
                created_by: currentUser.id
            })
            .select('id')
            .single();

        if (createError) {
            console.error('Erreur lors de la création de la conversation :', createError);
            alert('Impossible de créer la conversation.');
            return;
        }

        const { error: insertMembersError } = await client
            .from('conversation_members')
            .insert([
                { conversation_id: newConv.id, user_id: currentUser.id },
                { conversation_id: newConv.id, user_id: contact.id }
            ]);

        if (insertMembersError) {
            console.error(`Erreur lors de l'ajout des participants :`, insertMembersError);
            alert(`Erreur lors de l'ajout des participants.`);
            return;
        }

        window.location.href = `conversation.html?id=${newConv.id}`;
    } catch (err) {
        console.error('Erreur dans openOrCreateConversation :', err);
        alert('Une erreur est survenue.');
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!currentUser) {
        await getCurrentUser();
        if (!currentUser) return;
    }

    const pseudo = pseudoInput.value.trim();
    if (!pseudo) return;

    contactList.textContent = 'Recherche en cours...';

    const { data, error } = await client
        .from('profiles')
        .select('id, username')
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

        lien.addEventListener('click', async (e) => {
            e.preventDefault();
            lien.textContent = 'Ouverture...';
            await openOrCreateConversation(contact);
            lien.textContent = 'Message';
        });

        p.appendChild(lien);
        contactList.appendChild(p);
    });
});
