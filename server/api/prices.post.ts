import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const addresses = body.addresses || []

  if (addresses.length === 0) return { success: true, prices: {} }

  try {
    // DexScreener allows up to 30 addresses per call
    // Format: https://api.dexscreener.com/latest/dex/tokens/addr1,addr2,addr3
    const addressString = addresses.slice(0, 30).join(',')
    
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addressString}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    
    const json = await response.json()
    const pairs = json.pairs || []

    // Create a map of Address -> Price
    const priceMap: Record<string, number> = {}
    
    pairs.forEach((pair: any) => {
      if (pair.baseToken?.address) {
        // DexScreener might return multiple pairs for one token. 
        // We take the first one (usually highest liquidity) or overwrite if we find a better one.
        if (!priceMap[pair.baseToken.address]) {
            priceMap[pair.baseToken.address] = parseFloat(pair.priceUsd)
        }
      }
    })

    return { success: true, prices: priceMap }

  } catch (error) {
    console.error(error)
    return { success: false, prices: {} }
  }
})