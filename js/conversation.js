// js/conversation.js
const client = window.supabaseClient;

const conversationsList = document.getElementById("conversations-list");
const searchConvInput = document.getElementById("search-conv");
const headerProfileTrigger = document.getElementById("header-profile-trigger");
const chatTitle = document.getElementById("chat-title");
const chatEditIcon = document.getElementById("chat-edit-icon");
const chatSubtitle = document.getElementById("chat-subtitle");
const chatAvatar = document.getElementById("chat-avatar");
const headerAvatarWrap = document.getElementById("header-avatar-wrap");
const messagesContainer = document.getElementById("messages-container");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

// Éléments de la modale de personnalisation locale
const customModal = document.getElementById("custom-contact-modal");
const customForm = document.getElementById("custom-contact-form");
const modalAvatarImg = document.getElementById("modal-contact-avatar");
const modalAvatarInput = document.getElementById("modal-avatar-input");
const modalNameInput = document.getElementById("modal-contact-name");
const btnCancelModal = document.getElementById("btn-cancel-modal");
const btnResetContact = document.getElementById("btn-reset-contact");

let currentUser = null;
let currentConversationId = null;
let currentActiveConv = null;
let tempModalAvatarDataUrl = null;
let allConversations = [];
let realtimeChannel = null;

if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark-mode");
}

function formaterHeure(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- GESTION DES SURNOMS & PHOTOS PERSONNALISÉS (UNIQUEMENT POUR MOI) ---
function getCustomContactsMap() {
  if (!currentUser) return {};
  try {
    return JSON.parse(
      localStorage.getItem(`custom_contacts_${currentUser.id}`) || "{}",
    );
  } catch (e) {
    return {};
  }
}

function saveCustomContactsMap(map) {
  if (!currentUser) return;
  localStorage.setItem(
    `custom_contacts_${currentUser.id}`,
    JSON.stringify(map),
  );
}

function compresserImageLocale(file, callback) {
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
      callback(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

async function getCurrentUser() {
  if (!client) return null;
  const { data } = await client.auth.getSession();

  if (!data?.session) {
    window.location.href = "index.html";
    return null;
  }

  currentUser = data.session.user;
  return currentUser;
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

    const customMap = getCustomContactsMap();

    const displayedConversations = (conversations || []).map((conv) => {
      const otherMember = conv.conversation_members?.find(
        (m) => m.user_id !== currentUser.id,
      );
      const otherUsername =
        otherMember?.profiles?.username || "Utilisateur inconnu";
      const otherId = otherMember?.user_id || conv.id;

      const defaultName = conv.is_group
        ? conv.name || "Groupe sans nom"
        : otherUsername;

      const defaultAvatar =
        localStorage.getItem(`avatar_${otherId}`) ||
        `https://i.pravatar.cc/150?u=${otherId}`;

      // Appliquer le surnom et la photo personnalisés si définis par l'utilisateur
      const customOverride = customMap[conv.id] || {};
      const finalName = customOverride.name || defaultName;
      const finalAvatar = customOverride.avatar || defaultAvatar;

      const visibleMessages = (conv.messages || []).filter(
        (msg) => !msg.deleted_at,
      );
      visibleMessages.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at),
      );
      const lastMsg = visibleMessages[0] || null;

      return {
        id: conv.id,
        contactId: otherId,
        defaultName: defaultName,
        defaultAvatar: defaultAvatar,
        name: finalName,
        avatar: finalAvatar,
        status: customOverride.name
          ? `Message • (${defaultName})`
          : "Message • En ligne",
        lastMessage: lastMsg ? lastMsg.content : "Aucun message pour le moment",
        lastMessageDate: lastMsg ? lastMsg.created_at : conv.created_at,
      };
    });

    displayedConversations.sort(
      (a, b) => new Date(b.lastMessageDate) - new Date(a.lastMessageDate),
    );
    allConversations = displayedConversations;
    return displayedConversations;
  } catch (error) {
    console.error("Erreur dans getConversations :", error);
    return [];
  }
}

// --- LOGIQUE DE LA MODALE DE PERSONNALISATION ---
if (headerProfileTrigger) {
  headerProfileTrigger.addEventListener("click", () => {
    if (!currentActiveConv) return;
    tempModalAvatarDataUrl = currentActiveConv.avatar;
    modalAvatarImg.src = currentActiveConv.avatar;
    modalNameInput.value = currentActiveConv.name;
    customModal.style.display = "flex";
    modalNameInput.focus();
  });
}

if (modalAvatarInput) {
  modalAvatarInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    compresserImageLocale(file, (dataUrl) => {
      tempModalAvatarDataUrl = dataUrl;
      modalAvatarImg.src = dataUrl;
    });
  });
}

if (btnCancelModal) {
  btnCancelModal.addEventListener("click", () => {
    customModal.style.display = "none";
  });
}

if (btnResetContact) {
  btnResetContact.addEventListener("click", () => {
    if (!currentActiveConv) return;
    const customMap = getCustomContactsMap();
    delete customMap[currentActiveConv.id];
    saveCustomContactsMap(customMap);

    currentActiveConv.name = currentActiveConv.defaultName;
    currentActiveConv.avatar = currentActiveConv.defaultAvatar;
    currentActiveConv.status = "Message • En ligne";

    rafraichirAffichageContactActif();
    customModal.style.display = "none";
  });
}

if (customForm) {
  customForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!currentActiveConv) return;

    const newName =
      modalNameInput.value.trim() || currentActiveConv.defaultName;
    const newAvatar = tempModalAvatarDataUrl || currentActiveConv.defaultAvatar;

    const customMap = getCustomContactsMap();
    customMap[currentActiveConv.id] = {
      name: newName,
      avatar: newAvatar,
    };
    saveCustomContactsMap(customMap);

    currentActiveConv.name = newName;
    currentActiveConv.avatar = newAvatar;
    currentActiveConv.status =
      newName !== currentActiveConv.defaultName
        ? `Message • (${currentActiveConv.defaultName})`
        : "Message • En ligne";

    rafraichirAffichageContactActif();
    customModal.style.display = "none";
  });
}

function rafraichirAffichageContactActif() {
  if (!currentActiveConv) return;
  chatTitle.textContent = currentActiveConv.name;
  if (chatSubtitle) chatSubtitle.textContent = currentActiveConv.status;
  if (chatAvatar) chatAvatar.src = currentActiveConv.avatar;
  afficherConversations(allConversations);
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
    return messages || [];
  } catch (error) {
    console.error("Erreur dans getMessages :", error);
    return [];
  }
}

function creerBulleMessage(msg, isLastSent) {
  const isSent = msg.sender_id === currentUser.id;
  const isUnsent =
    Boolean(msg.unsent_at) || msg.content === "Ce message a été annulé";

  const row = document.createElement("div");
  row.className = `chat-msg-row ${isSent ? "sent" : "received"}`;

  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${isSent ? "sent" : "received"} ${isUnsent ? "unsent" : ""}`;

  const p = document.createElement("p");
  p.className = "chat-message-text";
  p.textContent = isUnsent
    ? "Vous avez annulé l’envoi d’un message"
    : msg.content;
  messageDiv.appendChild(p);

  row.appendChild(messageDiv);

  const reactionsSaved = JSON.parse(
    localStorage.getItem("message_reactions") || "{}",
  );
  if (reactionsSaved[msg.id]) {
    const badge = document.createElement("span");
    badge.className = "chat-reaction-badge";
    badge.textContent = reactionsSaved[msg.id];
    row.appendChild(badge);
  }

  if (!isUnsent && msg.id) {
    messageDiv.addEventListener("dblclick", () => {
      document
        .querySelectorAll(".chat-reaction-bar")
        .forEach((el) => el.remove());

      const bar = document.createElement("div");
      bar.className = "chat-reaction-bar";
      ["❤️", "👍", "😂", "😮", "😢"].forEach((emoji) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chat-reaction-option";
        btn.textContent = emoji;
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const current = JSON.parse(
            localStorage.getItem("message_reactions") || "{}",
          );
          if (current[msg.id] === emoji) {
            delete current[msg.id];
          } else {
            current[msg.id] = emoji;
          }
          localStorage.setItem("message_reactions", JSON.stringify(current));
          bar.remove();
          const msgs = await getMessages(currentConversationId);
          afficherMessages(msgs);
        });
        bar.appendChild(btn);
      });
      row.appendChild(bar);
    });
  }

  const meta = document.createElement("div");
  meta.className = "chat-msg-meta";

  const timeSpan = document.createElement("span");
  timeSpan.textContent = formaterHeure(
    msg.created_at || new Date().toISOString(),
  );
  meta.appendChild(timeSpan);

  if (isLastSent && !isUnsent) {
    const statusSpan = document.createElement("span");
    statusSpan.textContent = "• Distribué";
    meta.appendChild(statusSpan);
  }

  row.appendChild(meta);
  return row;
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

  messages.forEach((msg, index) => {
    const isLastSent =
      msg.sender_id === currentUser.id && index === messages.length - 1;
    messagesContainer.appendChild(creerBulleMessage(msg, isLastSent));
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

document.addEventListener("click", () => {
  document.querySelectorAll(".chat-reaction-bar").forEach((el) => el.remove());
});

function abonnerTempsReel(conversationId) {
  if (realtimeChannel) {
    client.removeChannel(realtimeChannel);
  }

  realtimeChannel = client
    .channel(`message-${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      async () => {
        const messages = await getMessages(conversationId);
        afficherMessages(messages);
      },
    )
    .subscribe();
}

async function chargerConversation(conv) {
  currentConversationId = conv.id;
  currentActiveConv = conv;

  chatTitle.textContent = conv.name;
  if (chatEditIcon) chatEditIcon.style.display = "inline";
  if (chatSubtitle) chatSubtitle.textContent = conv.status || "Message";
  if (chatAvatar && headerAvatarWrap) {
    chatAvatar.src = conv.avatar;
    headerAvatarWrap.style.display = "block";
  }

  messageForm.style.display = "flex";
  messagesContainer.innerHTML =
    '<p class="chat-loading-messages">Chargement des messages...</p>';

  const messages = await getMessages(conv.id);
  afficherMessages(messages);
  abonnerTempsReel(conv.id);
  messageInput.focus();
}

function afficherConversations(conversations) {
  if (!conversationsList) return;

  conversationsList.innerHTML = "";

  if (!conversations || conversations.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "chat-sidebar-msg";
    emptyMsg.textContent = "Aucune conversation.";
    conversationsList.appendChild(emptyMsg);
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const selectedId = urlParams.get("id");
  let selectedConversation = null;
  let conversationItem = null;

  conversations.forEach((conv) => {
    const item = document.createElement("div");
    item.className = `chat-conversation-item ${String(conv.id) === String(currentConversationId) ? "active" : ""}`;

    const avatarImg = document.createElement("img");
    avatarImg.className = "chat-conv-avatar";
    avatarImg.src = conv.avatar;
    avatarImg.alt = conv.name;

    const bodyDiv = document.createElement("div");
    bodyDiv.className = "chat-conv-body";

    const topDiv = document.createElement("div");
    topDiv.className = "chat-conv-top";

    const nameDiv = document.createElement("div");
    nameDiv.className = "chat-conv-name";
    nameDiv.textContent = conv.name;

    const dateDiv = document.createElement("div");
    dateDiv.className = "chat-conv-date";
    dateDiv.textContent = formaterHeure(conv.lastMessageDate);

    topDiv.appendChild(nameDiv);
    topDiv.appendChild(dateDiv);

    const msgDiv = document.createElement("div");
    msgDiv.className = "chat-conv-last-msg";
    msgDiv.textContent = conv.lastMessage;

    bodyDiv.appendChild(topDiv);
    bodyDiv.appendChild(msgDiv);

    item.appendChild(avatarImg);
    item.appendChild(bodyDiv);

    item.addEventListener("click", () => {
      if (currentConversationId === conv.id) return;

      document
        .querySelectorAll(".chat-conversation-item")
        .forEach((el) => el.classList.remove("active"));
      item.classList.add("active");

      chargerConversation(conv);
    });

    if (String(conv.id) === String(selectedId) && !currentConversationId) {
      selectedConversation = conv;
      conversationItem = item;
    }

    conversationsList.appendChild(item);
  });

  if (selectedConversation && conversationItem) {
    conversationItem.classList.add("active");
    chargerConversation(selectedConversation);
  }
}

if (searchConvInput) {
  searchConvInput.addEventListener("input", () => {
    const query = searchConvInput.value.trim().toLowerCase();
    const filtered = allConversations.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.lastMessage.toLowerCase().includes(query),
    );
    afficherConversations(filtered);
  });
}

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentConversationId || !currentUser) return;

  const content = messageInput.value.trim();
  if (!content) return;

  messageInput.value = "";

  const emptyPlaceholder = messagesContainer.querySelector(
    ".chat-empty-messages",
  );
  if (emptyPlaceholder) emptyPlaceholder.remove();

  const tempMsg = {
    sender_id: currentUser.id,
    content: content,
    created_at: new Date().toISOString(),
  };
  messagesContainer.appendChild(creerBulleMessage(tempMsg, true));
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  const activeConvLastMsg = document.querySelector(
    ".chat-conversation-item.active .chat-conv-last-msg",
  );
  if (activeConvLastMsg) activeConvLastMsg.textContent = content;

  try {
    const { error } = await client.from("messages").insert({
      conversation_id: currentConversationId,
      sender_id: currentUser.id,
      content: content,
      type: "text",
    });

    if (error) {
      console.error("Erreur lors de l'envoi du message :", error);
      return;
    }

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

  const conversations = await getConversations();
  afficherConversations(conversations);
}

initialiser();
