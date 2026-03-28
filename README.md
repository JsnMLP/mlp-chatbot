# My Landscaping Project Chatbot

A simple embeddable AI chatbot for the My Landscaping Project website.

It includes:

- an embeddable chat widget
- a backend connection to OpenAI
- lead capture
- recap email support
- chat logging for review

## What you need

1. Node.js 20 LTS from https://nodejs.org
2. An OpenAI API key
3. An email account you can use for SMTP sending

## How to run it locally

1. Open this folder in a terminal
2. Copy `.env.example` to a new file named `.env`
3. Open `.env` and fill in:
   - your OpenAI API key
   - your SMTP email settings
4. Run:

```bash
npm install
npm start
```

5. Open `http://localhost:3000`
6. You will see a page with the exact embed snippet for your site

## Important `.env` values

```env
PORT=3000
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini
PUBLIC_APP_URL=http://localhost:3000
ALLOWED_ORIGIN=*
BUSINESS_EMAIL=jason@mylandscapingproject.ca
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM="My Landscaping Project <jason@mylandscapingproject.ca>"
```

Notes:

- `OPENAI_MODEL=gpt-4.1-mini` keeps this simple and cost-conscious
- if SMTP is not set up yet, leads will still be logged, but recap emails will not send
- for production, change `PUBLIC_APP_URL` to your real live URL

## How to deploy it

The easiest option is Render.

1. Put this project in a GitHub repository
2. Create an account at https://render.com
3. Click `New +`
4. Choose `Web Service`
5. Connect your GitHub repo
6. Use:
   - Build command: `npm install`
   - Start command: `npm start`
   - Node version: `20`
7. Add the same environment variables from your `.env`
8. Deploy
9. Copy your live URL when Render finishes

Example live URL:

```text
https://mlp-chatbot.onrender.com
```

## Exact code to paste into Websitematic

In Websitematic, add a custom HTML or JavaScript block and paste:

```html
<script
  src="https://YOUR-BACKEND-URL/embed.js"
  data-api-base="https://YOUR-BACKEND-URL"
></script>
```

Replace `https://YOUR-BACKEND-URL` with your real live backend URL.

Example:

```html
<script
  src="https://mlp-chatbot.onrender.com/embed.js"
  data-api-base="https://mlp-chatbot.onrender.com"
></script>
```

## What the chatbot already does

- asks one question at a time
- supports deck staining and power washing inquiries
- handles broader project questions in a consultative way first
- offers `Call Jason` for people who want a human
- guides visitors toward:
  - the deck staining page
  - the power washing page
  - the pricing page
  - the free estimate page
- keeps the session alive in the browser while visitors move between pages
- stores logs in the `data` folder
