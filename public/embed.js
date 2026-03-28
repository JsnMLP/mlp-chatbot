(function () {
  const currentScript = document.currentScript;
  const apiBase =
    (currentScript && currentScript.dataset.apiBase) ||
    (currentScript && new URL(currentScript.src).origin) ||
    window.location.origin;

  const hostPageUrl = window.location.href;
  const hostPageTitle = document.title;

  if (document.getElementById("mlp-chatbot-iframe-wrap")) {
    return;
  }

  const wrap = document.createElement("div");
  wrap.id = "mlp-chatbot-iframe-wrap";
  wrap.style.position = "fixed";
  wrap.style.right = "16px";
  wrap.style.bottom = "16px";
  wrap.style.zIndex = "2147483647";
  wrap.style.width = "380px";
  wrap.style.maxWidth = "calc(100vw - 24px)";
  wrap.style.height = "720px";
  wrap.style.maxHeight = "calc(100vh - 24px)";
  wrap.style.pointerEvents = "auto";

  const iframe = document.createElement("iframe");
  iframe.title = "My Landscaping Project Chat";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";
  iframe.style.background = "transparent";
  iframe.style.overflow = "hidden";
  iframe.style.borderRadius = "24px";
  iframe.setAttribute("allow", "microphone");
  iframe.setAttribute("scrolling", "no");

  const srcdoc = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<style>
  :root {
    --mlp-green: #CC3300;
    --mlp-green-dark: #992600;
    --mlp-text: #802000;
    --mlp-shadow: 0 20px 60px rgb(51, 13, 0);
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    font-family: Verdana, Geneva, sans-serif;
    background: transparent;
  }

  #root {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
  }

  .launcher {
    width: 68px;
    height: 68px;
    border: 0;
    border-radius: 999px;
    background: radial-gradient(circle at top, #ff6633, var(--mlp-green-dark));
    color: #fff;
    box-shadow: var(--mlp-shadow);
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .panel {
    width: 100%;
    height: 100%;
    display: none;
    flex-direction: column;
    overflow: hidden;
    border-radius: 24px;
    background:
      linear-gradient(180deg, rgba(255, 250, 242, 0.98), rgba(244, 236, 222, 0.98)),
      linear-gradient(135deg, #f7f1e8, #edf6ef);
    box-shadow: var(--mlp-shadow);
    border: 1px solid rgba(24,49,39,0.12);
  }

  .panel.open { display: flex; }

  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: linear-gradient(135deg, var(--mlp-green-dark), #cc3300);
    color: #fff;
    flex-shrink: 0;
  }

  .header strong {
    display: block;
    font-size: 17px;
  }

  .subtitle {
    font-size: 13px;
    opacity: 0.88;
  }

  .back, .voice, .send, .chip, .mic, .rec-cancel, .rec-use {
    border: 0;
    border-radius: 999px;
    cursor: pointer;
    font: inherit;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .back, .voice {
    width: 40px;
    height: 40px;
    background: rgba(255,255,255,0.14);
    color: #fff;
    font-size: 18px;
  }

  .messages {
    flex: 1 1 auto;
    min-height: 0;
    padding: 16px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .message {
    margin-bottom: 12px;
  }

  .message.user {
    text-align: right;
  }

  .bubble {
    display: inline-block;
    max-width: 88%;
    padding: 12px 14px;
    border-radius: 18px;
    line-height: 1.5;
    font-size: 15px;
    text-align: left;
    word-break: break-word;
  }

  .message.assistant .bubble {
    background: #fff;
    color: var(--mlp-text);
    border-bottom-left-radius: 6px;
    box-shadow: 0 12px 28px rgb(153, 51, 0);
  }

  .message.user .bubble {
    background: linear-gradient(135deg, var(--mlp-green), #cc3300);
    color: #fff;
    border-bottom-right-radius: 6px;
  }

  .quick {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 16px 12px;
    flex-shrink: 0;
  }

  .chip {
    min-height: 42px;
    padding: 10px 14px;
    background: rgb(255, 64, 0);
    color: var(--mlp-green-dark);
    font-size: 14px;
    font-weight: 700;
  }

  .form {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    padding: 16px;
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    flex-shrink: 0;
    border-top: 1px solid rgb(77, 19, 0);
    background: rgba(255,255,255,0.96);
  }

  .input {
    flex: 1;
    min-width: 0;
    min-height: 88px;
    max-height: 140px;
    padding: 14px;
    border-radius: 16px;
    border: 1px solid rgb(77, 19, 0);
    background: #fff;
    color: var(--mlp-text);
    resize: none;
    overflow-y: auto;
    line-height: 1.45;
    font: inherit;
  }

  .mic {
    width: 48px;
    min-width: 48px;
    height: 48px;
    background: linear-gradient(135deg, var(--mlp-green), #e63900);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: none;
  }

  .mic.listening {
    background: linear-gradient(135deg, #ff6633, var(--mlp-green));
  }

  .send {
    min-width: 76px;
    min-height: 48px;
    padding: 0 16px;
    background: linear-gradient(135deg, var(--mlp-green), #e63900);
    color: #fff;
    font-weight: 700;
  }

  .typing {
    margin: 0 16px 14px;
    color: rgb(102,26,0);
    font-size: 14px;
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 10;
    background: rgba(23,10,5,0.45);
    display: none;
    align-items: flex-end;
    justify-content: center;
    padding: 20px;
    padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  }

  .overlay.show {
    display: flex;
  }

  .rec-card {
    width: min(100%, 480px);
    background: #231714;
    color: #fff;
    border-radius: 24px;
    padding: 18px 18px 16px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.28);
  }

  .rec-title {
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 12px;
  }

  .rec-preview {
    min-height: 52px;
    font-size: 15px;
    line-height: 1.45;
    color: #f3ebe7;
    margin-bottom: 14px;
  }

  .bars {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 4px;
    height: 28px;
    margin-bottom: 16px;
  }

  .bars span {
    width: 4px;
    height: 8px;
    border-radius: 999px;
    background: #d7c6be;
    animation: bars 1s ease-in-out infinite;
  }

  .bars span:nth-child(2){animation-delay:.05s}
  .bars span:nth-child(3){animation-delay:.1s}
  .bars span:nth-child(4){animation-delay:.15s}
  .bars span:nth-child(5){animation-delay:.2s}
  .bars span:nth-child(6){animation-delay:.25s}
  .bars span:nth-child(7){animation-delay:.3s}
  .bars span:nth-child(8){animation-delay:.35s}
  .bars span:nth-child(9){animation-delay:.4s}
  .bars span:nth-child(10){animation-delay:.45s}
  .bars span:nth-child(11){animation-delay:.5s}
  .bars span:nth-child(12){animation-delay:.55s}

  .rec-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .rec-cancel, .rec-use {
    min-height: 42px;
    padding: 0 16px;
    font-weight: 700;
  }

  .rec-cancel {
    background: #453430;
    color: #fff;
  }

  .rec-use {
    background: linear-gradient(135deg, var(--mlp-green), #e63900);
    color: #fff;
  }

  @keyframes bars {
    0%,100% { height: 8px; opacity: .45; }
    50% { height: 26px; opacity: 1; }
  }

  @media (max-width: 680px) {
    .panel {
      border-radius: 0;
    }
  }
</style>
</head>
<body>
  <div id="root">
    <button class="launcher" id="launcher">Chat</button>

    <section class="panel" id="panel" aria-hidden="true">
      <header class="header">
        <button class="back" id="back">&#8592;</button>
        <div>
          <strong>My Landscaping Project</strong>
          <div class="subtitle">Chat with Jason's assistant</div>
        </div>
        <button class="voice" id="voice">&#128266;</button>
      </header>

      <div class="messages" id="messages"></div>
      <div class="quick" id="quick"></div>

      <form class="form" id="form">
        <textarea id="input" class="input" placeholder="Type your message..." rows="3"></textarea>
        <button type="button" class="mic" id="mic">&#127908;</button>
        <button type="submit" class="send">Send</button>
      </form>
    </section>

    <div class="overlay" id="overlay">
      <div class="rec-card">
        <div class="rec-title">See text</div>
        <div class="rec-preview" id="preview">Tap the mic and start speaking.</div>
        <div class="bars">
          <span></span><span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="rec-actions">
          <button type="button" class="rec-cancel" id="cancelRec">Cancel</button>
          <button type="button" class="rec-use" id="useRec">Use text</button>
        </div>
      </div>
    </div>
  </div>

<script>
(function () {
  const apiBase = ${JSON.stringify(apiBase)};
  const hostPageUrl = ${JSON.stringify(hostPageUrl)};
  const hostPageTitle = ${JSON.stringify(hostPageTitle)};
  const storageKey = "mlp-chatbot-session-v2";
  const transcriptKey = "mlp-chatbot-transcript-v2";
  const voiceKey = "mlp-chatbot-voice-enabled-v2";

  const launcher = document.getElementById("launcher");
  const panel = document.getElementById("panel");
  const back = document.getElementById("back");
  const voice = document.getElementById("voice");
  const messagesEl = document.getElementById("messages");
  const quickEl = document.getElementById("quick");
  const form = document.getElementById("form");
  const input = document.getElementById("input");
  const mic = document.getElementById("mic");
  const overlay = document.getElementById("overlay");
  const preview = document.getElementById("preview");
  const cancelRec = document.getElementById("cancelRec");
  const useRec = document.getElementById("useRec");

  const state = loadState();

  launcher.addEventListener("click", openChat);
  back.addEventListener("click", closeChat);
  voice.addEventListener("click", toggleVoice);
  form.addEventListener("submit", handleSubmit);
  input.addEventListener("input", autoResize);

  setupMic();
  renderMessages();
  renderQuickReplies(state.suggestions.length ? state.suggestions : ["Deck staining", "Power washing", "Get a quote"]);

  if (!state.messages.length) {
    pushMessage("assistant", "Hi - I can help with deck staining, power washing, or talk through a bigger outdoor project and point you to the right next step. What are you looking to take care of?");
    renderMessages();
  }

  autoResize();

  function openChat() {
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    launcher.style.display = "none";
    input.focus();
    autoResize();
  }

  function closeChat() {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    launcher.style.display = "inline-block";
  }

  function toggleVoice() {
    state.voiceEnabled = !state.voiceEnabled;
    sessionStorage.setItem(voiceKey, String(state.voiceEnabled));
    voice.classList.toggle("is-on", state.voiceEnabled);
  }

  function autoResize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;

    pushMessage("user", value);
    renderMessages();
    input.value = "";
    autoResize();
    setTyping("thinking...");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(function () {
        controller.abort();
      }, 45000);

      const response = await fetch(apiBase + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          message: value,
          pageUrl: hostPageUrl,
          pageTitle: hostPageTitle
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const data = await response.json();
      state.sessionId = data.sessionId || state.sessionId;
      state.suggestions = data.suggestions || [];
      saveMeta();

      setTyping("");
      pushMessage("assistant", data.reply, data.actions || []);
      renderMessages();
      renderQuickReplies(data.suggestions || []);

      if (state.voiceEnabled) {
        speakText(data.reply);
      }
    } catch (error) {
      setTyping("");
      pushMessage(
        "assistant",
        "I hit a snag getting a reply back. You can still request an estimate here: https://www.mylandscapingproject.ca/free-estimate"
      );
      renderMessages();
    }
  }

  function renderMessages() {
    messagesEl.innerHTML = "";
    state.messages.forEach(function (message) {
      const wrap = document.createElement("div");
      wrap.className = "message " + message.role;

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.innerHTML = linkify(message.text);

      wrap.appendChild(bubble);
      messagesEl.appendChild(wrap);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderQuickReplies(items) {
    quickEl.innerHTML = "";
    items.slice(0, 3).forEach(function (item) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.textContent = item;
      button.addEventListener("click", function () {
        input.value = item;
        autoResize();
        form.requestSubmit();
      });
      quickEl.appendChild(button);
    });
  }

  function setTyping(text) {
    const old = document.querySelector(".typing");
    if (old) old.remove();
    if (!text) return;

    const div = document.createElement("div");
    div.className = "typing";
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setupMic() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      mic.style.display = "none";
      return;
    }

    const recognition = new SpeechRecognition();
    let transcriptText = "";
    let listening = false;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    mic.addEventListener("click", function () {
      if (listening) {
        recognition.stop();
        return;
      }

      transcriptText = "";
      preview.textContent = "Listening...";
      overlay.classList.add("show");

      try {
        recognition.start();
      } catch (error) {
      }
    });

    cancelRec.addEventListener("click", function () {
      transcriptText = "";
      recognition.stop();
      overlay.classList.remove("show");
      preview.textContent = "Tap the mic and start speaking.";
    });

    useRec.addEventListener("click", function () {
      if (transcriptText.trim()) {
        input.value = transcriptText.trim();
        autoResize();
      }
      overlay.classList.remove("show");
      preview.textContent = "Tap the mic and start speaking.";
      input.focus();
    });

    recognition.onstart = function () {
      listening = true;
      mic.classList.add("listening");
      overlay.classList.add("show");
      preview.textContent = "Listening...";
    };

    recognition.onresult = function (event) {
      transcriptText = event.results[0][0].transcript.trim();
      preview.textContent = "Got it. Tap Use text.";
    };

    recognition.onend = function () {
      listening = false;
      mic.classList.remove("listening");
    };

    recognition.onerror = function () {
      listening = false;
      mic.classList.remove("listening");
      preview.textContent = "Mic permission was blocked or unavailable.";
    };
  }

  function pushMessage(role, text, actions) {
    state.messages.push({
      role: role,
      text: text,
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
    sessionStorage.setItem(storageKey, JSON.stringify({
      sessionId: state.sessionId,
      suggestions: state.suggestions || [],
      actions: state.actions || []
    }));
  }

  function loadState() {
    const saved = parseJson(sessionStorage.getItem(storageKey), {});
    const transcript = parseJson(sessionStorage.getItem(transcriptKey), []);
    return {
      sessionId: saved.sessionId || generateId(),
      suggestions: saved.suggestions || [],
      actions: saved.actions || [],
      messages: Array.isArray(transcript) ? transcript : [],
      voiceEnabled: sessionStorage.getItem(voiceKey) === "true"
    };
  }

  function parseJson(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function generateId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return "mlp-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function speakText(text) {
    if (!("speechSynthesis" in window)) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text.replace(/https?:\\/\\/\\S+/g, ""));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function linkify(text) {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }
})();
</script>
</body>
</html>
  `;

  iframe.srcdoc = srcdoc;
  wrap.appendChild(iframe);
  document.body.appendChild(wrap);

  function updateMobileSize() {
    if (window.innerWidth <= 680) {
      wrap.style.right = "0";
      wrap.style.bottom = "0";
      wrap.style.width = "100vw";
      wrap.style.maxWidth = "100vw";
      wrap.style.height = "100dvh";
      wrap.style.maxHeight = "100dvh";
      iframe.style.borderRadius = "0";
    } else {
      wrap.style.right = "16px";
      wrap.style.bottom = "16px";
      wrap.style.width = "380px";
      wrap.style.maxWidth = "calc(100vw - 24px)";
      wrap.style.height = "720px";
      wrap.style.maxHeight = "calc(100vh - 24px)";
      iframe.style.borderRadius = "24px";
    }
  }

  updateMobileSize();
  window.addEventListener("resize", updateMobileSize);
})();
