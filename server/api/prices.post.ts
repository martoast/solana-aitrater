import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const addresses = body.addresses || []

  if (addresses.length === 0) return { success: true, data: {} }

  try {
    // DexScreener supports up to 30 addresses per call.
    // We will handle the first 30 here. 
    // If you have >30 verified, the frontend should chunk requests.
    const chunk = addresses.slice(0, 30).join(',')
    
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    
    const json = await response.json()
    const pairs = json.pairs || []

    // Create a map of Address -> Full Market Data
    const marketMap: Record<string, any> = {}
    
    pairs.forEach((pair: any) => {
      if (pair.baseToken?.address) {
        // DexScreener might return multiple pairs. We want the most liquid one.
        const addr = pair.baseToken.address
        const currentLiq = pair.liquidity?.usd || 0
        
        // Only overwrite if this pair has higher liquidity than one we already processed
        if (!marketMap[addr] || currentLiq > marketMap[addr].liquidity) {
            marketMap[addr] = {
                price: parseFloat(pair.priceUsd),
                liquidity: currentLiq,
                v24hUSD: pair.volume?.h24 || 0,
                v24hChangePercent: pair.priceChange?.h24 || 0,
                // We can even grab 5m change for the Sniper AI
                priceChange5m: pair.priceChange?.m5 || 0
            }
        }
      }
    })

    return { success: true, data: marketMap }

  } catch (error) {
    console.error(error)
    return { success: false, data: {} }
  }
})