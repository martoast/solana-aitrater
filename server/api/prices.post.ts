import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const addresses = body.addresses || []

  if (addresses.length === 0) return { success: true, data: {} }

  try {
    const chunk = addresses.slice(0, 30).join(',')
    
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    
    const json = await response.json()
    const pairs = json.pairs || []

    const marketMap: Record<string, any> = {}
    
    pairs.forEach((pair: any) => {
      if (pair.baseToken?.address) {
        const addr = pair.baseToken.address
        const currentLiq = pair.liquidity?.usd || 0
        
        if (!marketMap[addr] || currentLiq > marketMap[addr].liquidity) {
            marketMap[addr] = {
                price: parseFloat(pair.priceUsd),
                liquidity: currentLiq,
                volume24h: pair.volume?.h24 || 0,
                // CAPTURE SPECIFIC TIMEFRAMES
                change5m: pair.priceChange?.m5 || 0,
                change1h: pair.priceChange?.h1 || 0,
                change6h: pair.priceChange?.h6 || 0
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