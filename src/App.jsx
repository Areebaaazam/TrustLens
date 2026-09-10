import { useState, useEffect, useRef, useCallback } from 'react'

const EXAMPLES = {
  customs: "Dubai Customs: Your package has been held. Pay 9 AED clearance fee within 24 hours to avoid return. Tap here: bit.ly/dxb-customs-9aed",
  telecom: "Du Alert: Your account will be suspended today due to incomplete verification. Update your details now: du-verification.ae/update",
  job: "Hi! I saw your profile. Earn 5,000 AED/week working part-time from home as an admin assistant. No experience needed! Reply YES to apply.",
}

const EXAMPLES_LABELS = {
  customs: "Customs scam",
  telecom: "Fake telecom SMS",
  job: "Fake job offer",
}

const STATUSES = [
  { en: "Reading message...", ar: "جارٍ قراءة الرسالة..." },
  { en: "Checking language patterns...", ar: "فحص أنماط اللغة..." },
  { en: "Examining urgency signals...", ar: "تحليل إشارات الاستعجال..." },
  { en: "Looking for manipulation tactics...", ar: "البحث عن أساليب التلاعب..." },
  { en: "Building your assessment...", ar: "إعداد التقييم..." },
]

const MIN_ANIMATION_MS = 2000

function App() {
  const [inputText, setInputText] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [statusIndex, setStatusIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [showResult, setShowResult] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [confirmExample, setConfirmExample] = useState(null)
  const [lang, setLang] = useState("en")
  const textareaRef = useRef(null)
  const resultRef = useRef(null)
  const startedAtRef = useRef(null)
  const cleanupRef = useRef(null)

  const t = (o) => (typeof o === "object" ? (o[lang] || o.en || "") : o)

  useEffect(() => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    if (!isAnalyzing) return
    startedAtRef.current = Date.now()
    const statusTimer = setInterval(() => setStatusIndex(i => (i + 1) % STATUSES.length), 400)
    const progressTimer = setInterval(() => {
      setProgress(Math.min(Math.round((Date.now() - startedAtRef.current) / MIN_ANIMATION_MS * 100), 100))
    }, 60)
    cleanupRef.current = () => { clearInterval(statusTimer); clearInterval(progressTimer) }
    return cleanupRef.current
  }, [isAnalyzing])

  const finishWithResult = useCallback((data) => {
    const elapsed = Date.now() - (startedAtRef.current || Date.now())
    if (cleanupRef.current) cleanupRef.current()
    const show = () => { setIsAnalyzing(false); setResult(data); setShowResult(true) }
    if (elapsed < MIN_ANIMATION_MS) { setTimeout(show, MIN_ANIMATION_MS - elapsed) } else { show() }
  }, [])

  const finishWithError = useCallback((msg) => {
    if (cleanupRef.current) cleanupRef.current()
    setIsAnalyzing(false); setError(msg)
  }, [])

  useEffect(() => {
    if (showResult && resultRef.current) resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [showResult])

  const handleInvestigate = useCallback(async () => {
    const text = inputText.trim()
    if (!text || isAnalyzing) return
    setError(null); setResult(null); setShowResult(false)
    setIsAnalyzing(true); setProgress(0); setStatusIndex(0)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, lang }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        finishWithError(body.error || `Server error (${res.status})`)
        return
      }
      finishWithResult(await res.json())
    } catch (err) {
      clearTimeout(timeoutId)
      finishWithError(err.name === "AbortError"
        ? t({ en: "Request timed out. Please try again.", ar: "انتهت المهلة. حاول مرة أخرى." })
        : t({ en: "Network error. Check your connection.", ar: "خطأ في الشبكة. تحقق من اتصالك." }))
    }
  }, [inputText, lang, isAnalyzing, finishWithResult, finishWithError, t])

  const resetAll = () => {
    setInputText(""); setResult(null); setShowResult(false)
    setIsAnalyzing(false); setProgress(0); setError(null)
    textareaRef.current?.focus()
  }

  const copyResult = async () => {
    if (!result) return
    const lines = [
      "TrustLens Assessment",
      `Verdict: ${result.verdict} (${result.confidence}% model confidence)`,
      "",
      lang === "ar" ? `ملخص: ${result.summary}` : `Summary: ${result.summary}`,
      "",
      lang === "ar" ? "الخطوات التالية:" : "Next steps:",
      ...result.recommended_actions.map((a, i) => `  ${i + 1}. ${a}`),
      "",
      lang === "ar" ? "هذا تقييم بالذكاء الاصطناعي — تحقق عبر القنوات الرسمية." : "AI assessment — verify through official channels.",
    ]
    try {
      await navigator.clipboard.writeText(lines.join("\n"))
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard denied */ }
  }

  const shareResult = async () => {
    if (!result) return
    const shareText = [
      `TrustLens: ${result.verdict} (${result.confidence}% confidence)`,
      result.summary,
      result.recommended_actions?.[0] ? `→ ${result.recommended_actions[0]}` : "",
      lang === "ar" ? "تقييم بالذكاء الاصطناعي — تحقق عبر القنوات الرسمية." : "AI assessment — verify through official channels.",
    ].filter(Boolean).join("\n\n")
    if (navigator.share) { try { await navigator.share({ title: "TrustLens", text: shareText }); return } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard denied */ }
  }

  const handleExampleClick = (key) => {
    if (inputText.trim()) { setConfirmExample(key); return }
    setInputText(EXAMPLES[key]); textareaRef.current?.focus()
  }

  const confirmUseExample = () => {
    if (!confirmExample) return
    setInputText(EXAMPLES[confirmExample]); setConfirmExample(null)
    textareaRef.current?.focus()
  }

  const verdictMeta = {
    SCAM: { color: "text-[var(--color-alert)]", dot: "🔴", bg: "bg-[var(--color-alert-bg)]", bar: "bg-[var(--color-alert)]", border: "border-[var(--color-alert)]/30" },
    SUSPICIOUS: { color: "text-[var(--color-caution)]", dot: "⚠️", bg: "bg-[var(--color-caution-bg)]", bar: "bg-[var(--color-caution)]", border: "border-[var(--color-caution)]/30" },
    LEGIT: { color: "text-[var(--color-verified)]", dot: "✅", bg: "bg-[var(--color-verified-bg)]", bar: "bg-[var(--color-verified)]", border: "border-[var(--color-verified)]/30" },
  }

  const isIdle = !isAnalyzing && !showResult && !error
  const isBusy = isAnalyzing
  const isDone = showResult && result
  const isError = error && !isAnalyzing && !showResult

  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] flex flex-col items-center px-4 sm:px-6 py-6 sm:py-10">

      <div className="w-full max-w-[760px] tl-container">

        {/* ──── Header ──── */}
        <header className="flex items-center justify-between mb-10 sm:mb-14">
          <div className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 26 26" fill="none" aria-hidden="true" className="shrink-0">
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
              <line x1="16.8" y1="16.8" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="font-serif font-semibold text-xl tracking-tight text-[var(--color-ink)]">TrustLens</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="px-2.5 py-1 text-xs font-medium bg-[var(--color-manila)] hover:bg-[var(--color-manila-2)] text-[var(--color-ink-soft)] rounded transition-colors cursor-pointer"
              aria-label={t({ en: "Switch to Arabic", ar: "التبديل إلى الإنجليزية" })}
            >
              {lang === "en" ? "AR" : "EN"}
            </button>
          </div>
        </header>

        <div className="relative">

          {/* ──── Input state ──── */}
          {isIdle && (
            <div className="transition-opacity duration-300 ease-in-out">
              <div className="mb-8 max-w-[620px] tl-hero">
                <h1 className="font-serif font-semibold text-[clamp(1.8rem,4vw,2.6rem)] leading-[1.08] tracking-[-0.01em] text-[var(--color-ink)]">
                  {t({ en: "Read between the lines before you reply.", ar: "اقرأ ما بين السطور قبل الرد." })}
                </h1>
                <p className="mt-4 text-base sm:text-[1.04rem] leading-relaxed text-[var(--color-ink-soft)] max-w-[52ch]">
                  {t({ en: "Paste a suspicious message to examine its wording and requests, understand the warning signs, and decide what to do next.", ar: "الصق رسالة مشبوهة لفحص صياغتها وطلباتها، وفهم علامات التحذير، وتحديد الخطوة التالية." })}
                </p>
              </div>

              <div className="border border-[var(--color-line)] bg-[var(--color-paper)] shadow-[6px_6px_0_rgba(21,34,56,0.14)] p-5 sm:p-6 tl-card">
                <label className="block text-xs text-[var(--color-ink-soft)] mb-2" htmlFor="message-input">
                  {t({ en: "Message under review", ar: "الرسالة قيد المراجعة" })}
                </label>
                <textarea
                  id="message-input"
                  ref={textareaRef}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder={t({ en: "Paste a suspicious SMS, email, DM, or job offer...", ar: "الصق رسالة مشبوهة..." })}
                  rows={5}
                  className="w-full bg-[#fffdf6] border border-[var(--color-line)] p-3.5 text-sm font-mono leading-relaxed text-[var(--color-ink)] placeholder-[var(--color-ink-soft)]/50 resize-y focus:outline-none focus:border-[var(--color-ink)] transition-colors break-words whitespace-pre-wrap"
                  style={{ minHeight: "140px", maxHeight: "400px" }}
                  onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleInvestigate() }}
                />

                <div className="flex items-center justify-between mt-3 mb-3">
                  <span className="text-xs text-[var(--color-ink-soft)]/60 tabular-nums">{inputText.length} / 10,000</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(EXAMPLES).map(key => (
                      <button
                        key={key}
                        onClick={() => handleExampleClick(key)}
                        className="px-2 py-0.5 text-xs font-mono bg-[var(--color-manila)] hover:bg-[var(--color-manila-2)] text-[var(--color-ink-soft)] rounded transition-colors cursor-pointer"
                      >
                        {EXAMPLES_LABELS[key]}
                      </button>
                    ))}
                  </div>
                </div>

                {confirmExample && (
                  <div className="mb-3 border border-[var(--color-line)] bg-[var(--color-manila)]/30 p-3 text-sm">
                    <p className="font-medium mb-1">{t({ en: "Replace current message?", ar: "استبدال الرسالة الحالية؟" })}</p>
                    <p className="text-xs text-[var(--color-ink-soft)] mb-2">{t({ en: "This will replace what you've written with a demo example.", ar: "سيؤدي هذا إلى استبدال ما كتبته بمثال تجريبي." })}</p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmExample(null)} className="px-3 py-1 text-xs font-medium border border-[var(--color-line)] hover:bg-[var(--color-manila)] transition-colors cursor-pointer">{t({ en: "Cancel", ar: "إلغاء" })}</button>
                      <button onClick={confirmUseExample} className="px-3 py-1 text-xs font-medium bg-[var(--color-navy-deep)] text-[var(--color-paper)] hover:opacity-90 transition-opacity cursor-pointer">{t({ en: "Use example", ar: "استخدام المثال" })}</button>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 mb-4">
                  <span className="text-xs text-[var(--color-ink-soft)]/50 shrink-0 mt-0.5">ⓘ</span>
                  <p className="text-xs text-[var(--color-ink-soft)]/60 leading-relaxed">
                    {t({ en: "Submitted text is sent to an external AI service for analysis. Remove OTPs, account numbers, and other sensitive details before investigating.", ar: "يُرسل النص المُقدم إلى خدمة ذكاء اصطناعي خارجية للتحليل. أزل رموز التحقق وأرقام الحسابات قبل التحليل." })}
                  </p>
                </div>

                <button
                  onClick={handleInvestigate}
                  disabled={!inputText.trim() || isAnalyzing}
                  className="w-full py-2.5 text-sm font-mono font-semibold bg-[var(--color-navy-deep)] text-[var(--color-paper)] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.98] cursor-pointer"
                >
                  {t({ en: "Analyze this message", ar: "تحليل هذه الرسالة" })}
                </button>
              </div>
            </div>
          )}

          {/* ──── Loading ──── */}
          {isBusy && (
            <div className="transition-opacity duration-300 ease-in-out" role="status" aria-live="polite">
              <div className="fixed inset-0 bg-[var(--color-paper)]/80 backdrop-blur-sm z-10" />
              <div className="relative z-20 bg-[var(--color-paper)] border border-[var(--color-line)] p-8 text-center max-w-sm mx-auto shadow-[6px_6px_0_rgba(21,34,56,0.14)]">
                <div className="w-7 h-7 mx-auto mb-4 border border-[var(--color-navy-deep)]/30 border-t-[var(--color-navy-deep)] rounded-full animate-spin" />
                <h3 className="font-serif font-semibold text-lg mb-2">{t({ en: "Analyzing message", ar: "جارٍ تحليل الرسالة" })}</h3>
                <p className="text-sm text-[var(--color-ink-soft)] mb-6 h-4 transition-all duration-200">{t(STATUSES[statusIndex])}</p>
                <div className="w-full h-0.5 bg-[var(--color-line)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--color-navy-deep)] rounded-full transition-all duration-[100ms] ease-linear" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* ──── Error ──── */}
          {isError && (
            <div className="transition-opacity duration-300 ease-in-out text-center">
              <div className="border border-[var(--color-alert)]/30 bg-[var(--color-alert-bg)]/50 p-8 max-w-sm mx-auto">
                <h3 className="font-serif font-semibold text-lg text-[var(--color-alert)] mb-2">{t({ en: "Could not complete analysis", ar: "تعذر إكمال التحليل" })}</h3>
                <p className="text-sm text-[var(--color-ink-soft)] mb-5">{error}</p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <button onClick={handleInvestigate} className="px-4 py-2 text-xs font-mono font-semibold bg-[var(--color-navy-deep)] text-[var(--color-paper)] hover:opacity-90 transition-opacity cursor-pointer">{t({ en: "Try again", ar: "إعادة المحاولة" })}</button>
                  <button onClick={() => setError(null)} className="px-4 py-2 text-xs font-mono border border-[var(--color-line)] hover:bg-[var(--color-manila)] transition-colors cursor-pointer">{t({ en: "Edit message", ar: "تعديل الرسالة" })}</button>
                </div>
              </div>
            </div>
          )}

          {/* ──── Result ──── */}
          {isDone && (
            <div ref={resultRef} className="transition-all duration-300 ease-in-out" style={{ opacity: showResult ? 1 : 0, transform: showResult ? "translateY(0)" : "translateY(6px)" }}>
              <div className="border border-[var(--color-line)] bg-[var(--color-paper)] shadow-[6px_6px_0_rgba(21,34,56,0.14)] overflow-hidden">

                {/* Verdict */}
                <div className={`p-6 sm:p-8 text-center border-b border-[var(--color-line)] ${verdictMeta[result.verdict].bg} tl-result-pad`}>
                  <span className="text-2xl block mb-2">{verdictMeta[result.verdict].dot}</span>
                  <p className={`font-serif font-semibold text-3xl sm:text-4xl tracking-tight ${verdictMeta[result.verdict].color} tl-verdict-text`}>{result.verdict}</p>
                  <div className="flex items-center justify-center gap-2.5 mt-4">
                    <div className="w-24 h-1 bg-[var(--color-line)] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${verdictMeta[result.verdict].bar}`} style={{ width: `${result.confidence || 0}%` }} />
                    </div>
                    <span className="font-mono text-xs text-[var(--color-ink-soft)]">{result.confidence || 0}%</span>
                  </div>
                  <p className="font-mono text-[10px] text-[var(--color-ink-soft)]/60 mt-1.5">{t({ en: "Model confidence — estimate, not measured accuracy.", ar: "ثقة النموذج — تقدير وليس دقة مقاسة." })}</p>
                </div>

                {/* Summary */}
                <div className="px-5 sm:px-6 py-4 border-b border-[var(--color-line)]">
                  {result.scam_type && <p className="font-mono text-xs text-[var(--color-ink-soft)] mb-1">{result.scam_type}</p>}
                  <p className="text-sm leading-relaxed">{result.summary}</p>
                  {result.verdict === "LEGIT" && (
                    <p className="mt-2 text-xs text-[var(--color-ink-soft)] leading-relaxed">
                      {t({ en: "No clear scam signals were found in the supplied text. The sender and any linked destination have not been verified.", ar: "لم يتم العثور على إشارات احتيال واضحة. لم يتم التحقق من المرسل أو أي وجهة مرتبطة." })}
                    </p>
                  )}
                </div>

                {/* Evidence */}
                {(result.red_flags || []).length > 0 && result.red_flags[0]?.signal !== "No specific flags" && (
                  <div className="px-5 sm:px-6 py-4 border-b border-[var(--color-line)]">
                    <h3 className="font-mono text-xs text-[var(--color-ink-soft)] mb-3">{t({ en: "What raised the flag", ar: "ما أثار الشك" })}</h3>
                    <div className="space-y-3">
                      {result.red_flags.map((flag, i) => (
                        <div key={i} className="flex gap-2.5">
                          <span className="text-xs mt-0.5 shrink-0">{flag.severity === "critical" ? "🔴" : "🟡"}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{flag.signal || ""}</p>
                            <p className="text-xs text-[var(--color-ink-soft)] mt-0.5 leading-relaxed">{flag.evidence || ""}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {(result.recommended_actions || []).length > 0 && (
                  <div className="px-5 sm:px-6 py-4 border-b border-[var(--color-line)]">
                    <h3 className="font-mono text-xs text-[var(--color-ink-soft)] mb-3">{t({ en: "Recommended actions", ar: "الإجراءات الموصى بها" })}</h3>
                    <div className="space-y-2.5">
                      {result.recommended_actions.map((action, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <span className="font-mono text-[10px] font-bold text-[var(--color-ink-soft)] mt-0.5 shrink-0 w-3.5 text-center">{i + 1}</span>
                          <span className="text-sm leading-relaxed">{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* UAE references + Roast */}
                <div className="px-5 sm:px-6 py-3 border-b border-[var(--color-line)]">
                  {(result.uae_references || []).length > 0 && (
                    <div className="mb-3">
                      <h4 className="font-mono text-[10px] text-[var(--color-ink-soft)] uppercase tracking-wider mb-1.5">{t({ en: "Official UAE reporting", ar: "الإبلاغ الرسمي" })}</h4>
                      {result.uae_references.map((ref, i) => <p key={i} className="text-xs text-[var(--color-ink-soft)] leading-relaxed">{ref}</p>)}
                      <p className="font-mono text-[10px] text-[var(--color-ink-soft)]/60 mt-1">{t({ en: "External contacts — we do not submit on your behalf.", ar: "جهات خارجية — لا نرسل نيابة عنك." })}</p>
                    </div>
                  )}
                  {result.roast && result.verdict !== "LEGIT" && (
                    <div>
                      <h4 className="font-mono text-[10px] text-[var(--color-ink-soft)] uppercase tracking-wider mb-1">{t({ en: "One last thing", ar: "ملاحظة أخيرة" })}</h4>
                      <p className="text-sm text-[var(--color-ink-soft)] italic leading-relaxed">&ldquo;{result.roast}&rdquo;</p>
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div className="px-5 sm:px-6 py-3 flex flex-col sm:flex-row gap-2">
                  <button onClick={resetAll} className="flex-1 py-2 text-xs font-mono font-semibold bg-[var(--color-navy-deep)] text-[var(--color-paper)] hover:opacity-90 transition-opacity cursor-pointer">{t({ en: "Analyze another", ar: "تحليل رسالة أخرى" })}</button>
                  <button onClick={copyResult} className="flex-1 py-2 text-xs font-mono border border-[var(--color-line)] hover:bg-[var(--color-manila)] transition-colors cursor-pointer">{copied ? (t({ en: "Copied", ar: "تم النسخ" })) : (t({ en: "Copy result", ar: "نسخ النتيجة" }))}</button>
                  <button onClick={shareResult} className="flex-1 py-2 text-xs font-mono border border-[var(--color-line)] hover:bg-[var(--color-manila)] transition-colors cursor-pointer">{t({ en: "Share", ar: "مشاركة" })}</button>
                </div>

                {/* AI limitation note */}
                <div className="px-5 sm:px-6 py-2.5 bg-[var(--color-manila)]/30 border-t border-[var(--color-line)]">
                  <p className="font-mono text-[10px] text-[var(--color-ink-soft)]/60 leading-relaxed">{t({ en: "AI assessment — always verify through official channels.", ar: "تقييم بالذكاء الاصطناعي — تحقق دائمًا عبر القنوات الرسمية." })}</p>
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Bottom section: How it works + FAQ */}
        {isIdle && (
          <div className="mt-14 sm:mt-18 space-y-12 tl-section">

            {/* How it works */}
            <section>
              <h2 className="font-serif font-semibold text-xl sm:text-2xl tracking-tight mb-6">{t({ en: "How a message gets checked", ar: "كيف يتم فحص الرسالة" })}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 tl-section-gap">
                {[
                  { n: "1", en: "Paste the message", ar: "الصق الرسالة", enD: "Copy the text exactly as you received it — wording and links included.", arD: "انسخ النص تمامًا كما استلمته — بما في ذلك الصياغة والروابط." },
                  { n: "2", en: "TrustLens analyses it", ar: "يحللها TrustLens", enD: "It checks phrasing, links, and requests against known scam patterns.", arD: "يفحص الصياغة والروابط والطلبات مقابل أنماط الاحتيال المعروفة." },
                  { n: "3", en: "Get a plain-language readout", ar: "احصل على تقييم واضح", enD: "A verdict with the specific signals that raised it, so you know why.", arD: "تقييم مع الإشارات المحددة التي أثارت الشك، لتعرف السبب." },
                ].map((step, i) => (
                  <div key={i}>
                    <div className="inline-flex items-center justify-center w-9 h-9 border border-[var(--color-line)] rounded-full font-serif font-semibold text-sm mb-3">{step.n}</div>
                    <h3 className="font-serif font-semibold text-base mb-1">{t({ en: step.en, ar: step.ar })}</h3>
                    <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">{t({ en: step.enD, ar: step.arD })}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* FAQ */}
            <section>
              <h2 className="font-serif font-semibold text-xl sm:text-2xl tracking-tight mb-6">{t({ en: "Questions worth asking", ar: "أسئلة تستحق الطرح" })}</h2>
              <div className="space-y-0 border-t border-[var(--color-line)]">
                {[
                  { qEn: "Does TrustLens store the messages I paste?", qAr: "هل يحتفظ TrustLens بالرسائل التي ألصقها?", aEn: "No. Each message is sent to an external AI service only while the analysis runs. Nothing is stored or logged.", aAr: "لا. تُرسل كل رسالة إلى خدمة ذكاء اصطناعي خارجية فقط أثناء التحليل. لا يُحتفظ بأي شيء ولا يُسجل." },
                  { qEn: "Is a positive or negative verdict a guarantee?", qAr: "هل النتيجة الإيجابية أو السلبية ضمان?", aEn: "No. Scammers change tactics constantly. Treat every verdict as a second opinion, not a final word.", aAr: "لا. يغير المحتالون أساليبهم باستمرار. تعامل مع كل نتيجة كرأي ثانٍ، وليس ككلمة أخيرة." },
                  { qEn: "What should I do if a message is flagged?", qAr: "ماذا أفعل إذا تم الإبلاغ عن رسالة?", aEn: "Don't reply or click anything. Contact the organisation it claims to be from using a number or site you already know is real.", aAr: "لا ترد أو تنقر على أي شيء. اتصل بالجهة التي تدعي الرسالة أنها منها باستخدام رقم أو موقع تعرف أنه حقيقي." },
                  { qEn: "Does this replace reporting a scam?", qAr: "هل هذا يغني عن الإبلاغ عن احتيال?", aEn: "No. If you've lost money or shared details, report it to your bank and the relevant authority.", aAr: "لا. إذا فقدت أموالًا أو شاركت تفاصيل، أبلغ بنكك والسلطة المختصة." },
                ].map((faq, i) => (
                  <details key={i} className="border-b border-[var(--color-line)] py-3 group">
                    <summary className="flex items-center justify-between cursor-pointer list-none text-sm font-medium">
                      <span>{t({ en: faq.qEn, ar: faq.qAr })}</span>
                      <span className="font-mono text-base transition-transform duration-150 group-open:rotate-45 shrink-0 ml-2">+</span>
                    </summary>
                    <p className="mt-2 text-sm text-[var(--color-ink-soft)] leading-relaxed">{t({ en: faq.aEn, ar: faq.aAr })}</p>
                  </details>
                ))}
              </div>
            </section>

          </div>
        )}

        {/* ──── Footer ──── */}
        <footer className="mt-14 sm:mt-18 text-center tl-footer">
          <p className="text-xs text-[var(--color-ink-soft)]/50 leading-relaxed">
            {t({ en: "Pattern-based guidance, not a substitute for your own judgment.", ar: "إرشادات قائمة على الأنماط، وليست بديلاً عن حكمك الخاص." })}
          </p>
        </footer>

      </div>
    </div>
  )
}

export default App