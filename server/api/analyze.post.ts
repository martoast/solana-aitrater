import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  const token = body.token
  
  // Get the DexScreener data we just fetched
  const dexData = body.enriched?.data || {}
  
  // Calculate Buy/Sell Pressure from Txns if available
  const buyCount = dexData.buys || 0
  const sellCount = dexData.sells || 0
  const txnRatio = sellCount > 0 ? (buyCount / sellCount).toFixed(2) : "Infinity"

  // Construct the AI Prompt
  const prompt = `
    Role: You are a ruthless Solana Bot Hunter.
    Task: Evaluate this token for a "Snipe" based on Momentum.
    
    Token Data:
    - Symbol: ${token.symbol}
    - Price: $${dexData.priceUsd || token.price}
    - Liquidity: $${dexData.liquidity || token.liquidity} (Must be > $10k)
    - FDV: $${dexData.fdv}
    
    Momentum (Speed):
    - 5-Min Volume: $${dexData.volume?.m5 || 0}
    - 1-Hour Volume: $${dexData.volume?.h1 || 0}
    - 5-Min Price Change: ${dexData.priceChange?.m5 || 0}%
    - 1-Hour Price Change: ${dexData.priceChange?.h1 || 0}%
    
    Pressure (1 Hour Txns):
    - Buys: ${buyCount}
    - Sells: ${sellCount}
    - Buy/Sell Ratio: ${txnRatio}x

    Strategy Rules:
    1. Low Liquidity (< $10k) = AVOID.
    2. Negative 5m Price Change = WAIT (Don't catch a falling knife).
    3. Buy/Sell Ratio > 1.5 = BUY Signal.
    4. High 5m Volume = Strong Interest.

    Output STRICT JSON ONLY:
    {
      "decision": "BUY" or "WAIT" or "AVOID",
      "confidence": number (0-100),
      "reasoning": "Explain based on Momentum and Pressure."
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
    return { decision: "WAIT", confidence: 0, reasoning: "AI Error" }
  }
})