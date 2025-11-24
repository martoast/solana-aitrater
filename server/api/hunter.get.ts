import { defineEventHandler, getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)
  const type = query.type || 'trending'
  
  try {
    let items = []

    if (type === 'fresh') {
      // --- SOURCE 1: DEXSCREENER PROFILES ---
      const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', { method: 'GET' })
      const profiles = await response.json()
      
      const solanaTokens = profiles.filter((t: any) => t.chainId === 'solana')

      items = solanaTokens.map((t: any) => {
        let cleanSymbol = 'UNK'
        if (t.header && !t.header.startsWith('http')) {
            cleanSymbol = t.header.split(' ')[0]
        } else {
            cleanSymbol = t.tokenAddress.slice(0, 4)
        }

        // Try to extract links
        const links = t.links || []
        const website = links.find((l: any) => l.type === 'website' || l.label === 'Website')?.url
        const twitter = links.find((l: any) => l.type === 'twitter' || l.label === 'Twitter')?.url
        const telegram = links.find((l: any) => l.type === 'telegram' || l.label === 'Telegram')?.url

        return {
          address: t.tokenAddress,
          symbol: '$' + cleanSymbol,
          name: cleanSymbol,
          logoURI: t.icon,
          isNew: true,
          liquidityAddedAt: new Date().toISOString(),
          prefilledSocials: { website, twitter, telegram },
          
          // Placeholders (Sieve will fill)
          liquidity: 0, 
          v24hUSD: 0,
          v24hChangePercent: 0
        }
      })

    } else {
      // --- SOURCE 2: BIRDEYE TRENDING ---
      const response = await fetch('https://public-api.birdeye.so/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=20', {
        method: 'GET',
        headers: {
          'X-API-KEY': config.birdEyeApiKey,
          'accept': 'application/json',
          'x-chain': 'solana'
        }
      })
      const json = await response.json()
      
      // NORMALIZE BIRDEYE DATA
      items = (json.data?.tokens || []).map((t: any) => ({
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        logoURI: t.logoURI,
        rank: t.rank,
        isNew: false,
        liquidity: t.liquidity,
        // Map specific BirdEye fields to our standard names
        v24hUSD: t.volume24hUSD, 
        v24hChangePercent: t.price24hChangePercent,
        price: t.price
      }))
    }
    
    return {
      success: true,
      data: { items }
    }
  } catch (error) {
    console.error(error)
    return { error: 'Failed to fetch hunter list' }
  }
})