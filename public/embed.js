(function () {
  const currentScript = document.currentScript;
  const apiBase =
    (currentScript && currentScript.dataset.apiBase) ||
    (currentScript && new URL(currentScript.src).origin) ||
    window.location.origin;
  const storageKey = "mlp-chatbot-session";
  const transcriptKey = "mlp-chatbot-transcript";
  const voiceKey = "mlp-chatbot-voice-enabled";
  const state = loadState();

  injectStyles(`${apiBase}/widget.css`);
  createWidget();

  function createWidget() {
    if (document.getElementById("mlp-chatbot-root")) {
      return;
    }

    const root = document.createElement("div");
    root.id = "mlp-chatbot-root";
    root.innerHTML = `
      <button class="mlp-launcher" aria-label="Open chat">
        <span class="mlp-launcher__icon">Chat</span>
      </button>
      <div class="mlp-tooltip" hidden>Have a project in mind? I can help.</div>
      <section class="mlp-panel" aria-hidden="true">
        <header class="mlp-header">
          <button class="mlp-back" aria-label="Close chat">←</button>
          <div>
            <strong>My Landscaping Project</strong>
            <div class="mlp-subtitle">Chat with Jason’s assistant</div>
          </div>
          <button class="mlp-voice" aria-label="Toggle voice">🔊</button>
        </header>
        <div class="mlp-messages"></div>
        <div class="mlp-quick-replies"></div>
        <form class="mlp-form">
          <input id="mlp-input" class="mlp-input" type="text" placeholder="Type your message..." autocomplete="off" />
          <button type="button" class="mlp-mic" id="mlp-voice-btn" aria-label="Speak message">🎤</button>
          <button class="mlp-send" type="submit">Send</button>
        </form>
      </section>
    `;

    document.body.appendChild(root);

    const micBtn = root.querySelector("#mlp-voice-btn");
    const input = root.querySelector("#mlp-input");

  if (micBtn && input && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  micBtn.addEventListener("click", () => {
    recognition.start();
    micBtn.textContent = "🎙️";
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
  };

  recognition.onend = () => {
    micBtn.textContent = "🎤";
  };

  recognition.onerror = () => {
    micBtn.textContent = "🎤";
  };
}
    const launcher = root.querySelector(".mlp-launcher");
    const tooltip = root.querySelector(".mlp-tooltip");
    const panel = root.querySelector(".mlp-panel");
    const backButton = root.querySelector(".mlp-back");
    const voiceButton = root.querySelector(".mlp-voice");
    const messagesEl = root.querySelector(".mlp-messages");
    const quickRepliesEl = root.querySelector(".mlp-quick-replies");
    const form = root.querySelector(".mlp-form");
    const input = root.querySelector(".mlp-input");

    voiceButton.classList.toggle("is-on", state.voiceEnabled);

    renderMessages(messagesEl);
    renderQuickReplies(quickRepliesEl, state.suggestions || ["Deck staining", "Power washing", "Get a quote"]);

    launcher.addEventListener("click", openChat);
    backButton.addEventListener("click", closeChat);
    voiceButton.addEventListener("click", toggleVoice);
    form.addEventListener("submit", handleSubmit);

    setTimeout(() => {
      if (!state.messages.length) {
        tooltip.hidden = false;
        tooltip.textContent = "Hey — quick question: are you looking to clean or restore something?";
      }
    }, 9000);

    setTimeout(() => {
      tooltip.hidden = true;
    }, 18000);

    if (!state.messages.length) {
      const greeting =
        "Hi — I can help with deck staining, power washing, or talk through a bigger outdoor project and point you to the right next step. What are you looking to take care of?";
      pushMessage("assistant", greeting);
      renderMessages(messagesEl);
    }

    function openChat() {
      panel.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
      tooltip.hidden = true;
      input.focus();
    }

    function closeChat() {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
    }

    function toggleVoice() {
      state.voiceEnabled = !state.voiceEnabled;
      localStorage.setItem(voiceKey, String(state.voiceEnabled));
      voiceButton.classList.toggle("is-on", state.voiceEnabled);
    }

    async function handleSubmit(event) {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) {
        return;
      }

      input.value = "";
      pushMessage("user", value);
      renderMessages(messagesEl);
      setTyping(messagesEl, true);

      try {
        const response = await fetch(`${apiBase}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sessionId: state.sessionId,
            message: value,
            pageUrl: window.location.href,
            pageTitle: document.title
          })
        });

        const data = await response.json();
        state.sessionId = data.sessionId || state.sessionId;
        state.suggestions = data.suggestions || [];
        state.actions = data.actions || [];
        saveState();

        setTyping(messagesEl, false);
        pushMessage("assistant", data.reply, data.actions || []);
        renderMessages(messagesEl);
        renderQuickReplies(quickRepliesEl, data.suggestions || []);

        if (state.voiceEnabled) {
          speakText(data.reply);
        }
      } catch (_error) {
        setTyping(messagesEl, false);
        pushMessage(
          "assistant",
          "I hit a small snag there. You can still request an estimate here: https://www.mylandscapingproject.ca/free-estimate"
        );
        renderMessages(messagesEl);
      }
    }

    function renderMessages(container) {
      container.innerHTML = "";

      state.messages.forEach((message) => {
        const bubble = document.createElement("div");
        bubble.className = `mlp-message mlp-message--${message.role}`;

        const text = document.createElement("div");
        text.className = "mlp-bubble";
        text.innerHTML = linkify(message.text);
        bubble.appendChild(text);

        if (Array.isArray(message.actions)) {
          const actionsWrap = document.createElement("div");
          actionsWrap.className = "mlp-inline-actions";

          message.actions.forEach((action) => {
            const actionEl = document.createElement("a");
            actionEl.className = "mlp-action";
            actionEl.textContent = action.label;
            actionEl.href = action.url;
            if (action.type === "link") {
              actionEl.target = "_blank";
              actionEl.rel = "noopener noreferrer";
            }
            actionsWrap.appendChild(actionEl);
          });

          bubble.appendChild(actionsWrap);
        }

        container.appendChild(bubble);
      });

      container.scrollTop = container.scrollHeight;
    }

    function renderQuickReplies(container, items) {
      container.innerHTML = "";
      items.slice(0, 3).forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mlp-chip";
        button.textContent = item;
        button.addEventListener("click", () => {
          input.value = item;
          form.requestSubmit();
        });
        container.appendChild(button);
      });
    }
  }

  function setTyping(container, show) {
    const existing = container.querySelector(".mlp-typing");
    if (show && !existing) {
      const typing = document.createElement("div");
      typing.className = "mlp-typing";
      typing.textContent = "thinking...";
      container.appendChild(typing);
      container.scrollTop = container.scrollHeight;
      return;
    }

    if (!show && existing) {
      existing.remove();
    }
  }

  function pushMessage(role, text, actions) {
    state.messages.push({
      role: role,
      text: text,
      actions: actions || []
    });
    state.messages = state.messages.slice(-40);
    saveState();
  }

  function saveState() {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        sessionId: state.sessionId,
        suggestions: state.suggestions || [],
        actions: state.actions || []
      })
    );
    localStorage.setItem(transcriptKey, JSON.stringify(state.messages));
  }

  function loadState() {
    const saved = parseJson(localStorage.getItem(storageKey), {});
    const transcript = parseJson(localStorage.getItem(transcriptKey), []);
    return {
      sessionId: saved.sessionId || generateId(),
      suggestions: saved.suggestions || [],
      actions: saved.actions || [],
      messages: Array.isArray(transcript) ? transcript : [],
      voiceEnabled: localStorage.getItem(voiceKey) === "true"
    };
  }

  function parseJson(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function generateId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `mlp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function injectStyles(href) {
    if (document.querySelector(`link[href="${href}"]`)) {
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function speakText(text) {
    if (!("speechSynthesis" in window)) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text.replace(/https?:\/\/\S+/g, ""));
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((voice) => /david|mark|guy|daniel/i.test(voice.name)) ||
      voices.find((voice) => /male/i.test(voice.name)) ||
      voices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.rate = 0.95;
    utterance.pitch = 0.8;
    utterance.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function linkify(text) {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    return escaped.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }
})();
