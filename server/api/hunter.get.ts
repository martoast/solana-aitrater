import { defineEventHandler, getQuery } from 'h3'

// Rotation state
let rotationIndex = 0
let lastBirdeyeCall = 0
const BIRDEYE_COOLDOWN_MS = 7000

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)
  const requestedType = query.type as string || 'auto'
  
  try {
    let result: { items: any[], sourceName: string }
    
    if (requestedType === 'auto' || requestedType === 'fresh') {
      result = await getNextRotationSource(config.birdEyeApiKey)
    } else if (requestedType === 'trending') {
      result = await fetchBirdeyeTrending(config.birdEyeApiKey)
    } else if (requestedType === 'boosts') {
      result = await fetchDexScreenerBoosts()
    } else if (requestedType === 'profiles') {
      result = await fetchDexScreenerProfiles()
    } else if (requestedType === 'newborn') {
      result = await fetchNewbornTokens()
    } else if (requestedType === 'active') {
      result = await fetchHighVolumeTokens()
    } else {
      result = await fetchDexScreenerProfiles()
    }

    if (result.items.length === 0) {
      result = await fetchHighVolumeTokens()
    }

    console.log(`[Hunter] ✅ Returning ${result.items.length} items from: ${result.sourceName}`)
    
    return {
      success: true,
      source: result.sourceName,
      data: { items: result.items }
    }
  } catch (error) {
    console.error('[Hunter] Error:', error)
    return { success: false, error: 'Failed to fetch', data: { items: [] } }
  }
})

// === SMART ROTATION - Alternates between NEWBORN and HIGH VOLUME ===
async function getNextRotationSource(birdeyeKey: string): Promise<{ items: any[], sourceName: string }> {
  const sources = [
    'newborn',       // Super fresh tokens (< 2 hours)
    'highVolume',    // Established active tokens
    'profiles',      // New listings
    'highVolume',    // More weight on active tokens
    'newborn',       // Fresh tokens again
    'latestBoosts',  // Recently boosted
    'highVolume',    // Active tokens
    'birdeye',       // Trending
  ]
  
  const sourceKey = sources[rotationIndex % sources.length]
  rotationIndex++
  
  console.log(`[Hunter] Rotation ${rotationIndex}: ${sourceKey}`)
  
  switch (sourceKey) {
    case 'newborn':
      return fetchNewbornTokens()
    
    case 'highVolume':
      return fetchHighVolumeTokens()
    
    case 'profiles':
      return fetchDexScreenerProfiles()
    
    case 'latestBoosts':
      return fetchDexScreenerBoosts()
    
    case 'birdeye':
      const now = Date.now()
      if (now - lastBirdeyeCall < BIRDEYE_COOLDOWN_MS) {
        return fetchHighVolumeTokens()
      }
      lastBirdeyeCall = now
      return fetchBirdeyeTrending(birdeyeKey)
    
    default:
      return fetchHighVolumeTokens()
  }
}

// === CATEGORY 1: NEWBORN TOKENS (< 2 hours old) ===
async function fetchNewbornTokens(): Promise<{ items: any[], sourceName: string }> {
  try {
    // Get the freshest profiles - these are usually just created
    const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    const profiles = await response.json()
    
    if (!Array.isArray(profiles)) {
      return { items: [], sourceName: 'Newborn (no data)' }
    }
    
    const solanaTokens = profiles
      .filter((t: any) => t.chainId === 'solana')
      .slice(0, 30)
    
    // Now get pair data to check age and activity
    const addresses = solanaTokens.map((t: any) => t.tokenAddress).filter(Boolean)
    if (addresses.length === 0) return { items: [], sourceName: 'Newborn (no addresses)' }
    
    const pairData = await fetchPairDataForAddresses(addresses)
    
    const items: any[] = []
    const now = Date.now()
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000
    
    for (const profile of solanaTokens) {
      const addr = profile.tokenAddress
      const pair = pairData[addr]
      if (!pair) continue
      
      const ageMs = pair.pairCreatedAt ? now - pair.pairCreatedAt : Infinity
      const ageHours = ageMs / (1000 * 60 * 60)
      
      // NEWBORN CRITERIA:
      // - Less than 2 hours old
      // - Has SOME liquidity ($1k minimum)
      // - Has at least a few transactions (not completely dead)
      const txns5m = (pair.txns?.m5?.buys || 0) + (pair.txns?.m5?.sells || 0)
      const txns1h = (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0)
      const liq = pair.liquidity?.usd || 0
      
      if (ageMs < TWO_HOURS_MS && liq >= 1000 && (txns5m >= 1 || txns1h >= 3)) {
        items.push({
          address: addr,
          symbol: pair.baseToken?.symbol ? `$${pair.baseToken.symbol}` : extractSymbol(profile),
          name: pair.baseToken?.name || profile.header || 'Unknown',
          logoURI: profile.icon || pair.info?.imageUrl || null,
          isNew: true,
          isNewborn: true, // Flag for special handling
          source: 'newborn',
          ageMinutes: Math.round(ageMs / 60000),
          ageHours: Math.round(ageHours * 10) / 10,
          liquidity: liq,
          price: parseFloat(pair.priceUsd) || 0,
          priceChange5m: pair.priceChange?.m5 || 0,
          priceChange1h: pair.priceChange?.h1 || 0,
          volume5m: pair.volume?.m5 || 0,
          volume1h: pair.volume?.h1 || 0,
          txns: {
            m5: pair.txns?.m5 || { buys: 0, sells: 0 },
            h1: pair.txns?.h1 || { buys: 0, sells: 0 },
          },
          fdv: pair.fdv || 0,
          pairAddress: pair.pairAddress,
        })
      }
    }
    
    // Sort by newest first
    items.sort((a, b) => a.ageMinutes - b.ageMinutes)
    
    return { items: items.slice(0, 20), sourceName: `Newborn <2h (${items.length})` }
  } catch (e) {
    console.error('[Hunter] Newborn error:', e)
    return { items: [], sourceName: 'Newborn (error)' }
  }
}

// === CATEGORY 2: HIGH VOLUME ESTABLISHED TOKENS ===
async function fetchHighVolumeTokens(): Promise<{ items: any[], sourceName: string }> {
  try {
    // Search for active Solana tokens
    const searchTerms = ['sol', 'pump', 'pepe', 'meme', 'doge', 'cat', 'ai', 'moon', 'inu']
    const term = searchTerms[Math.floor(Math.random() * searchTerms.length)]
    
    const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${term}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    const data = await response.json()
    
    if (!data.pairs || !Array.isArray(data.pairs)) {
      return { items: [], sourceName: `HighVolume (no results)` }
    }
    
    const now = Date.now()
    
    // Filter for HIGH ACTIVITY established tokens
    const activePairs = data.pairs
      .filter((p: any) => {
        if (p.chainId !== 'solana') return false
        
        const liq = p.liquidity?.usd || 0
        const vol1h = p.volume?.h1 || 0
        const txns1h = (p.txns?.h1?.buys || 0) + (p.txns?.h1?.sells || 0)
        const ageMs = p.pairCreatedAt ? now - p.pairCreatedAt : Infinity
        const ageHours = ageMs / (1000 * 60 * 60)
        
        // HIGH VOLUME CRITERIA:
        // - At least $20k liquidity (established)
        // - High activity: 50+ txns in last hour OR $5k+ volume in last hour
        // - Not ancient (< 7 days old to avoid truly dead coins that randomly spike)
        const hasGoodLiquidity = liq >= 20000
        const hasHighActivity = txns1h >= 50 || vol1h >= 5000
        const notTooOld = ageHours < 168 // 7 days
        
        return hasGoodLiquidity && hasHighActivity && notTooOld
      })
      .sort((a: any, b: any) => {
        // Sort by activity (transactions per hour)
        const aTxns = (a.txns?.h1?.buys || 0) + (a.txns?.h1?.sells || 0)
        const bTxns = (b.txns?.h1?.buys || 0) + (b.txns?.h1?.sells || 0)
        return bTxns - aTxns
      })
      .slice(0, 20)
    
    const items = activePairs.map((p: any) => {
      const ageMs = p.pairCreatedAt ? now - p.pairCreatedAt : 0
      return {
        address: p.baseToken?.address,
        symbol: p.baseToken?.symbol ? `$${p.baseToken.symbol}` : '$UNK',
        name: p.baseToken?.name || 'Unknown',
        logoURI: p.info?.imageUrl || null,
        isNew: false,
        isNewborn: false,
        isHighVolume: true, // Flag for identification
        source: 'highVolume',
        ageHours: Math.round(ageMs / (1000 * 60 * 60)),
        liquidity: p.liquidity?.usd || 0,
        price: parseFloat(p.priceUsd) || 0,
        priceChange5m: p.priceChange?.m5 || 0,
        priceChange1h: p.priceChange?.h1 || 0,
        volume5m: p.volume?.m5 || 0,
        volume1h: p.volume?.h1 || 0,
        txns: {
          m5: p.txns?.m5 || { buys: 0, sells: 0 },
          h1: p.txns?.h1 || { buys: 0, sells: 0 },
        },
        fdv: p.fdv || 0,
        pairAddress: p.pairAddress,
      }
    })
    
    return { items, sourceName: `HighVolume Active (${items.length})` }
  } catch (e) {
    console.error('[Hunter] HighVolume error:', e)
    return { items: [], sourceName: 'HighVolume (error)' }
  }
}

// === HELPER: Fetch pair data for multiple addresses ===
async function fetchPairDataForAddresses(addresses: string[]): Promise<Record<string, any>> {
  const results: Record<string, any> = {}
  const chunkSize = 30
  
  for (let i = 0; i < addresses.length; i += chunkSize) {
    const chunk = addresses.slice(i, i + chunkSize)
    try {
      const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`, {
        headers: { 'Accept': 'application/json' }
      })
      const pairs = await response.json()
      
      if (Array.isArray(pairs)) {
        for (const pair of pairs) {
          const addr = pair.baseToken?.address
          if (!addr) continue
          // Keep the pair with highest liquidity for each token
          const liq = pair.liquidity?.usd || 0
          if (!results[addr] || liq > (results[addr].liquidity?.usd || 0)) {
            results[addr] = pair
          }
        }
      }
    } catch (e) {
      console.error('[Hunter] Pair fetch error:', e)
    }
  }
  
  return results
}

// === HELPER: Extract symbol from profile ===
function extractSymbol(profile: any): string {
  let symbol = 'UNK'
  
  if (profile.header && typeof profile.header === 'string' && !profile.header.startsWith('http')) {
    symbol = profile.header.split(/[\s\-–]/)[0].replace(/[^a-zA-Z0-9$]/g, '').toUpperCase()
  }
  
  if ((!symbol || symbol === 'UNK' || symbol === '') && profile.description) {
    const match = profile.description.match(/\$([A-Z0-9]+)/i)
    if (match) symbol = match[1].toUpperCase()
  }
  
  if (!symbol || symbol === 'UNK' || symbol === '') {
    symbol = profile.tokenAddress?.slice(0, 6)?.toUpperCase() || 'UNK'
  }
  
  return symbol.startsWith('$') ? symbol : '$' + symbol
}

// === EXISTING SOURCES (kept for rotation) ===

async function fetchDexScreenerProfiles(): Promise<{ items: any[], sourceName: string }> {
  try {
    const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', { 
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    const profiles = await response.json()
    
    if (!Array.isArray(profiles)) {
      return { items: [], sourceName: 'Profiles (no data)' }
    }
    
    const solanaTokens = profiles.filter((t: any) => t.chainId === 'solana')
    const items = solanaTokens.slice(0, 25).map((t: any) => ({
      address: t.tokenAddress,
      symbol: extractSymbol(t),
      name: t.header || 'Unknown',
      logoURI: t.icon || null,
      isNew: true,
      source: 'dexscreener_profile',
      liquidity: 0,
      price: 0,
    }))
    
    return { items, sourceName: `Profiles (${items.length})` }
  } catch (e) {
    console.error('[Hunter] Profiles error:', e)
    return { items: [], sourceName: 'Profiles (error)' }
  }
}

async function fetchDexScreenerBoosts(): Promise<{ items: any[], sourceName: string }> {
  try {
    const response = await fetch('https://api.dexscreener.com/token-boosts/latest/v1', { 
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    const boosts = await response.json()
    
    if (!Array.isArray(boosts)) {
      return { items: [], sourceName: 'Boosts (no data)' }
    }
    
    const solanaTokens = boosts.filter((t: any) => t.chainId === 'solana')
    const items = solanaTokens.slice(0, 25).map((t: any) => ({
      address: t.tokenAddress,
      symbol: extractSymbol(t),
      name: t.header || 'Unknown',
      logoURI: t.icon || null,
      isNew: true,
      source: 'dexscreener_boost',
      boostAmount: t.amount || t.totalAmount || 0,
      liquidity: 0,
      price: 0,
    }))
    
    return { items, sourceName: `Boosts (${items.length})` }
  } catch (e) {
    console.error('[Hunter] Boosts error:', e)
    return { items: [], sourceName: 'Boosts (error)' }
  }
}

async function fetchBirdeyeTrending(apiKey: string): Promise<{ items: any[], sourceName: string }> {
  if (!apiKey) {
    return { items: [], sourceName: 'Birdeye (no API key)' }
  }
  
  try {
    const response = await fetch('https://public-api.birdeye.so/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=20', {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        'accept': 'application/json',
        'x-chain': 'solana'
      }
    })
    const json = await response.json()
    
    if (!json.success || !json.data?.tokens) {
      return { items: [], sourceName: 'Birdeye (no data)' }
    }
    
    const items = json.data.tokens.map((t: any) => ({
      address: t.address,
      symbol: t.symbol ? `$${t.symbol}` : '$UNK',
      name: t.name,
      logoURI: t.logoURI,
      rank: t.rank,
      isNew: false,
      source: 'birdeye_trending',
      liquidity: t.liquidity || 0,
      price: t.price || 0,
    }))
    
    return { items, sourceName: `Birdeye Trending (${items.length})` }
  } catch (e) {
    console.error('[Hunter] Birdeye error:', e)
    return { items: [], sourceName: 'Birdeye (error)' }
  }
}