const client = window.supabaseClient;

const conversationsList = document.getElementById("conversations-list");
const chatTitle = document.getElementById("chat-title");
const messagesContainer = document.getElementById("messages-container");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

let currentUser = null;
let currentConversationId = null;

if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark-mode");
}

async function getCurrentUser() {
  const { data } = await client.auth.getSession();

  if (!data.session) {
    window.location.href = "index.html";
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
    const { data: memberRows, error: memberError } = await client
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", currentUser.id);

    if (memberError || !memberRows || memberRows.length === 0) {
      return [];
    }

    const conversationIds = memberRows.map((row) => row.conversation_id);

    const { data: conversations, error: convError } = await client
      .from("conversations")
      .select(
        `
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
            `,
      )
      .in("id", conversationIds)
      .order("updated_at", { ascending: false });

    if (convError) {
      console.error(
        "Erreur lors de la récupération des conversations :",
        convError,
      );
      return [];
    }

    const displayedConversations = conversations.map((conv) => {
      const otherMember = conv.conversation_members?.find(
        (m) => m.user_id !== currentUser.id,
      );
      const otherUsername =
        otherMember?.profiles?.username || "Utilisateur inconnu";

      const displayName = conv.is_group
        ? conv.name || "Groupe sans nom"
        : otherUsername;

      const visibleMessages = (conv.messages || []).filter(
        (msg) => !msg.deleted_at,
      );
      visibleMessages.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at),
      );
      const lastMsg = visibleMessages[0] || null;

      return {
        id: conv.id,
        name: displayName,
        lastMessage: lastMsg ? lastMsg.content : "Aucun message pour le moment",
        lastMessageDate: lastMsg ? lastMsg.created_at : conv.created_at,
      };
    });

    displayedConversations.sort(
      (a, b) => new Date(b.lastMessageDate) - new Date(a.lastMessageDate),
    );
    return displayedConversations;
  } catch (error) {
    console.error("Erreur dans getConversations :", error);
    return [];
  }
}

async function getMessages(conversationId) {
  try {
    const { data: messages, error } = await client
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) return [];
    return messages;
  } catch (error) {
    console.error("Erreur dans getMessages :", error);
    return [];
  }
}

function afficherMessages(messages) {
  if (!messagesContainer) return;

  messagesContainer.innerHTML = "";

  if (!messages || messages.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "chat-empty-messages";
    emptyMsg.textContent = "Aucun message pour le moment.";
    messagesContainer.appendChild(emptyMsg);
    return;
  }

  messages.forEach((msg) => {
    const messageDiv = document.createElement("div");
    const isSent = msg.sender_id === currentUser.id;
    messageDiv.className = `chat-message ${isSent ? "sent" : "received"}`;

    const p = document.createElement("p");
    p.className = "chat-message-text";
    p.textContent = msg.content;
    messageDiv.appendChild(p);

    messagesContainer.appendChild(messageDiv);
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function chargerConversation(conv) {
  currentConversationId = conv.id;

  chatTitle.textContent = conv.name;
  messageForm.style.display = "flex";

  messagesContainer.innerHTML = "";
  const loadingMsg = document.createElement("p");
  loadingMsg.className = "chat-loading-messages";
  loadingMsg.textContent = "Chargement des messages...";
  messagesContainer.appendChild(loadingMsg);

  const messages = await getMessages(conv.id);
  afficherMessages(messages);
}

function afficherConversations(conversations) {
  if (!conversationsList) return;

  conversationsList.innerHTML = "";

  if (!conversations || conversations.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "chat-sidebar-msg";
    emptyMsg.textContent = "Aucune conversation.";
    conversationsList.appendChild(emptyMsg);

    chatTitle.textContent = "Discussions";
    messagesContainer.innerHTML =
      '<p class="chat-empty-messages">Aucune conversation disponible.</p>';
    messageForm.style.display = "none";
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const selectedId = urlParams.get("id");
  let selectedConversation = null;
  let conversationItem = null;

  conversations.forEach((conv) => {
    const item = document.createElement("div");
    item.className = "chat-conversation-item";

    const nameDiv = document.createElement("div");
    nameDiv.className = "chat-conv-name";
    nameDiv.textContent = conv.name;

    const msgDiv = document.createElement("div");
    msgDiv.className = "chat-conv-last-msg";
    msgDiv.textContent = conv.lastMessage;

    item.appendChild(nameDiv);
    item.appendChild(msgDiv);

    item.addEventListener("click", () => {
      if (currentConversationId === conv.id) return;

      document
        .querySelectorAll(".chat-conversation-item")
        .forEach((el) => el.classList.remove("active"));
      item.classList.add("active");

      chargerConversation(conv);
    });

    if (String(conv.id) === selectedId) {
      selectedConversation = conv;
      conversationItem = item;
    }

    conversationsList.appendChild(item);
  });

  if (selectedConversation && conversationItem) {
    conversationItem.classList.add("active");
    chargerConversation(selectedConversation);
    messageInput.focus();
  }
}

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentConversationId || !currentUser) return;

  const content = messageInput.value.trim();
  if (!content) return;

  messageInput.value = "";

  try {
    const { error } = await client.from("messages").insert({
      conversation_id: currentConversationId,
      sender_id: currentUser.id,
      content: content,
      type: "text",
    });

    if (error) return;

    const activeConvLastMsg = document.querySelector(
      ".chat-conversation-item.active .chat-conv-last-msg",
    );
    if (activeConvLastMsg) activeConvLastMsg.textContent = content;

    const messages = await getMessages(currentConversationId);
    afficherMessages(messages);
  } catch (error) {
    console.error("Erreur dans l'envoi du message :", error);
  }
});

async function initialiser() {
  await getCurrentUser();
  if (!currentUser) return;

  if (conversationsList) {
    conversationsList.innerHTML =
      '<p class="chat-sidebar-msg">Chargement des conversations...</p>';
  }

  messagesContainer.innerHTML =
    '<p class="chat-empty-messages">Veuillez sélectionner une conversation</p>';
  messageForm.style.display = "none";

  const conversations = await getConversations();
  afficherConversations(conversations);
}

initialiser();
