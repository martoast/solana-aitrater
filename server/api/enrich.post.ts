import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const address = body.address

  if (!address) return { success: false, error: 'No address' }

  try {
    // 1. DexScreener (Free, Fast, Rich Data)
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    
    const json = await response.json()
    const pairs = json.pairs || []

    if (pairs.length === 0) {
      return { success: false, error: 'No pairs found on DexScreener' }
    }

    // Get the best pair (highest liquidity)
    // DexScreener returns pairs sorted by liquidity automatically usually, but let's pick the first one
    const pair = pairs[0]

    // Return formatted data for Gemini
    return {
      success: true,
      data: {
        priceUsd: pair.priceUsd,
        liquidity: pair.liquidity?.usd,
        fdv: pair.fdv,
        volume: pair.volume, // Contains h24, h6, h1, m5
        priceChange: pair.priceChange, // Contains h24, h6, h1, m5
        buys: pair.txns?.h1?.buys, // Buy Count (1h)
        sells: pair.txns?.h1?.sells // Sell Count (1h)
      }
    }

  } catch (error) {
    console.error("[Enrich Error]", error)
    return { success: false, error: 'Enrichment Failed' }
  }
})