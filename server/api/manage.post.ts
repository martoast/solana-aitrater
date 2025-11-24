import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  
  const { symbol, entryPrice, currentPrice, durationMins } = body

  // Calculate simple PnL %
  const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100

  const prompt = `
    Role: You are a strict Risk Manager for a Crypto Trading Bot.
    Task: Decide what to do with this OPEN position.

    Position Data:
    - Token: ${symbol}
    - Entry Price: $${entryPrice}
    - Current Price: $${currentPrice}
    - PnL: ${pnlPercent.toFixed(2)}%
    - Duration Open: ${durationMins} minutes

    Rules:
    1. Take Profit Rule: If PnL > 20%, suggest SELL (Secure profits).
    2. Stop Loss Rule: If PnL < -10%, suggest SELL (Cut losses).
    3. Stagnant Rule: If PnL is roughly 0% after 60 mins, suggest SELL (Dead money).
    4. Momentum Rule: If PnL is positive but < 20%, suggest HOLD (Let winners run).

    Output STRICT JSON ONLY:
    {
      "decision": "HOLD" or "SELL",
      "confidence": number (0-100),
      "reasoning": "Brief explanation of the decision."
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
    return JSON.parse(jsonString)

  } catch (error) {
    return { decision: "HOLD", confidence: 0, reasoning: "AI Error, defaulting to Hold." }
  }
})