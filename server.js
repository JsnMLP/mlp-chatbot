import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import nodemailer from "nodemailer";
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
const dataDir = path.join(__dirname, "data");
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
      actions: [],
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
  } else if (/\b(power wash|power washing|pressure wash|pressure washing|clean my deck|wash my deck|driveway|patio|interlock)\b/i.test(lower)) {
    session.serviceRequested = "Power washing";
    session.flowPath = "core";
  } else if (/\b(landscap|garden|construction|fence|stone|siding|outdoor|backyard|yard)\b/i.test(lower)) {
    if (!session.serviceRequested) {
      session.serviceRequested = "Broader project inquiry";
    }
    session.flowPath = "broader";
  }

  if (!session.projectContext && message.length > 18) {
    if (/\b(freshen|hasn'?t been done|years|weathered|peeling|dirty|mold|grey|old stain|first time|algae|slippery|stain)\b/i.test(lower)) {
      session.projectContext = message;
    }
  }

  if (!session.projectScope && /\b(\d+\s*(sq|square|foot|feet|ft|sqft|sf)|small|medium|large|two levels|single level|stairs|railings)\b/i.test(lower)) {
    session.projectScope = message;
  }

  if (!session.timeline && /\b(this week|next week|this month|next month|spring|summer|asap|soon|before|by |urgent|just exploring)\b/i.test(lower)) {
    session.timeline = message;
  }

  if (!session.budgetFrame && /\b(cost-effective|simple|thorough|long-lasting|premium|budget)\b/i.test(lower)) {
    session.budgetFrame = message;
  }

  if (!session.surfaces && /\b(deck|fence|stone|siding|patio|driveway|concrete|interlock)\b/i.test(lower)) {
    session.surfaces = message;
  }

  if (!session.projectDetails && message.length > 24) {
    session.projectDetails = message;
  }

  if (/\b(quote|estimate|book|consult|pricing|price|cost|how much)\b/i.test(lower)) {
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

  if (/\bpricing|price|cost|how much\b/i.test(lower)) {
    guidance.type = "pricing";
    guidance.objective =
      "Answer directly using the user's exact project details. If square footage is provided, calculate a rough estimate at $0.50/sq ft with a $150 minimum plus HST. Do not invent examples. Guide them to https://www.mylandscapingproject.ca/power-washing and offer photos for a more precise quote.";
    return guidance;
  }

  if (session.wantsHuman) {
    guidance.type = "human";
    guidance.questionToAsk = false;
    guidance.objective =
      "Keep the tone professional and concise. Offer direct contact details without using buttons.";
    return guidance;
  }

  if ((session.readyForEstimate || meaningfulResponses >= 3) && !session.consentToEmail) {
    guidance.type = "email-consent";
    guidance.objective =
      "Invite them to move forward naturally and ask one clear question only.";
    return guidance;
  }

  if (session.consentToEmail && !session.name) {
    guidance.type = "capture-name";
    guidance.objective =
      "Ask for their name in one short question only.";
    return guidance;
  }

  if (session.consentToEmail && !session.email) {
    guidance.type = "capture-email";
    guidance.objective =
      "Ask for the best email address in one short question only.";
    return guidance;
  }

  if (session.consentToEmail && session.email && !session.phone && !session.phoneCaptureComplete) {
    guidance.type = "capture-phone";
    guidance.objective =
      "Ask for a phone number as optional. Keep it easy to skip.";
    return guidance;
  }

  if (session.consentToEmail && session.email) {
    guidance.type = "wrap-up";
    guidance.questionToAsk = false;
    guidance.objective =
      "Confirm next steps briefly without repeating details already covered.";
    return guidance;
  }

  if (session.hesitant) {
    guidance.type = "hesitant";
    guidance.objective =
      "Reassure them briefly and ask the next most useful question.";
  }

  if (!session.serviceRequested) {
    guidance.type = "project-type";
    guidance.objective =
      "Ask what they are looking to take care of: deck staining, power washing, or something else. One question only.";
    return guidance;
  }

  if (session.flowPath === "core") {
    if (!session.projectContext) {
      guidance.type = "core-context";
      guidance.objective =
        "Acknowledge the service request and ask one useful follow-up question.";
      return guidance;
    }

    if (!session.projectScope) {
      guidance.type = "core-scope";
      guidance.objective =
        "Ask roughly how large the area is. One question only.";
      return guidance;
    }

    if (!session.timeline) {
      guidance.type = "core-timeline";
      guidance.objective =
        "Ask when they were hoping to have it completed. One question only.";
      return guidance;
    }

    if (!session.budgetFrame && enoughEngagement && !session.readyForEstimate) {
      guidance.type = "core-budget";
      guidance.objective =
        "Ask whether they want something simple and cost-effective or a more thorough result. One question only.";
      return guidance;
    }
  }

  if (session.flowPath === "broader") {
    if (!session.projectDetails) {
      guidance.type = "broader-details";
      guidance.objective =
        "Ask what they are looking to get done. One question only.";
      return guidance;
    }

    if (!session.surfaces) {
      guidance.type = "broader-surface-bridge";
      guidance.objective =
        "Ask whether decks, fences, stone, siding, patios, or driveways are involved. One question only.";
      return guidance;
    }

    if (!session.timeline) {
      guidance.type = "broader-timeline";
      guidance.objective =
        "Ask whether this is happening soon or they are just exploring. One question only.";
      return guidance;
    }
  }

  guidance.type = "general-next-step";
  guidance.questionToAsk = false;
  guidance.objective =
    "Guide them to the next logical step in a concise, professional way.";

  return guidance;
}

function buildScriptedReply({ session, message, guidance }) {
  const powerWashIntent = detectPowerWashingIntent(message, session, guidance);
  if (!powerWashIntent) {
    return null;
  }

  return {
    reply: buildPowerWashingReply(powerWashIntent, message),
    actions: []
  };
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

  if (/\b(price|pricing|cost|how much|quote|rate|per square foot|sq ft|square foot)\b/i.test(lower)) {
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

  if (intent === "powerwash-pricing" && squareFootage) {
    const basePrice = Math.max(squareFootage * powerWashingRate, powerWashingMinimum);
    const totalWithHst = basePrice * (1 + hstRate);
    return `Based on the ${squareFootage} sq ft you mentioned, the rough price is ${formatCurrency(basePrice)} plus HST, or about ${formatCurrency(totalWithHst)} total. Final pricing can shift a bit depending on buildup and access. Service details: ${powerWashingPageUrl} If you'd like a more precise quote, send a couple of photos to ${businessEmail} or call ${businessPhoneDisplay}.`;
  }

  const responses = {
    "powerwash-inquiry": `Power washing is usually worthwhile when the main concern is ${concern}. It improves appearance, helps with slippery buildup, and protects the surface when it is cleaned properly. Service details: ${powerWashingPageUrl} What area are you looking to have cleaned?`,
    "powerwash-pricing": `I can give you a rough estimate once I know the approximate square footage. Pricing is ${formatCurrency(powerWashingRate)}/sq ft with a ${formatCurrency(powerWashingMinimum)} minimum, plus HST. Service details: ${powerWashingPageUrl} If you prefer, send a couple of photos to ${businessEmail} for a more precise quote.`,
    "powerwash-objection": `Lower prices are out there, but the real difference is whether the surface is cleaned properly without damage. My pricing is ${formatCurrency(powerWashingRate)}/sq ft with a ${formatCurrency(powerWashingMinimum)} minimum, plus HST, and the focus is a proper result rather than a quick rinse. Service details: ${powerWashingPageUrl} If you'd like a more precise quote, send a couple of photos to ${businessEmail}.`,
    "powerwash-sealing": `My focus is on cleaning the surface properly first, because that is where most of the visible improvement comes from. In many cases, once the surface is fully cleaned, sealing is not necessary right away. Service details: ${powerWashingPageUrl} If you'd like, send a couple of photos to ${businessEmail} and I can advise based on the condition.`,
    "powerwash-sealing-repeat": `Sealing can have its place, but the first priority is getting the surface properly cleaned. Without that step, sealing will not perform the way it should. Service details: ${powerWashingPageUrl} If you'd like a more precise recommendation, send a couple of photos to ${businessEmail}.`,
    "powerwash-booking": `Most projects can be quoted without a site visit. Service details: ${powerWashingPageUrl} If you'd like a more precise quote, send a couple of photos and the address to ${businessEmail} or call ${businessPhoneDisplay}.`,
    "powerwash-trust": `I like to be clear about expectations before anything starts. Most surfaces respond very well to a proper cleaning, but heavier spots like oil, algae, or mortar need to be assessed honestly. Service details: ${powerWashingPageUrl} If you'd like a more precise quote, send a couple of photos to ${businessEmail} or call ${businessPhoneDisplay}.`,
    "powerwash-delay": `That works. Service details: ${powerWashingPageUrl} When you're ready, send a couple of photos to ${businessEmail} or call ${businessPhoneDisplay} and I can give you a more precise quote.`
  };

  return responses[intent] || responses["powerwash-inquiry"];
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
- Professional, confident, concise
- Never casual, robotic, or repetitive

Critical rules:
- Always anchor the reply to the user's exact input
- Never introduce hypothetical examples unless the user asks for them
- If the user gives square footage for power washing, calculate a rough estimate at $0.50/sq ft with a $150 minimum plus HST
- Ask one question at a time
- Do not repeat information already given
- Do not guess timelines or availability
- Keep replies to 2-4 short sentences max
- Do not produce buttons, quick replies, or CTA labels
- For power washing, direct to https://www.mylandscapingproject.ca/power-washing and optionally invite photos for a more precise quote

Session summary:
${JSON.stringify(leadSummary, null, 2)}

Recent transcript:
${transcript}

Latest user message:
${message}

Current objective:
${guidance.objective}

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
    "core-scope": "That helps. Roughly how big is the area we're working with?",
    "core-timeline": "Makes sense. When were you hoping to have this completed?",
    "core-budget": "Would you prefer something simple and cost-effective, or a more thorough result?",
    "broader-details": "Can you walk me through what you're looking to get done?",
    "broader-surface-bridge": "Are there any surfaces involved like decks, fences, stone, siding, patios, or driveways that may need cleaning or staining?",
    "broader-timeline": "Is this something you're planning to do soon, or are you just exploring options right now?",
    "email-consent": "Would you like me to send a short recap with next steps?",
    "capture-name": "What name should I put on the recap?",
    "capture-email": "What's the best email to send this to?",
    "capture-phone": "If you'd like, you can also share a phone number for follow-up, or just say skip.",
    "wrap-up": "I'll send a quick recap with next steps shortly.",
    "pricing": "Pricing depends on the size, condition, and scope of the work. If you'd like, tell me the approximate square footage and I can give you a rough starting point.",
    "human": `If you'd prefer to talk it through directly, you can call Jason at ${businessPhoneHref}.`
  };

  return {
    reply:
      map[guidance.type] ||
      "Happy to help. Tell me a bit about the project and I'll guide you to the right next step."
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
    subject: "Your Project Summary - My Landscaping Project",
    text: [
      `Hi ${summary.name || "there"},`,
      "",
      "Thanks for reaching out to My Landscaping Project.",
      "",
      "Here's a quick summary of what we discussed:",
      `Service: ${summary.serviceRequested || "Project inquiry"}`,
      `Project details: ${summary.projectDetails || "Not provided"}`,
      `Timeline: ${summary.timeline || "Not provided"}`,
      "",
      "Next step:",
      "Request your free estimate here: https://www.mylandscapingproject.ca/free-estimate",
      "",
      "If it's easier to talk it through, you can also call Jason directly: +1 647-272-7171",
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
