# TrustLens

**See beyond the surface.**

TrustLens analyses suspicious SMS, emails, DMs, and job offers for common scam signals — urgency, impersonation, payment requests, credential phishing, and more. Paste a message, get a verdict with evidence and recommended actions.

## Features

- **Three verdicts** — SCAM / SUSPICIOUS / LEGIT with model confidence estimate
- **Evidence breakdown** — specific red flags with severity and explanations
- **Context-aware classification** — distinguishes direct solicitations, quoted messages for investigation, educational content, and malicious disguises
- **Multi-language** — English and Arabic interface with RTL support
- **UAE-specific guidance** — official reporting channels for customs, telecom, bank, and cybercrime scams
- **Result sharing** — native Web Share API with clipboard fallback
- **Privacy-first** — no storage, no logging of user messages
- **PWA ready** — installable with manifest and service worker

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Backend | Express 5 |
| AI | Google Gemini API (`@google/generative-ai`) |
| Fonts | Fraunces (serif), IBM Plex Mono (mono), Noto Naskh Arabic |

## Getting started

```bash
# Clone the repo
git clone https://github.com/Areebaaazam/TrustLens.git
cd TrustLens

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

Edit `.env` and set your Gemini API key:

```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.6-flash
PORT=3001
```

Start both frontend and backend:

```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite + Express concurrently |
| `npm run dev:client` | Vite only |
| `npm run dev:api` | Express only |
| `npm run build` | Production build |
| `npm run lint` | Run oxlint |
| `npm run preview` | Preview production build |

## API

`POST /api/analyze`

```json
{
  "message": "Suspicious text here...",
  "lang": "en"
}
```

Returns:

```json
{
  "verdict": "SCAM",
  "confidence": 98,
  "scam_type": "Job / Employment Scam",
  "summary": "...",
  "red_flags": [
    { "severity": "critical", "signal": "Unrealistic Compensation", "evidence": "..." }
  ],
  "roast": "...",
  "recommended_actions": ["..."],
  "uae_references": ["..."]
}
```

## Prompt engineering

The Gemini system prompt includes context classification rules to avoid common failure modes:
- A **direct solicitation** (fake job offer) → SCAM
- A **trustLens warning about that offer** → LEGIT (its purpose is prevention)
- A **user asking "Is this a scam?" with a quoted message** → assesses the quoted content as a solicitation
- A **malicious message disguised as a warning** → SCAM

## Privacy

Submitted text is sent to an external AI service only while analysis runs. Nothing is stored or logged. Remove OTPs, account numbers, and other sensitive details before investigating.