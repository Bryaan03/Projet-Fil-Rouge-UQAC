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
const btnSend = document.getElementById("btn-send");
const btnMic = document.getElementById("btn-mic");
const btnAttach = document.getElementById("btn-attach");
const attachMenu = document.getElementById("chat-attach-menu");

// Éléments modale contact
const customModal = document.getElementById("custom-contact-modal");
const customForm = document.getElementById("custom-contact-form");
const modalAvatarImg = document.getElementById("modal-contact-avatar");
const modalAvatarInput = document.getElementById("modal-avatar-input");
const modalNameInput = document.getElementById("modal-contact-name");
const btnCancelModal = document.getElementById("btn-cancel-modal");
const btnResetContact = document.getElementById("btn-reset-contact");

// Éléments modale GIFs
const gifModal = document.getElementById("gif-modal");
const gifSearchInput = document.getElementById("gif-search-input");
const gifGrid = document.getElementById("gif-grid");
const btnCloseGif = document.getElementById("btn-close-gif");

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
    window.location.href = "../index.html";
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

    if (memberError) {
      console.error("Erreur conversation_members :", memberError);
      return [];
    }

    if (!memberRows || memberRows.length === 0) {
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
                    type,
                    created_at,
                    deleted_at,
                    unsent_at
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
      const otherId = otherMember?.user_id || conv.id;
      const otherUsername = otherMember?.profiles?.username;

      const defaultName = conv.is_group
        ? conv.name || "Groupe sans nom"
        : otherUsername || `Discussion #${otherId.substring(0, 6)}`;

      const defaultAvatar =
        localStorage.getItem(`avatar_${otherId}`) ||
        `https://i.pravatar.cc/150?u=${otherId}`;

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

      let previewText = "Aucun message";
      if (lastMsg) {
        if (lastMsg.unsent_at) previewText = "Message annulé";
        else previewText = lastMsg.content;
      }

      return {
        id: conv.id,
        contactId: otherId,
        defaultName: defaultName,
        defaultAvatar: defaultAvatar,
        name: finalName,
        avatar: finalAvatar,
        statusText: "Disponible",
        status: "Disponible",
        lastMessage: previewText,
        lastMessageDate: lastMsg ? lastMsg.created_at : conv.created_at,
      };
    });

    displayedConversations.sort(
      (a, b) => new Date(b.lastMessageDate) - new Date(a.lastMessageDate),
    );
    allConversations = displayedConversations;
    return displayedConversations;
  } catch (error) {
    console.error("Erreur critique dans getConversations :", error);
    return [];
  }
}

// --- GESTION DU MENU ATTACHEMENT "+" ---
if (btnAttach && attachMenu) {
  btnAttach.addEventListener("click", (e) => {
    e.stopPropagation();
    attachMenu.style.display =
      attachMenu.style.display === "flex" ? "none" : "flex";
  });

  document.addEventListener("click", () => {
    attachMenu.style.display = "none";
  });
}

if (messageInput && btnSend && btnMic) {
  messageInput.addEventListener("input", () => {
    if (messageInput.value.trim().length > 0) {
      btnMic.style.display = "none";
      btnSend.style.display = "flex";
    } else {
      btnMic.style.display = "flex";
      btnSend.style.display = "none";
    }
  });
}

const hiddenFileInput = document.createElement("input");
hiddenFileInput.type = "file";
hiddenFileInput.style.display = "none";
document.body.appendChild(hiddenFileInput);

document.getElementById("menu-photo")?.addEventListener("click", () => {
  hiddenFileInput.accept = "image/*,video/*";
  hiddenFileInput.click();
});

document.getElementById("menu-doc")?.addEventListener("click", () => {
  hiddenFileInput.accept = ".pdf,.doc,.docx,.zip,.txt";
  hiddenFileInput.click();
});

hiddenFileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !currentConversationId) return;
  e.target.value = "";

  let msgType = "file";
  let subfolder = "docs";
  if (file.type.startsWith("image/")) {
    msgType = "image";
    subfolder = "images";
  } else if (file.type.startsWith("video/")) {
    msgType = "video";
    subfolder = "videos";
  }

  messageInput.placeholder = "Envoi du fichier en cours...";

  await uploadMedia({
    fileOrBlob: file,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    type: msgType,
    subfolder: subfolder,
  });

  messageInput.placeholder = "Message";
});

document.getElementById("menu-gps")?.addEventListener("click", async () => {
  if (!navigator.geolocation) {
    alert("La géolocalisation n'est pas supportée.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      await envoyerMessageBase({
        content: "📍 Position GPS",
        type: "location",
        latitude: lat,
        longitude: lon,
      });
    },
    () => {
      alert("Impossible de récupérer la position.");
    },
  );
});

// --- RECHERCHE DE GIFS DYNAMIQUE (API GIPHY UNIQUEMENT) ---
document.getElementById("menu-gif")?.addEventListener("click", () => {
  if (gifModal) {
    gifModal.style.display = "flex";
    if (gifSearchInput) gifSearchInput.value = ""; // Réinitialise la barre
  }
  chargerGifs("");
});

btnCloseGif?.addEventListener("click", () => {
  if (gifModal) gifModal.style.display = "none";
});

async function chargerGifs(query = "") {
  if (!gifGrid) return;
  gifGrid.innerHTML =
    '<p class="chat-loading-messages">Recherche de GIFs en cours...</p>';

  try {
    const apiKey = "Mh8mSVVq5ExXisgQI2tROetX5lSeWM1R";
    let url = `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=20&rating=g`;

    if (query.trim().length > 0) {
      url = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=20&rating=g`;
    }

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(
        `Erreur API Giphy (Code: ${res.status}) - Clé potentiellement bloquée.`,
      );
    }

    const data = await res.json();
    gifGrid.innerHTML = "";

    if (!data.data || data.data.length === 0) {
      gifGrid.innerHTML =
        '<p class="chat-empty-messages">Aucun résultat trouvé sur Giphy.</p>';
      return;
    }

    data.data.forEach((gif) => {
      const img = document.createElement("img");
      img.className = "chat-gif-item";
      img.src = gif.images.fixed_height_small.url;

      img.addEventListener("click", async () => {
        if (gifModal) gifModal.style.display = "none";
        await envoyerGif({
          gifUrl: gif.images.fixed_height.url,
          title: gif.title || "GIF",
        });
      });
      gifGrid.appendChild(img);
    });
  } catch (e) {
    console.error("Erreur avec l'API Giphy :", e);
    gifGrid.innerHTML = `<p class="chat-empty-messages" style="color: var(--danger, #dc3545);">Erreur de connexion à Giphy (limite d'API atteinte).</p>`;
  }
}

let gifTimeout = null;
if (gifSearchInput) {
  gifSearchInput.addEventListener("input", () => {
    clearTimeout(gifTimeout);
    const q = gifSearchInput.value.trim();
    gifTimeout = setTimeout(() => {
      chargerGifs(q);
    }, 400);
  });
}

// --- ENREGISTREUR VOCAL ---
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let isRecording = false;

if (btnMic) {
  btnMic.addEventListener("click", async () => {
    if (!isRecording) {
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        mediaRecorder = new MediaRecorder(audioStream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.onstop = async () => {
          if (audioStream) {
            audioStream.getTracks().forEach((track) => track.stop());
            audioStream = null;
          }

          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

          await uploadMedia({
            fileOrBlob: audioBlob,
            fileName: `vocal_${Date.now()}.webm`,
            mimeType: "audio/webm",
            type: "audio",
            subfolder: "audios",
          });
        };
        mediaRecorder.start();
        isRecording = true;
        btnMic.classList.add("recording");
        messageInput.placeholder = "Enregistrement en cours...";
      } catch (err) {
        alert("Microphone inaccessible.");
      }
    } else {
      mediaRecorder.stop();
      isRecording = false;
      btnMic.classList.remove("recording");
      messageInput.placeholder = "Message";
    }
  });
}

// --- PERSONNALISATION LOCALE DU CONTACT ---
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

modalAvatarInput?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  compresserImageLocale(file, (dataUrl) => {
    tempModalAvatarDataUrl = dataUrl;
    modalAvatarImg.src = dataUrl;
  });
});

btnCancelModal?.addEventListener("click", () => {
  customModal.style.display = "none";
});

btnResetContact?.addEventListener("click", () => {
  if (!currentActiveConv) return;
  const customMap = getCustomContactsMap();
  delete customMap[currentActiveConv.id];
  saveCustomContactsMap(customMap);

  currentActiveConv.name = currentActiveConv.defaultName;
  currentActiveConv.avatar = currentActiveConv.defaultAvatar;
  currentActiveConv.status = currentActiveConv.statusText;

  rafraichirAffichageContactActif();
  customModal.style.display = "none";
});

customForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!currentActiveConv) return;

  const newName = modalNameInput.value.trim() || currentActiveConv.defaultName;
  const newAvatar = tempModalAvatarDataUrl || currentActiveConv.defaultAvatar;

  const customMap = getCustomContactsMap();
  customMap[currentActiveConv.id] = { name: newName, avatar: newAvatar };
  saveCustomContactsMap(customMap);

  currentActiveConv.name = newName;
  currentActiveConv.avatar = newAvatar;
  currentActiveConv.status =
    newName !== currentActiveConv.defaultName
      ? `${currentActiveConv.statusText} (${currentActiveConv.defaultName})`
      : currentActiveConv.statusText;

  rafraichirAffichageContactActif();
  customModal.style.display = "none";
});

function rafraichirAffichageContactActif() {
  if (!currentActiveConv) return;
  chatTitle.textContent = currentActiveConv.name;
  if (chatSubtitle) chatSubtitle.textContent = currentActiveConv.status;
  if (chatAvatar) chatAvatar.src = currentActiveConv.avatar;

  const presenceDot = document.querySelector(".chat-presence-dot");
  if (presenceDot) {
    const isOnline =
      currentActiveConv.statusText &&
      currentActiveConv.statusText.includes("Disponible");
    presenceDot.style.backgroundColor = isOnline ? "#34c759" : "#8e8e93";
  }

  afficherConversations(allConversations);
}

// --- GESTION DES MESSAGES (SUPABASE) ---
async function getMessages(conversationId) {
  try {
    const { data: messages, error } = await client
      .from("messages")
      .select(`
        *,
        message_reactions (
          id,
          message_id,
          user_id,
          emoji
        ),
        message_attachments (
          id,
          storage_path,
          external_url,
          file_name,
          mime_type,
          file_size,
          width,
          height
        )
      `)
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) return [];
    if (!messages) return [];

    const attachmentPaths = [];
    messages.forEach((msg) => {
      if (msg.message_attachments) {
        msg.message_attachments.forEach((att) => {
          if (att.storage_path) attachmentPaths.push(att.storage_path);
        });
      }
    });

    if (attachmentPaths.length > 0) {
      try {
        const { data: signedList } = await client.storage
          .from("chat-attachments")
          .createSignedUrls(attachmentPaths, 3600);

        if (signedList && signedList.length > 0) {
          const signedMap = {};
          signedList.forEach((item) => {
            if (item.signedUrl) signedMap[item.path] = item.signedUrl;
          });

          messages.forEach((msg) => {
            if (msg.message_attachments) {
              msg.message_attachments.forEach((att) => {
                if (signedMap[att.storage_path]) {
                  att.signed_url = signedMap[att.storage_path];
                }
              });
            }
          });
        }
      } catch (errSign) {
        console.warn("Erreur signature des fichiers :", errSign);
      }
    }

    return messages;
  } catch (error) {
    return [];
  }
}

async function addReaction(messageId, selectedEmoji, existingReaction) {
  if (!currentUser || !client) return;

  try {
    if (existingReaction) {
      if (existingReaction.emoji === selectedEmoji) {
        const { error } = await client
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", currentUser.id);

        if (error) console.error("Erreur suppression réaction :", error);
      } else {
        const { error } = await client
          .from("message_reactions")
          .update({ emoji: selectedEmoji })
          .eq("message_id", messageId)
          .eq("user_id", currentUser.id);

        if (error) console.error("Erreur mise à jour réaction :", error);
      }
    } else {
      const { error } = await client
        .from("message_reactions")
        .insert({
          message_id: messageId,
          user_id: currentUser.id,
          emoji: selectedEmoji,
        });

      if (error) console.error("Erreur ajout réaction :", error);
    }
  } catch (err) {
    console.error("Erreur addReaction :", err);
  }
}

function showReactionBar(row, msg) {
  document.querySelectorAll(".chat-reaction-bar").forEach((el) => el.remove());

  const reactions = msg.message_reactions || [];
  const myReaction = reactions.find((reaction) => reaction.user_id === currentUser?.id);

  const bar = document.createElement("div");
  bar.className = "chat-reaction-bar";

  const emojis = ["❤️", "👍", "😂", "😮", "😢"];
  emojis.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `chat-reaction-option ${myReaction?.emoji === emoji ? "active" : ""}`;
    btn.textContent = emoji;
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      bar.remove();
      await addReaction(msg.id, emoji, myReaction);
    });
    bar.appendChild(btn);
  });

  row.appendChild(bar);
}

async function annulerMessage(msgId) {
  try {
    await client
      .from("messages")
      .update({
        content: "Ce message a été annulé",
        unsent_at: new Date().toISOString(),
      })
      .eq("id", msgId)
      .eq("sender_id", currentUser.id);

    if (currentConversationId) {
      const msgs = await getMessages(currentConversationId);
      afficherMessages(msgs);
    }
  } catch (err) {}
}

function creerBulleMessage(msg, isLastSent) {
  const isSent = msg.sender_id === currentUser.id;
  const isUnsent =
    Boolean(msg.unsent_at) || msg.content === "Ce message a été annulé";

  const row = document.createElement("div");
  row.className = `chat-msg-row ${isSent ? "sent" : "received"}`;

  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${isSent ? "sent" : "received"} ${isUnsent ? "unsent" : ""}`;

  const p = document.createElement("div");
  p.className = "chat-message-text";

  const attachment =
    msg.message_attachments && msg.message_attachments.length > 0
      ? msg.message_attachments[0]
      : null;
  const mediaUrl = attachment?.signed_url || attachment?.external_url || "";
  const originalFileName = attachment?.file_name || "Document";

  if (isUnsent) {
    p.textContent = "Vous avez annulé l’envoi d’un message";
  } else if (msg.type === "image" || msg.type === "gif") {
    const img = document.createElement("img");
    img.className = "chat-media-img";
    img.src = mediaUrl;
    p.appendChild(img);
  } else if (msg.type === "video") {
    const video = document.createElement("video");
    video.className = "chat-media-video";
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";

    const source = document.createElement("source");
    source.src = mediaUrl;
    source.type = attachment?.mime_type || "video/mp4";

    video.appendChild(source);
    p.appendChild(video);
  } else if (msg.type === "audio") {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = mediaUrl;
    p.appendChild(audio);
  } else if (msg.type === "file") {
    const link = document.createElement("a");
    link.className = "chat-doc-card";
    link.textContent = `📎 ${originalFileName}`;
    link.href = mediaUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.download = originalFileName;
    p.appendChild(link);
  } else if (msg.type === "location") {
    const lat = msg.latitude ?? 0;
    const lon = msg.longitude ?? 0;

    const mapCard = document.createElement("a");
    mapCard.className = "chat-gps-preview";
    mapCard.href = `https://maps.google.com/?q=${lat},${lon}`;
    mapCard.target = "_blank";
    mapCard.innerHTML = `
      <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#e3e3e8; border-radius:10px; font-size:12px; font-weight:600; color:#007aff;">
          📍 Voir sur Google Maps (${Number(lat).toFixed(2)}, ${Number(lon).toFixed(2)})
      </div>
    `;
    p.appendChild(mapCard);
  } else {
    p.textContent = msg.content;
  }

  messageDiv.appendChild(p);
  row.appendChild(messageDiv);

  const reactions = msg.message_reactions || [];
  if (reactions.length > 0) {
    const counts = {};
    reactions.forEach((r) => {
      counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
    });

    const badge = document.createElement("div");
    badge.className = "chat-reaction-badge";

    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      showReactionBar(row, msg);
    });

    for (const emoji in counts) {
      const count = counts[emoji];
      const itemSpan = document.createElement("span");
      itemSpan.className = "chat-reaction-item";
      itemSpan.textContent = count > 1 ? `${emoji} ${count}` : emoji;
      badge.appendChild(itemSpan);
    }

    row.appendChild(badge);
  }

  if (!isUnsent && msg.id) {
    messageDiv.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      showReactionBar(row, msg);
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

  if (isSent && !isUnsent && msg.id) {
    const unsendBtn = document.createElement("button");
    unsendBtn.type = "button";
    unsendBtn.className = "chat-unsend-btn";
    unsendBtn.textContent = "Annuler l’envoi";
    unsendBtn.addEventListener("click", () => annulerMessage(msg.id));
    meta.appendChild(unsendBtn);
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

function abonnerTempsReel(conversationId) {
  if (realtimeChannel) client.removeChannel(realtimeChannel);

  realtimeChannel = client
    .channel(`imessage-${conversationId}`)
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
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "message_reactions",
      },
      async () => {
        const messages = await getMessages(conversationId);
        afficherMessages(messages, false);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "message_attachments",
      },
      async () => {
        const messages = await getMessages(conversationId);
        afficherMessages(messages, false);
      },
    )
    .subscribe();
}

async function chargerConversation(conv) {
  currentConversationId = conv.id;
  currentActiveConv = conv;

  chatTitle.textContent = conv.name;
  if (chatEditIcon) chatEditIcon.style.display = "inline";
  if (chatSubtitle) chatSubtitle.textContent = conv.status;

  const presenceDot = document.querySelector(".chat-presence-dot");
  if (presenceDot) {
    const isOnline = conv.statusText && conv.statusText.includes("Disponible");
    presenceDot.style.backgroundColor = isOnline ? "#34c759" : "#8e8e93";
  }

  if (chatAvatar && headerAvatarWrap) {
    chatAvatar.src = conv.avatar;
    headerAvatarWrap.style.display = "block";
  }

  messageForm.style.display = "flex";
  window.history.replaceState({}, "", `conversation.html?id=${conv.id}`);
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

searchConvInput?.addEventListener("input", () => {
  const query = searchConvInput.value.trim().toLowerCase();
  const filtered = allConversations.filter(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      c.lastMessage.toLowerCase().includes(query),
  );
  afficherConversations(filtered);
});

async function uploadMedia({
  fileOrBlob,
  fileName,
  mimeType,
  type,
  subfolder = "files",
}) {
  if (!currentConversationId || !currentUser) return;

  const emptyPlaceholder = messagesContainer.querySelector(
    ".chat-empty-messages",
  );
  if (emptyPlaceholder) emptyPlaceholder.remove();

  const fileExt = fileName.includes(".")
    ? fileName.split(".").pop()
    : type === "audio"
      ? "webm"
      : "bin";
  const path = `${currentConversationId}/${subfolder}/${Date.now()}_${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await client.storage
    .from("chat-attachments")
    .upload(path, fileOrBlob, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("Erreur Storage upload :", uploadError);
    alert(
      "Erreur lors du téléversement du fichier. Le fichier ne doit pas dépasser 50 Mo.",
    );
    return;
  }

  let signedUrl = "";
  try {
    const { data: signedData } = await client.storage
      .from("chat-attachments")
      .createSignedUrl(path, 3600);
    if (signedData?.signedUrl) signedUrl = signedData.signedUrl;
  } catch (e) {
    console.error("Erreur création URL signée :", e);
  }

  let messageContent = fileName;
  if (type === "audio") messageContent = "🎤 Message vocal";
  else if (type === "image") messageContent = `📷 ${fileName}`;
  else if (type === "video") messageContent = `📹 ${fileName}`;
  else if (type === "file") messageContent = `📎 ${fileName}`;

  const { data: insertedMsg, error: msgError } = await client
    .from("messages")
    .insert({
      conversation_id: currentConversationId,
      sender_id: currentUser.id,
      content: messageContent,
      type: type,
    })
    .select()
    .single();

  if (msgError || !insertedMsg) {
    console.error("Erreur insertion messages :", msgError);
    return;
  }

  const { error: attachError } = await client
    .from("message_attachments")
    .insert({
      message_id: insertedMsg.id,
      storage_path: path,
      file_name: fileName,
      mime_type: mimeType,
      file_size: fileOrBlob.size || 0,
    });

  if (attachError) {
    console.error("Erreur insertion message_attachments :", attachError);
  }

  const tempMsg = {
    ...insertedMsg,
    message_reactions: [],
    message_attachments: [
      {
        storage_path: path,
        signed_url: signedUrl,
        file_name: fileName,
        mime_type: mimeType,
        file_size: fileOrBlob.size || 0,
      },
    ],
  };
  messagesContainer.appendChild(creerBulleMessage(tempMsg, true));
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function envoyerGif({ gifUrl, title = "GIF" }) {
  if (!currentConversationId || !currentUser) return;

  const emptyPlaceholder = messagesContainer.querySelector(
    ".chat-empty-messages",
  );
  if (emptyPlaceholder) emptyPlaceholder.remove();

  const messageContent = title ? `🎞️ ${title}` : "🎞️ GIF";

  const { data: message, error: msgError } = await client
    .from("messages")
    .insert({
      conversation_id: currentConversationId,
      sender_id: currentUser.id,
      content: messageContent,
      type: "gif",
    })
    .select()
    .single();

  if (msgError || !message) {
    console.error("Erreur insertion message GIF :", msgError);
    return;
  }

  const { error: attachError } = await client
    .from("message_attachments")
    .insert({
      message_id: message.id,
      external_url: gifUrl,
      file_name: title || "giphy.gif",
      mime_type: "image/gif",
      file_size: 0,
    });

  if (attachError) {
    console.error("Erreur insertion message_attachments GIF :", attachError);
  }

  const tempMsg = {
    ...message,
    message_reactions: [],
    message_attachments: [
      {
        external_url: gifUrl,
        storage_path: null,
        file_name: title || "giphy.gif",
        mime_type: "image/gif",
        file_size: 0,
      },
    ],
  };
  messagesContainer.appendChild(creerBulleMessage(tempMsg, true));
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function envoyerMessageBase({
  content,
  type,
  latitude = null,
  longitude = null,
}) {
  if (!currentConversationId || !currentUser) return;

  const emptyPlaceholder = messagesContainer.querySelector(
    ".chat-empty-messages",
  );
  if (emptyPlaceholder) emptyPlaceholder.remove();

  const tempMsg = {
    sender_id: currentUser.id,
    content: content,
    type: type,
    latitude: latitude,
    longitude: longitude,
    created_at: new Date().toISOString(),
    message_reactions: [],
    message_attachments: [],
  };
  messagesContainer.appendChild(creerBulleMessage(tempMsg, true));
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  try {
    const request = {
      conversation_id: currentConversationId,
      sender_id: currentUser.id,
      content: content,
      type: type,
    };
    if (latitude !== null && longitude !== null) {
      request.latitude = latitude;
      request.longitude = longitude;
    }
    await client.from("messages").insert(request);
  } catch (error) {
    console.error("Erreur envoyerMessageBase :", error);
  }
}

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content) return;
  messageInput.value = "";
  btnSend.style.display = "none";
  btnMic.style.display = "flex";
  await envoyerMessageBase({ content: content, type: "text" });
});

async function initialiser() {
  await getCurrentUser();
  if (!currentUser) return;

  if (conversationsList) {
    conversationsList.innerHTML =
      '<p class="chat-sidebar-msg">Chargement...</p>';
  }

  const conversations = await getConversations();
  afficherConversations(conversations);
}

document.addEventListener("click", (e) => {
  if (
    !e.target.closest(".chat-reaction-bar") &&
    !e.target.closest(".chat-reaction-badge")
  ) {
    document
      .querySelectorAll(".chat-reaction-bar")
      .forEach((el) => el.remove());
  }
});

initialiser();
