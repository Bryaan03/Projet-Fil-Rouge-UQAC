const client = window.supabaseClient;

const conversationsList = document.getElementById('conversations-list');
const chatTitle = document.getElementById('chat-title');

let currentUser = null;

async function getCurrentUser() {
    const { data } = await client.auth.getSession();

    if (!data.session) {
        window.location.href = 'index.html';
        return null;
    }

    currentUser = data.session.user;
}

async function getConversations() {
    if (!currentUser) {
        await getCurrentUser();
        if (!currentUser) return [];
    }

    try {
        // Récupère les ids des conversations que l'utilisateur est membre
        const { data: memberRows, error: memberError } = await client
            .from('conversation_members')
            .select('conversation_id')
            .eq('user_id', currentUser.id);

        if (memberError) {
            console.error('Erreur lors de la récupération des ids des conversations : ', memberError);
            return [];
        }

        if (!memberRows || memberRows.length === 0) {
            return [];
        }

        const conversationIds = memberRows.map(row => row.conversation_id);

        // Récupère les conversations
        const { data: conversations, error: convError } = await client
            .from('conversations')
            .select(`
                id,
                name,
                is_group,
                created_at,
                updated_at,
                conversation_members (
                    user_id,
                    profiles (
                        username
                    )
                ),
                messages (
                    content,
                    created_at,
                    deleted_at
                )
            `)
            .in('id', conversationIds)
            .order('updated_at', { ascending: false });

        console.log(conversations);

        if (convError) {
            console.error('Erreur lors de la récupération des conversations :', convError);
            return [];
        }

        const displayedConversations = conversations.map(conv => {
            const otherMember = conv.conversation_members?.find(m => m.user_id !== currentUser.id);
            const otherUsername = otherMember?.profiles?.username || 'Utilisateur inconnu';

            const displayName = conv.is_group
                ? (conv.name || 'Groupe sans nom')
                : (otherUsername);

            const visibleMessages = conv.messages.filter(msg => !msg.deleted_at);
            visibleMessages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const lastMsg = visibleMessages[0] || null;

            return {
                name: displayName,
                lastMessage: lastMsg ? lastMsg.content : 'Aucun message pour le moment',
                lastMessageDate: lastMsg ? lastMsg.created_at : conv.created_at
            };
        });

        // Trier les conversations
        displayedConversations.sort((a, b) => new Date(b.lastMessageDate) - new Date(a.lastMessageDate));

        return displayedConversations;
    } catch (error) {
        console.error('Erreur dans getConversations :', error);
        return [];
    }
}

function afficherConversations(conversations) {
    if (!conversationsList) return;

    conversationsList.innerHTML = '';

    if (!conversations || conversations.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.textContent = 'Aucune conversation.';
        conversationsList.appendChild(emptyMsg);
        return;
    }

    conversations.forEach((conv) => {
        const item = document.createElement('div');
        item.className = 'conversation-item';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'conv-name';
        nameDiv.textContent = conv.name;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'conv-last-msg';
        msgDiv.textContent = conv.lastMessage;

        item.appendChild(nameDiv);
        item.appendChild(msgDiv);

        item.addEventListener('click', () => {
            document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');

            if (chatTitle) {
                chatTitle.textContent = conv.name;
            }
        });

        conversationsList.appendChild(item);
    });
}

async function initialiser() {
    await getCurrentUser();
    if (!currentUser) return;

    if (conversationsList) {
        conversationsList.innerHTML = '';
        const loadingMsg = document.createElement('p');
        loadingMsg.textContent = 'Chargement des conversations...';
        conversationsList.appendChild(loadingMsg);
    }

    const conversations = await getConversations();
    afficherConversations(conversations);
}

initialiser();
