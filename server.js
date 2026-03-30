import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const publicAppUrl = process.env.PUBLIC_APP_URL || `http://localhost:${port}`;
const businessEmail = process.env.BUSINESS_EMAIL || "info@mylandscapingproject.ca";
const businessPhoneDisplay = process.env.BUSINESS_PHONE_DISPLAY || "(647) 272-7171";
const businessPhoneHref = process.env.BUSINESS_PHONE_HREF || "tel:+16472727171";
const powerWashingPageUrl = "https://www.mylandscapingproject.ca/power-washing";
const powerWashingRate = 0.5;
const powerWashingMinimum = 150;
const hstRate = 0.13;
const dataDir = process.env.RENDER
  ? path.join(os.tmpdir(), "mlp-chatbot-data")
  : path.join(__dirname, "data");
const sessions = new Map();

if (!existsSync(dataDir)) {
  await fs.mkdir(dataDir, { recursive: true });
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const smtpConfigured =
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.SMTP_FROM;

const mailer = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
  : null;

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN === "*" ? true : process.env.ALLOWED_ORIGIN?.split(",") || true
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    openaiConfigured: Boolean(openai),
    emailConfigured: Boolean(mailer),
    now: new Date().toISOString()
  });
});

app.get("/embed.js", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "embed.js"));
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My Landscaping Project Chatbot</title>
    <style>
      body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: linear-gradient(135deg, #f6f1e7, #eef4ec); color: #163126; }
      main { max-width: 760px; margin: 0 auto; padding: 48px 20px 72px; }
      .card { background: rgba(255,255,255,.88); border: 1px solid rgba(22,49,38,.12); border-radius: 20px; padding: 28px; box-shadow: 0 20px 50px rgba(22,49,38,.08); }
      code { display: block; padding: 14px; border-radius: 12px; background: #163126; color: #f3efe4; overflow-x: auto; font-family: Consolas, monospace; font-size: 14px; }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>My Landscaping Project Chatbot</h1>
        <p>The chatbot backend is running.</p>
        <p>Paste this script into a custom HTML or JavaScript block on your website:</p>
        <code>&lt;script src="${publicAppUrl}/embed.js" data-api-base="${publicAppUrl}"&gt;&lt;/script&gt;</code>
      </div>
    </main>
  </body>
</html>`);
});

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();
    const pageUrl = String(req.body.pageUrl || "").trim();
    const pageTitle = String(req.body.pageTitle || "").trim();
    const sessionId = String(req.body.sessionId || crypto.randomUUID());

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    const session = getOrCreateSession(sessionId);
    if (pageUrl) {
      session.pageHistory.push({ pageUrl, pageTitle, at: new Date().toISOString() });
    }

    updateSessionFromMessage(session, message);
    session.messages.push({ role: "user", text: message, at: new Date().toISOString() });
    await appendJsonl("chat-log.jsonl", {
      sessionId,
      role: "user",
      message,
      pageUrl,
      pageTitle,
      at: new Date().toISOString()
    });

    const guidance = buildGuidance(session, message);
    const scriptedReply = buildScriptedReply({ session, message, guidance });
    const aiReply = scriptedReply
      ? scriptedReply
      : openai
        ? await generateAssistantReply({ session, message, guidance })
        : fallbackReply(guidance);

    session.messages.push({ role: "assistant", text: aiReply.reply, at: new Date().toISOString() });
    applyPostReplyState(session, guidance);

    if (shouldSendRecap(session) && !session.emailSummarySent) {
      await sendLeadRecap(session);
    }

    await persistSessionSnapshot(session);
    await appendJsonl("chat-log.jsonl", {
      sessionId,
      role: "assistant",
      message: aiReply.reply,
      guidance,
      at: new Date().toISOString()
    });

    return res.json({
      sessionId,
      reply: aiReply.reply,
      suggestions: [],
      actions: aiReply.actions || [],
      lead: buildLeadSummary(session),
      state: {
        flowPath: session.flowPath,
        questionCount: session.questionCount,
        recapReady: shouldSendRecap(session),
        openaiConfigured: Boolean(openai),
        emailConfigured: Boolean(mailer)
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "The assistant ran into a problem. Please try again.",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/session/:id", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found." });
  }

  res.json({
    sessionId: session.id,
    lead: buildLeadSummary(session),
    messages: session.messages
  });
});

app.listen(port, () => {
  console.log(`My Landscaping Project chatbot running at ${publicAppUrl}`);
});

function getOrCreateSession(sessionId) {
  const existing = sessions.get(sessionId);
  if (existing) {
    return existing;
  }

  const session = {
    id: sessionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    pageHistory: [],
    flowPath: "unknown",
    questionCount: 0,
    emailSummarySent: false,
    lastGuidanceType: null,
    serviceRequested: null,
    broaderProjectType: null,
    projectContext: null,
    projectScope: null,
    timeline: null,
    budgetFrame: null,
    surfaces: null,
    projectDetails: null,
    hesitant: false,
    readyForEstimate: false,
    wantsHuman: false,
    name: null,
    email: null,
    phone: null,
    consentToEmail: false,
    phoneCaptureComplete: false
  };

  sessions.set(sessionId, session);
  return session;
}

function updateSessionFromMessage(session, message) {
  const lower = message.toLowerCase();
  session.updatedAt = new Date().toISOString();

  const emailMatch = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    session.email = emailMatch[0];
  }

  const phoneMatch = message.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/);
  if (phoneMatch) {
    session.phone = phoneMatch[0];
    session.phoneCaptureComplete = true;
  }

  if (!session.name && looksLikeName(message)) {
    session.name = cleanName(message);
  }

  if (/\b(skip|no phone|rather not|not right now)\b/i.test(lower) && session.lastGuidanceType === "capture-phone") {
    session.phoneCaptureComplete = true;
  }

  if (/\b(deck stain|deck staining|stain my deck|restore my deck|deck refinishing)\b/i.test(lower)) {
    session.serviceRequested = "Deck staining";
    session.flowPath = "core";
  } else if (/\b(power wash|power washing|pressure wash|pressure washing|clean my deck|wash my deck)\b/i.test(lower)) {
    session.serviceRequested = "Power washing";
    session.flowPath = "core";
  } else if (/\b(landscap|garden|construction|fence|patio|interlock|stone|siding|outdoor|backyard|yard)\b/i.test(lower)) {
    if (!session.serviceRequested) {
      session.serviceRequested = "Broader project inquiry";
    }
    session.flowPath = "broader";
  }

  if (!session.projectContext && message.length > 18) {
    if (/\b(freshen|hasn'?t been done|years|weathered|peeling|dirty|mold|grey|old stain|first time)\b/i.test(lower)) {
      session.projectContext = message;
    }
  }

  if (!session.projectScope && /\b(\d+\s*(sq|square|foot|feet|ft)|small|medium|large|two levels|single level|stairs|railings)\b/i.test(lower)) {
    session.projectScope = message;
  }

  if (!session.timeline && /\b(this week|next week|this month|next month|spring|summer|asap|soon|before|by |urgent|just exploring)\b/i.test(lower)) {
    session.timeline = message;
  }

  if (!session.budgetFrame && /\b(cost-effective|simple|thorough|long-lasting|premium|budget)\b/i.test(lower)) {
    session.budgetFrame = message;
  }

  if (!session.surfaces && /\b(deck|fence|stone|siding|patio)\b/i.test(lower)) {
    session.surfaces = message;
  }

  if (!session.projectDetails && message.length > 24) {
    session.projectDetails = message;
  }

  if (/\b(quote|estimate|book|consult|pricing|price|cost)\b/i.test(lower)) {
    session.readyForEstimate = true;
  }

  if (/\b(call|phone|talk to someone|talk to jason|speak to someone|human)\b/i.test(lower)) {
    session.wantsHuman = true;
  }

  if (/\b(no pressure|not sure|just exploring|curious|maybe later|unsure)\b/i.test(lower)) {
    session.hesitant = true;
  }

  if (/\b(yes|sure|okay|ok|please do|sounds good|go ahead|send it)\b/i.test(lower) && session.lastGuidanceType === "email-consent") {
    session.consentToEmail = true;
  }
}

function buildGuidance(session, message) {
  const lower = message.toLowerCase();
  const responseCount = session.messages.filter((entry) => entry.role === "user").length;
  const enoughEngagement = responseCount >= 2;
  const meaningfulResponses = countMeaningfulAnswers(session);

  const guidance = {
    objective: "",
    directLink: null,
    suggestions: [],
    actions: [],
    type: "general",
    questionToAsk: true
  };

  if (/\bpricing|price|cost\b/i.test(lower)) {
    guidance.type = "pricing";
    guidance.objective =
      "Explain that pricing varies based on size, condition, prep work, and finish. Do not guess numbers. Point them to https://www.mylandscapingproject.ca/pricing and offer a proper estimate at https://www.mylandscapingproject.ca/free-estimate.";
    guidance.directLink = "https://www.mylandscapingproject.ca/pricing";
    guidance.suggestions = ["Get a quote", "Deck staining", "Power washing"];
    guidance.actions = [
      { type: "link", label: "View pricing", url: "https://www.mylandscapingproject.ca/pricing" },
      { type: "link", label: "Free estimate", url: "https://www.mylandscapingproject.ca/free-estimate" }
    ];
    return guidance;
  }

  if (session.wantsHuman) {
    guidance.type = "human";
    guidance.questionToAsk = false;
    guidance.objective =
      "Acknowledge that talking directly can be easier. Offer Jason's text number and the free estimate page. Keep it personal, concise, and reassuring.";
    guidance.actions = [
      { type: "call", label: "Call Jason", url: "tel:+16472727171" },
      { type: "link", label: "Request an estimate", url: "https://www.mylandscapingproject.ca/free-estimate" }
    ];
    guidance.suggestions = ["Call Jason", "Get a quote"];
    return guidance;
  }

  if ((session.readyForEstimate || meaningfulResponses >= 3) && !session.consentToEmail) {
    guidance.type = "email-consent";
    guidance.objective =
      "Invite them to get a quick estimate and ask whether you can send a short recap with next steps. Mention that estimates depend on project details. Ask only one clear question.";
    guidance.actions = [
      { type: "link", label: "Free estimate", url: "https://www.mylandscapingproject.ca/free-estimate" }
    ];
    guidance.suggestions = ["Yes, send it", "Get a quote", "Call Jason"];
    return guidance;
  }

  if (session.consentToEmail && !session.name) {
    guidance.type = "capture-name";
    guidance.objective =
      "Thank them and ask for their name so you can prepare the recap and estimate handoff. One short question only.";
    guidance.suggestions = [];
    return guidance;
  }

  if (session.consentToEmail && !session.email) {
    guidance.type = "capture-email";
    guidance.objective =
      "Ask for the best email address to send their recap and next steps to. One short question only.";
    guidance.suggestions = [];
    return guidance;
  }

  if (session.consentToEmail && session.email && !session.phone && !session.phoneCaptureComplete) {
    guidance.type = "capture-phone";
    guidance.objective =
      "Ask for a phone number as optional. Make it easy to skip. One short question only.";
    guidance.suggestions = ["Skip for now"];
    return guidance;
  }

  if (session.consentToEmail && session.email) {
    guidance.type = "wrap-up";
    guidance.questionToAsk = false;
    guidance.objective =
      "Confirm that you will send a recap and next steps by email, then guide them to the free estimate page and offer the Call Jason option. Do not promise availability or pricing.";
    guidance.actions = [
      { type: "link", label: "Free estimate", url: "https://www.mylandscapingproject.ca/free-estimate" },
      { type: "call", label: "Call Jason", url: "tel:+16472727171" }
    ];
    guidance.suggestions = ["Free estimate", "Call Jason"];
    return guidance;
  }

  if (session.hesitant) {
    guidance.type = "hesitant";
    guidance.objective =
      "Reassure them there is no pressure, offer a rough idea of what to expect, and keep the door open. Then ask the next most helpful qualifying question.";
  }

  if (!session.serviceRequested) {
    guidance.type = "project-type";
    guidance.objective =
      "Ask what they are looking to take care of: deck staining, power washing, or something else. Friendly, relaxed, one question only.";
    guidance.suggestions = ["Deck staining", "Power washing", "Something else"];
    return guidance;
  }

  if (session.flowPath === "core") {
    if (!session.projectContext) {
      guidance.type = "core-context";
      guidance.objective =
        "Acknowledge the service request and ask whether it has not been done in a while or if they are mostly looking to freshen it up. One question only.";
      guidance.suggestions = ["Hasn't been done in a while", "Just freshen it up"];
      return guidance;
    }

    if (!session.projectScope) {
      guidance.type = "core-scope";
      guidance.objective =
        "Acknowledge their context and ask roughly how big the area is. One question only.";
      guidance.suggestions = ["Small area", "Medium area", "Large area"];
      return guidance;
    }

    if (!session.timeline) {
      guidance.type = "core-timeline";
      guidance.objective =
        "Acknowledge the scope and ask when they were hoping to have it completed. One question only.";
      guidance.suggestions = ["ASAP", "Next few weeks", "Just exploring"];
      return guidance;
    }

    if (!session.budgetFrame && enoughEngagement && !session.readyForEstimate) {
      guidance.type = "core-budget";
      guidance.objective =
        "Ask naturally whether they want something simple and cost-effective or a more thorough, long-lasting result. One question only.";
      guidance.suggestions = ["Simple and cost-effective", "Thorough and long-lasting"];
      return guidance;
    }
  }

  if (session.flowPath === "broader") {
    if (!session.projectDetails) {
      guidance.type = "broader-details";
      guidance.objective =
        "Reassure them and ask what they are looking to get done, or what they are envisioning and what is currently there. One question only.";
      guidance.suggestions = ["Backyard project", "Garden work", "Something else"];
      return guidance;
    }

    if (!session.surfaces) {
      guidance.type = "broader-surface-bridge";
      guidance.objective =
        "Ask whether there are any surfaces involved like decks, fences, stone, or siding that might need cleaning or staining as part of the project. One question only.";
      guidance.suggestions = ["Deck", "Fence", "Stone", "No surfaces"];
      return guidance;
    }

    if (!session.timeline) {
      guidance.type = "broader-timeline";
      guidance.objective =
        "Ask whether they are planning to do this soon or just exploring options right now. One question only.";
      guidance.suggestions = ["Soon", "Just exploring"];
      return guidance;
    }
  }

  guidance.type = "general-next-step";
  guidance.questionToAsk = false;
  guidance.objective =
    "Guide them toward the next logical step with a quick estimate option and the service page that fits best. Keep it concise and helpful.";
  guidance.actions = [
    { type: "link", label: "Free estimate", url: "https://www.mylandscapingproject.ca/free-estimate" }
  ];
  guidance.suggestions = ["Get a quote", "Call Jason"];

  if (session.serviceRequested === "Deck staining") {
    guidance.directLink = "https://www.mylandscapingproject.ca/deck-staining";
    guidance.actions.unshift({
      type: "link",
      label: "Deck staining page",
      url: "https://www.mylandscapingproject.ca/deck-staining"
    });
  } else if (session.serviceRequested === "Power washing") {
    guidance.directLink = "https://www.mylandscapingproject.ca/power-washing";
    guidance.actions.unshift({
      type: "link",
      label: "Power washing page",
      url: "https://www.mylandscapingproject.ca/power-washing"
    });
  } else {
    guidance.actions.push({
      type: "call",
      label: "Call Jason",
      url: "tel:+16472727171"
    });
  }

  return guidance;
}

function buildScriptedReply({ session, message, guidance }) {
  const powerWashIntent = detectPowerWashingIntent(message, session, guidance);
  if (!powerWashIntent) {
    return null;
  }

  return buildPowerWashingReply(powerWashIntent, message);
}

function detectPowerWashingIntent(message, session, guidance) {
  const lower = message.toLowerCase();
  const hasPowerWashKeywords = /\b(power wash|power washing|pressure wash|pressure washing|driveway|patio|interlock|concrete|algae|surface dirt)\b/i.test(lower);
  const serviceHint = session.serviceRequested === "Power washing" || hasPowerWashKeywords;
  const squareFootage = extractSquareFootage(message);

  if (!serviceHint) {
    return null;
  }

  if (squareFootage) {
    return "powerwash-pricing";
  }

  if (/\b(seal|sealing|sealed)\b/i.test(lower)) {
    if (/\b(still|but|what if|do you also|can you also|also seal|seal it too|want sealing|again)\b/i.test(lower)) {
      return "powerwash-sealing-repeat";
    }
    return "powerwash-sealing";
  }

  if (/\b(send photos|photos later|i'?ll send photos|later|tomorrow|get back to you|follow up)\b/i.test(lower)) {
    return "powerwash-delay";
  }

  if (/\b(guarantee|guaranteed|will it come out|how clean|what if it doesn'?t|expectation|realistic)\b/i.test(lower)) {
    return "powerwash-trust";
  }

  if (/\b(when can you come|when can you start|when are you available|book|booking|come out|quote it|quote this|estimate this|next step)\b/i.test(lower)) {
    return "powerwash-booking";
  }

  if (/\b(\$100|100 dollars|hundred bucks|cheaper|lower price|too much|expensive|overpriced|i'?ve seen 100)\b/i.test(lower)) {
    return "powerwash-objection";
  }

  if (/\b(price|pricing|cost|how much|quote|rate|per square foot|sq ft|square foot|2-car|two car)\b/i.test(lower)) {
    return "powerwash-pricing";
  }

  if (/\b(driveway|patio|grime|dirty|slippery|algae|surface dirt|worth it|should i|thinking about)\b/i.test(lower)) {
    return "powerwash-inquiry";
  }

  if (!hasPowerWashKeywords) {
    return null;
  }

  return guidance.type === "pricing" ? "powerwash-pricing" : "powerwash-inquiry";
}

function buildPowerWashingReply(intent, message = "") {
  const squareFootage = extractSquareFootage(message);
  const concern = summarizePowerWashingConcern(message);
  const actions = buildPowerWashingButtons();

  if (intent === "powerwash-pricing" && squareFootage) {
    const basePrice = Math.max(squareFootage * powerWashingRate, powerWashingMinimum);
    const totalWithHst = basePrice * (1 + hstRate);
    return {
      reply: `Based on the ${squareFootage} sq ft you mentioned, the rough price is ${formatCurrency(basePrice)} plus HST, or about ${formatCurrency(totalWithHst)} total. Final pricing can vary slightly depending on buildup, staining, and the type of material.\n\nFor more details, you can take a look here: [action:View Power Washing Details]\n\nIf you'd like a more precise quote, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,
      actions
    };
  }

  const responses = {
    "powerwash-inquiry": `Power washing is usually worth it when the main concern is ${concern}. It improves appearance, helps with slippery buildup, and protects the surface when it is cleaned properly.\n\nFor more details, you can take a look here: [action:View Power Washing Details]\n\nIf you'd like a more precise quote, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,
    "powerwash-pricing": `I can give you a rough estimate once I know the approximate square footage. Pricing is ${formatCurrency(powerWashingRate)}/sq ft with a ${formatCurrency(powerWashingMinimum)} minimum, plus HST.\n\nFor more details, you can take a look here: [action:View Power Washing Details]\n\nIf you'd like a more precise quote, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,
    "powerwash-objection": `Lower prices are out there, but the main difference is whether the surface is cleaned properly without damage. My pricing is ${formatCurrency(powerWashingRate)}/sq ft with a ${formatCurrency(powerWashingMinimum)} minimum, plus HST, and the goal is a proper result rather than a quick rinse.\n\nFor more details, you can take a look here: [action:View Power Washing Details]\n\nIf you'd like a more precise quote, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,
    "powerwash-sealing": `My focus is on cleaning the surface properly first, because that is where most of the visible improvement comes from. In many cases, once the surface is fully cleaned, sealing is not necessary right away.\n\nFor more details, you can take a look here: [action:View Power Washing Details]\n\nIf you'd like a more precise recommendation, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,
    "powerwash-sealing-repeat": `Sealing can have its place, but the first priority is getting the surface properly cleaned. Without that step, sealing will not perform the way it should.\n\nFor more details, you can take a look here: [action:View Power Washing Details]\n\nIf you'd like a more precise recommendation, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,
    "powerwash-booking": `Most projects can be quoted without a site visit.\n\nFor more details, you can take a look here: [action:View Power Washing Details]\n\nIf you'd like a more precise quote, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,
    "powerwash-trust": `I like to be clear about expectations before anything starts. Most surfaces respond very well to a proper cleaning, but heavier spots like oil, algae, or mortar need to be assessed honestly.\n\nFor more details, you can take a look here: [action:View Power Washing Details]\n\nIf you'd like a more precise quote, you can [action:Send Photos by Email] or [action:Text (647) 272-7171].`,
    "powerwash-delay": `That works.\n\nFor more details, you can take a look here: [action:View Power Washing Details]\n\nWhen you're ready, you can [action:Send Photos by Email] or [action:Text (647) 272-7171] for a more precise quote.`
  };

  return {
    reply: responses[intent] || responses["powerwash-inquiry"],
    actions
  };
}

function buildPowerWashingButtons() {
  return [
    { type: "link", label: "View Power Washing Details", url: powerWashingPageUrl },
    { type: "email", label: "Send Photos by Email", url: `mailto:${businessEmail}` },
    { type: "sms", label: "Text (647) 272-7171", url: "sms:6472727171" }
  ];
}

function extractSquareFootage(message) {
  const match = message.match(/(\d+(?:[.,]\d+)?)\s*(?:sq\.?\s*ft|sqft|square\s*feet|square\s*foot|sf)\b/i);
  if (!match) {
    return null;
  }

  return Number(match[1].replace(",", ""));
}

function summarizePowerWashingConcern(message) {
  const lower = message.toLowerCase();
  if (/\balgae\b/.test(lower)) {
    return "algae buildup";
  }
  if (/\bstain|staining\b/.test(lower)) {
    return "staining";
  }
  if (/\bslipp|slippery\b/.test(lower)) {
    return "slippery buildup";
  }
  if (/\bpatio\b/.test(lower)) {
    return "a patio that needs cleaning";
  }
  if (/\bdriveway\b/.test(lower)) {
    return "a driveway that needs cleaning";
  }
  return "dirt and buildup on the surface";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(value);
}

async function generateAssistantReply({ session, message, guidance }) {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const leadSummary = buildLeadSummary(session);
  const transcript = session.messages.slice(-8).map((entry) => `${entry.role}: ${entry.text}`).join("\n");

  const prompt = `
You are Jason's website assistant for My Landscaping Project in Toronto, Canada.

Business focus:
- Primary specialties: deck staining and power washing
- Related broader inquiries should be handled consultatively first, not referred out immediately
- Always look for opportunities to help with deck staining, power washing, prep, cleaning, or finishing

Tone:
- Professional, friendly, slightly playful
- Reassuring, capable, concise
- Never overwhelming

Critical rules:
- Ask one question at a time
- Acknowledge answers before moving on
- Always guide toward the next logical step
- Do not guess pricing
- Do not promise timelines or availability
- Clarify that estimates depend on project details
- If pricing comes up, say it varies and link to https://www.mylandscapingproject.ca/pricing
- If deck staining is relevant, you may direct to https://www.mylandscapingproject.ca/deck-staining
- If power washing is relevant, you may direct to https://www.mylandscapingproject.ca/power-washing
- If estimate/booking is relevant, you may direct to https://www.mylandscapingproject.ca/free-estimate
- If human fallback is relevant, mention they can text Jason at (647) 272-7171
- If the user is broader-service only and you cannot directly help, stay helpful and mention trusted partner support only after understanding the scope
- Keep replies to 2-4 short sentences max

Session summary:
${JSON.stringify(leadSummary, null, 2)}

Recent transcript:
${transcript}

Latest user message:
${message}

Current objective:
${guidance.objective}

Available quick replies:
${guidance.suggestions.join(", ") || "none"}

Respond with only the assistant message text.`;

  const response = await openai.responses.create({
    model,
    input: prompt
  });

  return {
    reply: extractText(response).trim() || fallbackReply(guidance).reply
  };
}

function fallbackReply(guidance) {
  const map = {
    "project-type": "What are you looking to take care of: deck staining, power washing, or something else?",
    "core-context": "Got it. Has this not been done in a while, or are you mostly looking to freshen it up?",
    "core-scope": "That helps. Roughly how big is the area we’re working with?",
    "core-timeline": "Makes sense. When were you hoping to have this completed?",
    "core-budget": "One quick thing: are you leaning toward something simple and cost-effective, or a more thorough, long-lasting result?",
    "broader-details": "Got it — I can definitely help point you in the right direction. Can you walk me through what you’re envisioning or what’s currently there?",
    "broader-surface-bridge": "That makes sense. Are there any surfaces involved like decks, fences, stone, or siding that might need cleaning or staining as part of the project?",
    "broader-timeline": "Helpful to know. Is this something you’re planning to do soon, or are you just exploring options right now?",
    "email-consent": "Sounds like a great project. Want me to send you a quick summary of this along with next steps? We can also line you up for a proper estimate once we have the details.",
    "capture-name": "Perfect. What name should I put on the recap?",
    "capture-email": "What’s the best email to send this to?",
    "capture-phone": "If you’d like, you can also share a phone number for follow-up, or just say skip.",
    "wrap-up": "Perfect — I’ll send you a quick recap along with next steps so you have everything in one place. You can also request your estimate here: https://www.mylandscapingproject.ca/free-estimate",
    "pricing": "Pricing can vary quite a bit depending on the size, condition, prep work, and finish, so I wouldn’t want to guess. You can get a better sense here: https://www.mylandscapingproject.ca/pricing, and if you want, the next step is a free estimate: https://www.mylandscapingproject.ca/free-estimate",
    "human": `Sometimes it is simply easier to talk it through. Feel free to text ${businessPhoneDisplay}, or request an estimate here: https://www.mylandscapingproject.ca/free-estimate`
  };

  return {
    reply:
      map[guidance.type] ||
      "Happy to help. Want to tell me a bit about the project, and I’ll point you to the best next step?"
  };
}

function applyPostReplyState(session, guidance) {
  session.lastGuidanceType = guidance.type;

  if (guidance.questionToAsk) {
    session.questionCount += 1;
  }
}

function shouldSendRecap(session) {
  return Boolean(session.consentToEmail && session.email);
}

async function sendLeadRecap(session) {
  const summary = buildLeadSummary(session);
  await appendJsonl("leads.jsonl", summary);

  if (!mailer) {
    session.emailSummarySent = true;
    await appendJsonl("email-log.jsonl", {
      sent: false,
      reason: "SMTP not configured",
      summary,
      at: new Date().toISOString()
    });
    return;
  }

  const projectLines = [
    `Name: ${summary.name || "Not provided"}`,
    `Email: ${summary.email || "Not provided"}`,
    `Phone: ${summary.phone || "Not provided"}`,
    `Service requested: ${summary.serviceRequested || "Not provided"}`,
    `Project details: ${summary.projectDetails || "Not provided"}`,
    `Timeline: ${summary.timeline || "Not provided"}`,
    "",
    "Conversation summary:",
    summary.conversationSummary || "No summary available."
  ].join("\n");

  await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to: businessEmail,
    subject: `New website lead: ${summary.serviceRequested || "Project inquiry"}`,
    text: projectLines
  });

  await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to: session.email,
    subject: "Your Project Summary – My Landscaping Project",
    text: [
      `Hi ${summary.name || "there"},`,
      "",
      "Thanks for reaching out to My Landscaping Project.",
      "",
      "Here’s a quick summary of what we discussed:",
      `Service: ${summary.serviceRequested || "Project inquiry"}`,
      `Project details: ${summary.projectDetails || "Not provided"}`,
      `Timeline: ${summary.timeline || "Not provided"}`,
      "",
      "Next step:",
      "Request your free estimate here: https://www.mylandscapingproject.ca/free-estimate",
      "",
      "If it’s easier to talk it through, you can also call Jason directly: +1 647-272-7171",
      "",
      "Talk soon,",
      "My Landscaping Project"
    ].join("\n")
  });

  session.emailSummarySent = true;
  await appendJsonl("email-log.jsonl", {
    sent: true,
    summary,
    at: new Date().toISOString()
  });
}

function buildLeadSummary(session) {
  const userMessages = session.messages
    .filter((entry) => entry.role === "user")
    .map((entry) => entry.text)
    .slice(-8)
    .join(" ");

  return {
    sessionId: session.id,
    name: session.name,
    email: session.email,
    phone: session.phone,
    serviceRequested: session.serviceRequested,
    projectDetails: session.projectDetails,
    projectContext: session.projectContext,
    projectScope: session.projectScope,
    timeline: session.timeline,
    budgetFrame: session.budgetFrame,
    surfaces: session.surfaces,
    wantsHuman: session.wantsHuman,
    wantsEstimate: session.readyForEstimate,
    conversationSummary: userMessages,
    updatedAt: session.updatedAt
  };
}

function countMeaningfulAnswers(session) {
  return [
    session.serviceRequested,
    session.projectContext || session.projectDetails,
    session.projectScope || session.surfaces,
    session.timeline
  ].filter(Boolean).length;
}

function looksLikeName(message) {
  const trimmed = message.trim();
  if (trimmed.length > 40 || trimmed.includes("@") || /\d/.test(trimmed)) {
    return false;
  }

  if (/^(yes|yeah|yep|sure|ok|okay|asap|soon|skip|no)$/i.test(trimmed)) {
    return false;
  }

  return /^(my name is |i'?m |i am )?[a-z]+(?: [a-z]+){0,2}$/i.test(trimmed);
}

function cleanName(message) {
  return message
    .trim()
    .replace(/^(my name is |i'?m |i am )/i, "")
    .replace(/\.$/, "");
}

async function appendJsonl(fileName, payload) {
  const filePath = path.join(dataDir, fileName);
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

async function persistSessionSnapshot(session) {
  const filePath = path.join(dataDir, `${session.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf8");
}

function extractText(response) {
  if (!response) {
    return "";
  }

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const chunks = [];
  for (const item of response.output || []) {
    if (item.type !== "message") {
      continue;
    }
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n");
}
