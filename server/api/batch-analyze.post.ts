import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  const tokens = body.tokens || []

  if (tokens.length === 0) return { success: false }

  // UPDATED: Focused on Short Term Metrics (5m / 1h)
  const tokenDataStr = tokens.map((t: any) => 
    `- Address: ${t.address} | Symbol: ${t.symbol} | Liq: $${t.liquidity} | 5m Chg: ${t.priceChange5m}% | 1h Chg: ${t.priceChange1h}% | Socials: ${t.socials.website ? 'Yes' : 'No'}`
  ).join('\n')

  const prompt = `
    Role: You are a Scalp Trading AI.
    Task: Rank these new tokens based on IMMEDIATE MOMENTUM.

    Data:
    ${tokenDataStr}

    Scoring Rules (0-100):
    1. ROCKET FUEL: High positive '5m Chg' (> 5%) is the #1 factor. Score these 80+.
    2. TREND ALIGNMENT: If '1h Chg' matches '5m Chg' (both green), boost score.
    3. DEAD CAT: If '5m Chg' is negative, mark as LOW/AVOID.
    4. SAFETY: Low Liquidity (<$5k) is automatic fail.

    Output STRICT JSON Object where keys are Addresses:
    {
      "ADDRESS": { "score": 90, "tag": "MOONING", "reason": "Ripping +15% in last 5m with trend support." }
    }
  `

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })

    const data = await response.json()
    const rawText = data.candidates[0].content.parts[0].text
    const jsonString = rawText.replace(/```json/g, '').replace(/```/g, '').trim()
    
    return { success: true, results: JSON.parse(jsonString) }

  } catch (error) {
    return { success: false }
  }
})