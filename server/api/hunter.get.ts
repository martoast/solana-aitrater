import { defineEventHandler, getQuery } from 'h3'

// Rotation state (module-level singleton)
let rotationIndex = 0
let lastBirdeyeCall = 0
const BIRDEYE_COOLDOWN_MS = 7000 // 7 seconds between Birdeye calls

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)
  const requestedType = query.type as string || 'auto'
  
  try {
    let result: { items: any[], sourceName: string }
    
    // Logic router based on request type
    if (requestedType === 'auto' || requestedType === 'fresh') {
      result = await getNextRotationSource(config.birdEyeApiKey)
    } else if (requestedType === 'trending') {
      result = await fetchBirdeyeTrending(config.birdEyeApiKey)
    } else if (requestedType === 'boosts') {
      result = await fetchDexScreenerBoosts()
    } else if (requestedType === 'profiles') {
      result = await fetchDexScreenerProfiles()
    } else if (requestedType === 'search') {
      // We keep this for MANUAL searches triggered by the UI, 
      // but the auto-bot won't use it anymore.
      const term = query.q as string || 'solana'
      result = await fetchDexScreenerSearch(term)
    } else {
      result = await fetchDexScreenerProfiles()
    }

    // Fallback if we got nothing
    if (result.items.length === 0) {
      console.log(`[Hunter] ${result.sourceName} returned 0, trying profiles fallback...`)
      result = await fetchDexScreenerProfiles()
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

// --- SMART ROTATION ---
async function getNextRotationSource(birdeyeKey: string): Promise<{ items: any[], sourceName: string }> {
  // Simplified rotation: Focus on New Profiles, Boosts, and Trending API
  const sources = [
    'profiles',      // 1. Newest Tokens
    'latestBoosts',  // 2. Just Boosted
    'profiles',      // 3. Newest Tokens (High Priority)
    'topBoosts',     // 4. Most Boosted
    'birdeye',       // 5. Trending on Birdeye
    'profiles'       // 6. Newest Tokens
  ]
  
  const sourceKey = sources[rotationIndex % sources.length]
  rotationIndex++
  
  console.log(`[Hunter] Rotation ${rotationIndex}: ${sourceKey}`)
  
  switch (sourceKey) {
    case 'profiles':
      return fetchDexScreenerProfiles()
    
    case 'latestBoosts':
      return fetchDexScreenerBoosts()
    
    case 'topBoosts':
      return fetchDexScreenerTopBoosts()
    
    case 'birdeye':
      // Rate limit check for Birdeye
      const now = Date.now()
      if (now - lastBirdeyeCall < BIRDEYE_COOLDOWN_MS) {
        console.log('[Hunter] Birdeye on cooldown, using profiles instead')
        return fetchDexScreenerProfiles()
      }
      lastBirdeyeCall = now
      return fetchBirdeyeTrending(birdeyeKey)
    
    default:
      return fetchDexScreenerProfiles()
  }
}

// --- SOURCE 1: DEXSCREENER LATEST PROFILES ---
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
    const items = solanaTokens.slice(0, 25).map((t: any) => normalizeDexScreenerToken(t, 'profile'))
    
    return { items, sourceName: `DexScreener Profiles (${items.length})` }
  } catch (e) {
    console.error('[Hunter] Profiles error:', e)
    return { items: [], sourceName: 'Profiles (error)' }
  }
}

// --- SOURCE 2: DEXSCREENER LATEST BOOSTS ---
async function fetchDexScreenerBoosts(): Promise<{ items: any[], sourceName: string }> {
  try {
    const response = await fetch('https://api.dexscreener.com/token-boosts/latest/v1', { 
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    const boosts = await response.json()
    
    if (!Array.isArray(boosts)) {
      return { items: [], sourceName: 'Latest Boosts (no data)' }
    }
    
    const solanaTokens = boosts.filter((t: any) => t.chainId === 'solana')
    const items = solanaTokens.slice(0, 25).map((t: any) => normalizeDexScreenerToken(t, 'boost'))
    
    return { items, sourceName: `DexScreener Latest Boosts (${items.length})` }
  } catch (e) {
    console.error('[Hunter] Latest Boosts error:', e)
    return { items: [], sourceName: 'Latest Boosts (error)' }
  }
}

// --- SOURCE 3: DEXSCREENER TOP BOOSTS ---
async function fetchDexScreenerTopBoosts(): Promise<{ items: any[], sourceName: string }> {
  try {
    const response = await fetch('https://api.dexscreener.com/token-boosts/top/v1', { 
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    const boosts = await response.json()
    
    if (!Array.isArray(boosts)) {
      return { items: [], sourceName: 'Top Boosts (no data)' }
    }
    
    const solanaTokens = boosts.filter((t: any) => t.chainId === 'solana')
    const items = solanaTokens.slice(0, 25).map((t: any) => normalizeDexScreenerToken(t, 'topBoost'))
    
    return { items, sourceName: `DexScreener Top Boosts (${items.length})` }
  } catch (e) {
    console.error('[Hunter] Top Boosts error:', e)
    return { items: [], sourceName: 'Top Boosts (error)' }
  }
}

// --- SOURCE 4: DEXSCREENER SEARCH (Manual Use Only) ---
async function fetchDexScreenerSearch(searchTerm: string): Promise<{ items: any[], sourceName: string }> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(searchTerm)}`, { 
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    const data = await response.json()
    
    if (!data.pairs || !Array.isArray(data.pairs)) {
      return { items: [], sourceName: `Search "${searchTerm}" (no results)` }
    }
    
    const solanaPairs = data.pairs
      .filter((p: any) => p.chainId === 'solana')
      .slice(0, 25)
    
    const items = solanaPairs.map((p: any) => normalizeSearchPair(p, searchTerm))
    
    return { items, sourceName: `DexScreener Search "${searchTerm}" (${items.length})` }
  } catch (e) {
    console.error(`[Hunter] Search "${searchTerm}" error:`, e)
    return { items: [], sourceName: `Search "${searchTerm}" (error)` }
  }
}

// --- SOURCE 5: BIRDEYE TRENDING (Rate Limited) ---
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
      return { items: [], sourceName: 'Birdeye Trending (no data)' }
    }
    
    const items = json.data.tokens.map((t: any) => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      logoURI: t.logoURI,
      rank: t.rank,
      isNew: false,
      source: 'birdeye_trending',
      prefilledSocials: {},
      liquidity: t.liquidity || 0,
      v24hUSD: t.volume24hUSD || 0,
      v24hChangePercent: t.price24hChangePercent || 0,
      price: t.price || 0
    }))
    
    return { items, sourceName: `Birdeye Trending (${items.length})` }
  } catch (e) {
    console.error('[Hunter] Birdeye error:', e)
    return { items: [], sourceName: 'Birdeye (error)' }
  }
}

// --- NORMALIZER: DexScreener Token Profile/Boost ---
function normalizeDexScreenerToken(t: any, sourceType: string): any {
  let symbol = 'UNK'
  
  if (t.header && typeof t.header === 'string' && !t.header.startsWith('http')) {
    symbol = t.header.split(/[\s\-–]/)[0].replace(/[^a-zA-Z0-9$]/g, '').toUpperCase()
  }
  
  if ((!symbol || symbol === 'UNK' || symbol === '') && t.description) {
    const match = t.description.match(/\$([A-Z0-9]+)/i)
    if (match) symbol = match[1].toUpperCase()
  }
  
  if (!symbol || symbol === 'UNK' || symbol === '') {
    symbol = t.tokenAddress?.slice(0, 6)?.toUpperCase() || 'UNK'
  }

  const links = t.links || []
  const website = links.find((l: any) => 
    l.type === 'website' || l.label?.toLowerCase() === 'website' || 
    (l.url && !l.url.includes('twitter') && !l.url.includes('x.com') && !l.url.includes('t.me') && l.url.startsWith('http'))
  )?.url
  
  const twitter = links.find((l: any) => 
    l.type === 'twitter' || l.label?.toLowerCase() === 'twitter' || 
    l.url?.includes('twitter.com') || l.url?.includes('x.com')
  )?.url
  
  const telegram = links.find((l: any) => 
    l.type === 'telegram' || l.label?.toLowerCase() === 'telegram' || 
    l.url?.includes('t.me')
  )?.url

  return {
    address: t.tokenAddress,
    symbol: symbol.startsWith('$') ? symbol : '$' + symbol,
    name: symbol,
    logoURI: t.icon || null,
    isNew: true,
    source: `dexscreener_${sourceType}`,
    liquidityAddedAt: new Date().toISOString(),
    prefilledSocials: { website, twitter, telegram },
    boostAmount: t.amount || t.totalAmount || 0,
    description: t.description?.slice(0, 100) || '',
    
    // Placeholders - sieve will fill these later
    liquidity: 0,
    v24hUSD: 0,
    v24hChangePercent: 0,
    price: 0
  }
}

// --- NORMALIZER: DexScreener Search Pair ---
function normalizeSearchPair(p: any, searchTerm: string): any {
  const baseToken = p.baseToken || {}
  const info = p.info || {}
  const socials = info.socials || []
  const websites = info.websites || []
  
  const website = websites[0]?.url
  const twitter = socials.find((s: any) => s.platform === 'twitter')?.handle 
    ? `https://twitter.com/${socials.find((s: any) => s.platform === 'twitter').handle}`
    : undefined
  const telegram = socials.find((s: any) => s.platform === 'telegram')?.handle
    ? `https://t.me/${socials.find((s: any) => s.platform === 'telegram').handle}`
    : undefined

  const ageHours = p.pairCreatedAt 
    ? (Date.now() - p.pairCreatedAt) / (1000 * 60 * 60) 
    : 999

  return {
    address: baseToken.address,
    symbol: baseToken.symbol ? `$${baseToken.symbol}` : '$UNK',
    name: baseToken.name || baseToken.symbol || 'Unknown',
    logoURI: info.imageUrl || null,
    isNew: ageHours < 24,
    source: `dexscreener_search_${searchTerm}`,
    liquidityAddedAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : new Date().toISOString(),
    pairAddress: p.pairAddress,
    dexId: p.dexId,
    prefilledSocials: { website, twitter, telegram },
    ageHours: Math.round(ageHours),
    
    liquidity: p.liquidity?.usd || 0,
    v24hUSD: p.volume?.h24 || 0,
    v24hChangePercent: p.priceChange?.h24 || 0,
    priceChange5m: p.priceChange?.m5 || 0,
    priceChange1h: p.priceChange?.h1 || 0,
    priceChange6h: p.priceChange?.h6 || 0,
    price: parseFloat(p.priceUsd) || 0,
    fdv: p.fdv || 0,
    marketCap: p.marketCap || 0,
    
    txns: {
      m5: p.txns?.m5 || { buys: 0, sells: 0 },
      h1: p.txns?.h1 || { buys: 0, sells: 0 },
      h24: p.txns?.h24 || { buys: 0, sells: 0 }
    },
    
    boosts: p.boosts?.active || 0
  }
}