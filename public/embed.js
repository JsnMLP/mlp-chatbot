(function () {
  const currentScript = document.currentScript;
  const apiBase =
    (currentScript && currentScript.dataset.apiBase) ||
    (currentScript && new URL(currentScript.src).origin) ||
    window.location.origin;

  const storageKey = "mlp-chatbot-session-v3";
  const transcriptKey = "mlp-chatbot-transcript-v3";
  const voiceKey = "mlp-chatbot-voice-enabled-v3";
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
          <button class="mlp-back" type="button" aria-label="Close chat">&#8592;</button>
          <div>
            <strong>My Landscaping Project</strong>
            <div class="mlp-subtitle">Chat with Jason's assistant</div>
          </div>
          <button class="mlp-voice" type="button" aria-label="Toggle voice">&#128266;</button>
        </header>

        <div class="mlp-messages"></div>

        <form class="mlp-form">
          <textarea
            id="mlp-input"
            class="mlp-input"
            placeholder="Type your message..."
            rows="3"
          ></textarea>
          <button
            type="button"
            class="mlp-mic"
            id="mlp-voice-btn"
            aria-label="Speak message"
            title="Speak your message"
          >
            <span class="mlp-mic__icon">&#127908;</span>
          </button>
          <button class="mlp-send" type="submit">Send</button>
        </form>
      </section>

      <div class="mlp-recording-overlay" hidden>
        <div class="mlp-recording-card">
          <div class="mlp-recording-title">See text</div>
          <div class="mlp-recording-preview">Tap the mic and start speaking.</div>
          <div class="mlp-recording-bars" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span>
            <span></span><span></span><span></span><span></span><span></span>
            <span></span><span></span>
          </div>
          <div class="mlp-recording-actions">
            <button type="button" class="mlp-recording-cancel">Cancel</button>
            <button type="button" class="mlp-recording-use">Use text</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const launcher = root.querySelector(".mlp-launcher");
    const tooltip = root.querySelector(".mlp-tooltip");
    const panel = root.querySelector(".mlp-panel");
    const backButton = root.querySelector(".mlp-back");
    const voiceButton = root.querySelector(".mlp-voice");
    const messagesEl = root.querySelector(".mlp-messages");
    const form = root.querySelector(".mlp-form");
    const input = root.querySelector("#mlp-input");
    const micBtn = root.querySelector("#mlp-voice-btn");
    const overlay = root.querySelector(".mlp-recording-overlay");
    const preview = root.querySelector(".mlp-recording-preview");
    const cancelRecordingBtn = root.querySelector(".mlp-recording-cancel");
    const useRecordingBtn = root.querySelector(".mlp-recording-use");

    voiceButton.classList.toggle("is-on", state.voiceEnabled);

    setupMic({
      micBtn,
      input,
      overlay,
      preview,
      cancelRecordingBtn,
      useRecordingBtn
    });

    renderMessages(messagesEl);

    launcher.addEventListener("click", openChat);
    backButton.addEventListener("click", closeChat);
    voiceButton.addEventListener("click", toggleVoice);
    form.addEventListener("submit", handleSubmit);
    input.addEventListener("input", autoResizeTextarea);

    setTimeout(() => {
      if (!state.messages.length) {
        tooltip.hidden = false;
        tooltip.textContent = "Have a project in mind? I can help.";
      }
    }, 9000);

    setTimeout(() => {
      tooltip.hidden = true;
    }, 18000);

    if (!state.messages.length) {
      const greeting =
        "Hello. I can help with deck staining, power washing, or talk through a larger outdoor project and guide you to the right next step. What would you like to take care of?";
      pushMessage("assistant", greeting);
      renderMessages(messagesEl);
    }

    autoResizeTextarea();

    function autoResizeTextarea() {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 140) + "px";
    }

    function openChat() {
      panel.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
      tooltip.hidden = true;
      input.focus();
      autoResizeTextarea();
    }

    function closeChat() {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
    }

    function toggleVoice() {
      state.voiceEnabled = !state.voiceEnabled;
      sessionStorage.setItem(voiceKey, String(state.voiceEnabled));
      voiceButton.classList.toggle("is-on", state.voiceEnabled);
    }

    async function handleSubmit(event) {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) {
        return;
      }

      pushMessage("user", value);
      renderMessages(messagesEl);

      input.value = "";
      autoResizeTextarea();
      setTyping(messagesEl, "Thinking...");

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

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
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error("Request failed");
        }

        const data = await response.json();
        state.sessionId = data.sessionId || state.sessionId;
        saveMeta();

        setTyping(messagesEl, false);
        pushMessage("assistant", data.reply, data.actions || []);
        renderMessages(messagesEl);

        if (state.voiceEnabled) {
          speakText(data.reply);
        }
      } catch (_error) {
        setTyping(messagesEl, false);
        pushMessage(
          "assistant",
          "I'm having a bit of trouble retrieving a response right now, but I can still help guide you.",
          [
            { type: "email", label: "Send Photos by Email", url: "mailto:info@mylandscapingproject.ca" },
            { type: "sms", label: "Text (647) 272-7171", url: "sms:6472727171" }
          ]
        );
        renderMessages(messagesEl);
      }
    }

    function renderMessages(container) {
      container.innerHTML = "";

      state.messages.forEach((message) => {
        const bubbleWrap = document.createElement("div");
        bubbleWrap.className = `mlp-message mlp-message--${message.role}`;

        const bubble = document.createElement("div");
        bubble.className = "mlp-bubble";
        bubble.innerHTML = linkify(message.text);
        bubbleWrap.appendChild(bubble);

        if (Array.isArray(message.actions) && message.actions.length) {
          const actionsWrap = document.createElement("div");
          actionsWrap.className = "mlp-inline-actions";

          message.actions.forEach((action) => {
            const actionEl = document.createElement("a");
            actionEl.className = "mlp-action";
            actionEl.textContent = action.label;
            actionEl.href = action.url;

            if (action.type !== "email" && action.type !== "sms") {
              actionEl.target = "_blank";
              actionEl.rel = "noopener noreferrer";
            }

            actionsWrap.appendChild(actionEl);
          });

          bubbleWrap.appendChild(actionsWrap);
        }

        container.appendChild(bubbleWrap);
      });

      container.scrollTop = container.scrollHeight;
    }
  }

  function setupMic(parts) {
    const {
      micBtn,
      input,
      overlay,
      preview,
      cancelRecordingBtn,
      useRecordingBtn
    } = parts;

    if (!micBtn || !input || !overlay || !preview) {
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      micBtn.style.display = "none";
      return;
    }

    const recognition = new SpeechRecognition();
    let transcriptText = "";
    let listening = false;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    micBtn.addEventListener("click", () => {
      if (listening) {
        recognition.stop();
        return;
      }

      transcriptText = "";
      preview.textContent = "Listening...";
      overlay.hidden = false;

      try {
        recognition.start();
      } catch (_error) {
      }
    });

    cancelRecordingBtn.addEventListener("click", () => {
      transcriptText = "";
      recognition.stop();
      overlay.hidden = true;
      preview.textContent = "Tap the mic and start speaking.";
    });

    useRecordingBtn.addEventListener("click", () => {
      if (transcriptText.trim()) {
        input.value = transcriptText.trim();
        input.dispatchEvent(new Event("input"));
      }
      overlay.hidden = true;
      preview.textContent = "Tap the mic and start speaking.";
      input.focus();
    });

    recognition.onstart = () => {
      listening = true;
      micBtn.classList.add("is-listening");
      overlay.hidden = false;
      preview.textContent = "Listening...";
    };

    recognition.onresult = (event) => {
      transcriptText = event.results[0][0].transcript.trim();
      preview.textContent = "Captured. Tap Use text.";
    };

    recognition.onend = () => {
      listening = false;
      micBtn.classList.remove("is-listening");
    };

    recognition.onerror = () => {
      listening = false;
      micBtn.classList.remove("is-listening");
      preview.textContent = "Microphone permission was blocked or unavailable.";
    };
  }

  function setTyping(container, text) {
    const existing = container.querySelector(".mlp-typing");

    if (!text) {
      if (existing) {
        existing.remove();
      }
      return;
    }

    if (existing) {
      existing.textContent = text;
      return;
    }

    const typing = document.createElement("div");
    typing.className = "mlp-typing";
    typing.textContent = text;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
  }

  function pushMessage(role, text, actions) {
    state.messages.push({
      role,
      text,
      actions: actions || []
    });
    state.messages = state.messages.slice(-40);
    saveTranscript();
  }

  function saveTranscript() {
    sessionStorage.setItem(transcriptKey, JSON.stringify(state.messages));
    saveMeta();
  }

  function saveMeta() {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        sessionId: state.sessionId
      })
    );
  }

  function loadState() {
    const saved = parseJson(sessionStorage.getItem(storageKey), {});
    const transcript = parseJson(sessionStorage.getItem(transcriptKey), []);
    return {
      sessionId: saved.sessionId || generateId(),
      messages: Array.isArray(transcript) ? transcript : [],
      voiceEnabled: sessionStorage.getItem(voiceKey) === "true"
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

    return escaped
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n/g, "<br>")
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi, '<a href="mailto:$1">$1</a>');
  }
})();
