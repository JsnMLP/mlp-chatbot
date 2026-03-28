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
          <button class="mlp-back" aria-label="Close chat">&#8592;</button>
          <div>
            <strong>My Landscaping Project</strong>
            <div class="mlp-subtitle">Chat with Jason's assistant</div>
          </div>
          <button class="mlp-voice" aria-label="Toggle voice">&#128266;</button>
        </header>

        <div class="mlp-messages"></div>
        <div class="mlp-quick-replies"></div>

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
          <div class="mlp-recording-preview">Start speaking...</div>
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
    const quickRepliesEl = root.querySelector(".mlp-quick-replies");
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
    renderQuickReplies(quickRepliesEl, state.suggestions || ["Deck staining", "Power washing", "Get a quote"]);

    launcher.addEventListener("click", openChat);
    backButton.addEventListener("click", closeChat);
    voiceButton.addEventListener("click", toggleVoice);
    form.addEventListener("submit", handleSubmit);
    input.addEventListener("input", autoResizeTextarea);

    setTimeout(() => {
      if (!state.messages.length) {
        tooltip.hidden = false;
        tooltip.textContent = "Hey - quick question: are you looking to clean or restore something?";
      }
    }, 9000);

    setTimeout(() => {
      tooltip.hidden = true;
    }, 18000);

    if (!state.messages.length) {
      const greeting =
        "Hi - I can help with deck staining, power washing, or talk through a bigger outdoor project and point you to the right next step. What are you looking to take care of?";
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
      autoResizeTextarea();
      pushMessage("user", value);
      renderMessages(messagesEl);
      setTyping(messagesEl, "thinking...");

      let longWaitTimer = null;

      try {
        longWaitTimer = setTimeout(() => {
          setTyping(messagesEl, "Still working on it...");
        }, 8000);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 65000);

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
        clearTimeout(longWaitTimer);

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

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
        clearTimeout(longWaitTimer);
        setTyping(messagesEl, false);
        pushMessage(
          "assistant",
          "I hit a snag getting a reply back. You can still request an estimate here: https://www.mylandscapingproject.ca/free-estimate or call Jason directly at +1 647-272-7171."
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

        if (Array.isArray(message.actions) && message.actions.length) {
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
          autoResizeTextarea();
          form.requestSubmit();
        });
        container.appendChild(button);
      });
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
    let listening = false;
    let transcriptText = "";

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    micBtn.addEventListener("click", () => {
      if (listening) {
        recognition.stop();
        return;
      }

      transcriptText = "";
      preview.textContent = "Start speaking...";
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
      preview.textContent = "Start speaking...";
    });

    useRecordingBtn.addEventListener("click", () => {
      if (transcriptText.trim()) {
        input.value = transcriptText.trim();
        input.dispatchEvent(new Event("input"));
      }
      recognition.stop();
      overlay.hidden = true;
      input.focus();
    });

    recognition.onstart = () => {
      listening = true;
      micBtn.classList.add("is-listening");
      overlay.hidden = false;
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = 0; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += piece + " ";
        } else {
          interimText += piece;
        }
      }

      transcriptText = `${finalText}${interimText}`.trim();
      preview.textContent = transcriptText || "Listening...";
    };

    recognition.onend = () => {
      listening = false;
      micBtn.classList.remove("is-listening");
    };

    recognition.onerror = () => {
      listening = false;
      micBtn.classList.remove("is-listening");
      preview.textContent = "Mic permission was blocked or unavailable.";
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
