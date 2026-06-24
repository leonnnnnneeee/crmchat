// ── AI SUGGEST (Groq) ──
app.post('/api/ai/suggest', requireAuth, async (req,res) => {
  const { contactName, lastMessage, messages, stage, notes } = req.body
  const history = (messages||[]).slice(-20)
  const lastClientMsg = (lastMessage||'').trim()
  const leonLines = history.filter(m=>m.fromMe).map(m=>m.text).filter(Boolean)
  const leonSaid  = leonLines.join(' | ')
  const thread    = history.map(m=>(m.fromMe?'Leon':'Client')+': '+m.text).join('\n')

  log('AI suggest — last: "' + lastClientMsg + '" stage: ' + stage)

  // Rule-based fallback (when no Groq key or Groq fails)
  function ruleBased() {
    return [
      { label: "Soft", text: "Got it. When would be a better time to reconnect?" },
      { label: "Value", text: "CMC News puts your content directly on CoinMarketCap for instant credibility. Want me to send the rate card?" },
      { label: "Question", text: "What's the main goal right now — awareness, credibility, or user growth?" }
    ];
  }

  if (!GROQ_KEY) return res.json({ suggestions: ruleBased() })

  const SYSTEM_PROMPT = `You are Coincu's professional BD Sales Assistant.

Read all information below carefully before answering. Use ONLY this knowledge base.

---
COMPANY
---
Coincu is a crypto-focused media outlet (coincu.com) that has collaborated with top-tier news platforms. We provide content publication, PR, and CoinMarketCap News visibility services.
We have executed 130+ successful marketing campaigns for global crypto projects.

---
SERVICES & RATE CARD
---
COINCU.COM
- Press release: $240 single
- Sponsored article: $390 single
- Organic coverage: $520 single

CMC TOP NEWS BOOST
- Service: Your article appears in the News section of a relevant CoinMarketCap token page.
- Great for credibility and visibility before a TGE or raise.

---
CONVERSATION RULES
---
- Short, clear, Telegram-style messages (1-3 sentences max).
- Ask only ONE question at a time.
- Reply in the SAME language as the client (Vietnamese or English).
- Never repeat what you already said.
- End with one clear next step.
- Speak as a member of the Coincu team.

---
TASK: MULTIPLE SUGGESTIONS
---
Based on the conversation context, generate exactly 3 to 5 distinct reply options.
Each option MUST have a specific angle.
Angles to choose from:
1. "Soft": Gentle follow-up, low pressure.
2. "Value": Focuses on what Coincu/CMC visibility brings to them.
3. "Question": Moves the conversation forward by asking about their current campaigns, events, or needs.
4. "Direct": Straight to the point (pricing, rate card, proposal).
5. "Referral": If they are an agency, suggest a partnership.

OUTPUT FORMAT:
Return EXACTLY this JSON structure. Do not return markdown blocks like \`\`\`json.
{
  "suggestions": [
    { "label": "Soft", "text": "The actual message text" },
    { "label": "Value", "text": "Another text" }
  ]
}
`

  try {
    const userPrompt = [
      '=== CONVERSATION ===',
      history.slice(-15).map(m=>(m.fromMe?'Leon':'Client')+': '+m.text).join('\n') || '(no messages yet)',
      '',
      '=== CONTEXT ===',
      'Client: ' + contactName,
      'CRM Stage: ' + (stage||'Contacted'),
      notes ? 'Notes: ' + notes : null,
      '',
      '=== TASK ===',
      'Client just said: "' + lastClientMsg + '"',
      'Leon already said (do not repeat): ' + (leonSaid || '(nothing)'),
      'Generate 3 to 5 diverse, short, Telegram-style reply options in JSON format.'
    ].filter(Boolean).join('\n')

    const axios = require('axios')
    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    }, { headers: { 'Authorization': 'Bearer ' + GROQ_KEY }})

    const text = r.data.choices[0].message.content
    try {
      const parsed = JSON.parse(text)
      res.json({ ok: true, suggestions: parsed.suggestions || ruleBased() })
    } catch(err) {
      log('Groq JSON parse error: ' + err.message + ' | Raw: ' + text)
      res.json({ ok: true, suggestions: ruleBased() })
    }
  } catch(e) {
    log('groq suggest error: ' + (e.response?.data?.error?.message || e.message))
    res.json({ ok: true, suggestions: ruleBased() })
  }
})
