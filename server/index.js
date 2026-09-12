import "dotenv/config"
import express from "express"
import cors from "cors"
import { GoogleGenerativeAI } from "@google/generative-ai"

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: "20kb" }))

const URL_PATTERN = /https?:\/\/[^\s"')\]]+/gi

const SYSTEM_PROMPT = `You are TrustLens, a cautious fraud analyst. Analyse the submitted text for scam indicators.

First, classify what the text IS doing:
- DIRECT SOLICITATION — The text itself is attempting to recruit, request money/credentials, or convince the reader to take an action.
- QUOTED FOR INVESTIGATION — The user is submitting a suspicious message they received for analysis. Assess the quoted content as a solicitation.
- EDUCATIONAL OR WARNING CONTENT — The text primarily describes or warns about scam tactics with surrounding commentary.
- MALICIOUS DISGUISE — The text copies a legitimate warning format but contains fraudulent requests.

Return ONLY valid JSON with this exact structure:
{
  "verdict": "SCAM",
  "confidence": 97,
  "scam_type": "Customs / Delivery Fee Scam",
  "summary": "1-3 sentence explanation in the message's language.",
  "red_flags": [
    { "severity": "critical", "title": "Urgency", "explanation": "The message pressures immediate action." }
  ],
  "highlighted_phrases": [
    { "phrase": "urgent action required", "flag_index": 0 }
  ],
  "roast": "Short light roast, max 20 words. Omit for LEGIT.",
  "advice": ["Action 1", "Action 2", "Action 3"],
  "next_move": "What the scammer would likely ask for next, or empty for LEGIT.",
  "uae_references": [],
  "platform_advice": "Platform-specific reporting guidance (e.g. 'Forward to 7726 for UAE SMS scams')."
}

RULES:
- verdict: SCAM, SUSPICIOUS, or LEGIT
- confidence: integer 0-100 (model estimate, not verified probability)
- red_flags: each has severity ("critical" or "warning"), title (short name), explanation with evidence
- highlighted_phrases: array pointing to exact substrings from the original message that triggered each flag. Each entry has phrase (the exact text) and flag_index (which red_flags item this relates to, 0-based). Keep phrases short — a few words or a clause — and match the original text case exactly.
- next_move: 1-2 sentences predicting what the scammer would ask for next. Empty string for LEGIT.
- platform_advice: specific reporting steps relevant to the platform (SMS, WhatsApp, email, LinkedIn, Telegram, etc.). Include country-specific numbers where applicable (e.g. UAE: forward SMS to 7726).
- advice: 3-5 practical actions
- uae_references: official UAE reporting/support channels relevant to the scam type
- When uncertain, prefer SUSPICIOUS over confidently LEGIT`

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

function extractUrls(text) {
  const urls = []
  let match
  const re = new RegExp(URL_PATTERN.source, "gi")
  while ((match = re.exec(text)) !== null) {
    urls.push(match[0])
    if (match.index === re.lastIndex) re.lastIndex++
  }
  return [...new Set(urls.map(u => u.replace(/[)\]}>]+$/, "")))]
}

async function checkUrlSafeBrowsing(url, apiKey) {
  if (!apiKey) return null
  try {
    const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "trustlens", clientVersion: "1.0.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION", "THREAT_TYPE_UNSPECIFIED"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: urls.map(u => ({ url: u })),
        },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.matches ? data.matches.map(m => m.threatType) : []
  } catch {
    return null
  }
}

app.post("/api/analyze", asyncHandler(async (req, res) => {
  const { message, lang, platform } = req.body

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" })
  }

  if (message.length > 10000) {
    return res.status(400).json({ error: "Message too long (max 10000 characters)" })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: "Server not configured (missing API key)" })
  }

  // Extract URLs and optionally check against Safe Browsing
  const urls = extractUrls(message)
  let urlThreats = null
  const safeBrowsingKey = process.env.SAFE_BROWSING_API_KEY
  if (urls.length > 0 && safeBrowsingKey) {
    urlThreats = await checkUrlSafeBrowsing(urls, safeBrowsingKey)
  }

  const modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash"

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2560,
    },
    systemInstruction: SYSTEM_PROMPT,
  })

  const userContent = `Platform: ${platform || "unknown"}\nUser language: ${lang || "en"}\nURLs found in message: ${urls.length > 0 ? urls.join(", ") : "none"}\nSafe Browsing result: ${urlThreats ? urlThreats.join(", ") : "not checked or no threats"}\n\nMessage to analyse:\n${message}`

  const result = await model.generateContent(userContent)
  const text = result.response.text()

  const cleaned = text.replace(/```json?\n?/gi, "").replace(/```\n?/g, "").trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return res.status(500).json({ error: "Invalid response from AI" })
  }

  let parsed
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return res.status(500).json({ error: "Invalid response from AI" })
  }

  if (!["SCAM", "SUSPICIOUS", "LEGIT"].includes(parsed.verdict)) {
    return res.status(500).json({ error: "Invalid verdict from AI" })
  }

  const response = {
    verdict: parsed.verdict,
    confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, Math.round(parsed.confidence))) : 50,
    scam_type: typeof parsed.scam_type === "string" ? parsed.scam_type : "",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags.map((f) => ({
      severity: f.severity === "critical" ? "critical" : "warning",
      signal: typeof f.title === "string" ? f.title : "Signal",
      evidence: typeof f.explanation === "string" ? f.explanation : "",
    })) : [],
    highlighted_phrases: Array.isArray(parsed.highlighted_phrases) ? parsed.highlighted_phrases.filter(h => typeof h.phrase === "string" && typeof h.flag_index === "number") : [],
    roast: typeof parsed.roast === "string" ? parsed.roast : "",
    recommended_actions: Array.isArray(parsed.advice) ? parsed.advice.filter(a => typeof a === "string").slice(0, 5) : [],
    next_move: typeof parsed.next_move === "string" && parsed.verdict !== "LEGIT" ? parsed.next_move : "",
    platform_advice: typeof parsed.platform_advice === "string" ? parsed.platform_advice : "",
    uae_references: Array.isArray(parsed.uae_references) ? parsed.uae_references.filter(r => typeof r === "string").slice(0, 4) : [],
    urls_checked: urls,
    url_threats: urlThreats,
  }

  if (response.red_flags.length === 0) {
    response.red_flags = [{ severity: "warning", signal: "No specific flags", evidence: "No clear scam signals were found in the supplied text." }]
  }

  res.json(response)
}))

app.use((err, req, res, _next) => {
  console.error("[Gemini Error]", { name: err.name, message: err.message, status: err.status })
  if (err.message && err.message.includes("API_KEY")) return res.status(500).json({ error: "Invalid API key" })
  if (err.message && err.message.includes("SAFETY")) return res.status(422).json({ error: "Content filtered by safety settings" })
  if (err.name === "AbortError" || err.message?.includes("timed out")) return res.status(504).json({ error: "Request timed out" })
  if (err.status === 404 || err.message?.includes("not found")) return res.status(500).json({ error: "Gemini model not found" })
  res.status(500).json({ error: "Analysis failed" })
})

app.listen(PORT, () => {
  const keyPresent = process.env.GEMINI_API_KEY ? "yes" : "no"
  const sbPresent = process.env.SAFE_BROWSING_API_KEY ? "yes" : "no"
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash (default)"
  console.log(`TrustLens API running on http://localhost:${PORT}`)
  console.log(`  GEMINI_API_KEY: ${keyPresent}`)
  console.log(`  SAFE_BROWSING_API_KEY: ${sbPresent}`)
  console.log(`  GEMINI_MODEL: ${model}`)
})