import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const address = body.address

  if (!address) return { success: false, error: 'No address' }

  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    
    const json = await response.json()
    const pairs = json.pairs || []
    
    if (pairs.length === 0) {
      return { success: true, hasSocials: false, status: 'no_pair', overview: null }
    }

    const mainPair = pairs[0]
    const info = mainPair.info || {}
    
    const websites = info.websites || []
    const socials = info.socials || []
    
    const hasWebsite = websites.length > 0
    const hasTwitter = socials.some((s: any) => s.type === 'twitter')
    const hasTelegram = socials.some((s: any) => s.type === 'telegram')

    return {
      success: true,
      hasSocials: hasWebsite || hasTwitter || hasTelegram, 
      
      socials: {
        website: websites.length > 0 ? websites[0].url : null,
        twitter: socials.find((s: any) => s.type === 'twitter')?.url,
        telegram: socials.find((s: any) => s.type === 'telegram')?.url
      },
      logoURI: mainPair.baseToken?.logoURI || null,
      
      // UPDATED: Include Txns for AI Analysis
      overview: {
        price: mainPair.priceUsd,
        liquidity: mainPair.liquidity?.usd,
        fdv: mainPair.fdv,
        volume: mainPair.volume, // { h24, h6, h1, m5 }
        priceChange: mainPair.priceChange, // { h24, h6, h1, m5 }
        buys: mainPair.txns?.h1?.buys || 0,
        sells: mainPair.txns?.h1?.sells || 0
      }
    }

  } catch (error) {
    console.error("[DexScreener Error]", error)
    return { success: false, hasSocials: false, error: 'API Error' }
  }
})