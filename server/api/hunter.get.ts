/**
 * server/api/hunter.get.ts
 * 
 * Unified token discovery endpoint.
 * 
 * FREE Data Sources:
 * - BirdEye Trending (FREE tier)
 * - BirdEye New Listings (FREE tier)
 * - DexScreener Profiles (no API key needed)
 * - DexScreener Boosts (no API key needed)
 * 
 * Rate Limits:
 * - BirdEye: 1 RPS, 30,000 CUs/month
 * - DexScreener: No strict limit (be reasonable)
 */

import { defineEventHandler, getQuery } from 'h3'

// === RATE LIMITING STATE ===
let lastBirdeyeCall = 0
const BIRDEYE_COOLDOWN_MS = 1100 // 1 RPS = 1000ms + buffer

// === ROTATION STATE ===
let rotationIndex = 0

// === CACHE (reduce duplicate API calls) ===
const sourceCache = new Map<string, { data: any[], timestamp: number }>()
const CACHE_TTL_MS = 30_000 // 30 seconds

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)
  const requestedType = query.type as string || 'auto'
  
  try {
    let result: { items: any[], sourceName: string }
    
    switch (requestedType) {
      case 'auto':
        result = await getNextRotationSource(config.birdeyeApiKey)
        break
      case 'trending':
        result = await fetchBirdeyeTrending(config.birdeyeApiKey)
        break
      case 'newListings':
        result = await fetchBirdeyeNewListings(config.birdeyeApiKey)
        break
      case 'boosts':
        result = await fetchDexScreenerBoosts()
        break
      case 'profiles':
        result = await fetchDexScreenerProfiles()
        break
      case 'gainers':
        result = await fetchDexScreenerGainers()
        break
      default:
        result = await getNextRotationSource(config.birdeyeApiKey)
    }

    // Fallback if empty
    if (result.items.length === 0) {
      result = await fetchDexScreenerProfiles()
    }

    console.log(`[Hunter] ✅ ${result.items.length} items from: ${result.sourceName}`)
    
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

// =============================================================================
// SMART ROTATION
// =============================================================================

async function getNextRotationSource(birdeyeKey: string): Promise<{ items: any[], sourceName: string }> {
  // Rotation pattern - balances BirdEye (rate limited) with DexScreener (unlimited)
  // BirdEye appears less frequently to respect 1 RPS limit
  const sources = [
    'trending',      // BirdEye - high quality
    'profiles',      // DexScreener - new tokens
    'boosts',        // DexScreener - promoted tokens
    'newListings',   // BirdEye - fresh memecoins
    'gainers',       // DexScreener - top gainers
    'profiles',      // DexScreener
    'trending',      // BirdEye
    'boosts',        // DexScreener
  ]
  
  const sourceKey = sources[rotationIndex % sources.length]
  rotationIndex++
  
  console.log(`[Hunter] Rotation #${rotationIndex}: ${sourceKey}`)
  
  switch (sourceKey) {
    case 'trending':
      return fetchBirdeyeTrending(birdeyeKey)
    case 'newListings':
      return fetchBirdeyeNewListings(birdeyeKey)
    case 'profiles':
      return fetchDexScreenerProfiles()
    case 'boosts':
      return fetchDexScreenerBoosts()
    case 'gainers':
      return fetchDexScreenerGainers()
    default:
      return fetchDexScreenerProfiles()
  }
}

// =============================================================================
// BIRDEYE SOURCES (FREE TIER - 1 RPS, 30k CUs/month)
// =============================================================================

async function fetchBirdeyeTrending(apiKey: string): Promise<{ items: any[], sourceName: string }> {
  if (!apiKey) {
    console.log('[Hunter] No BirdEye API key, falling back to DexScreener')
    return fetchDexScreenerGainers()
  }
  
  // Check rate limit
  const now = Date.now()
  if (now - lastBirdeyeCall < BIRDEYE_COOLDOWN_MS) {
    console.log('[Hunter] BirdEye rate limited, using cache or fallback')
    const cached = sourceCache.get('trending')
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return { items: cached.data, sourceName: 'Trending (cached)' }
    }
    return fetchDexScreenerGainers()
  }
  
  try {
    lastBirdeyeCall = Date.now()
    
    const response = await fetch(
      'https://public-api.birdeye.so/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=20',
      {
        method: 'GET',
        headers: {
          'X-API-KEY': apiKey,
          'accept': 'application/json',
          'x-chain': 'solana'
        }
      }
    )
    
    if (!response.ok) {
      console.error('[Hunter] BirdEye trending error:', response.status)
      return fetchDexScreenerGainers()
    }
    
    const json = await response.json()
    
    if (!json.success || !json.data?.tokens) {
      return { items: [], sourceName: 'Trending (no data)' }
    }
    
    const items = json.data.tokens.map((t: any) => formatBirdeyeToken(t, 'trending'))
    
    // Cache results
    sourceCache.set('trending', { data: items, timestamp: Date.now() })
    
    return { items, sourceName: `Trending (${items.length})` }
  } catch (e) {
    console.error('[Hunter] BirdEye trending error:', e)
    return fetchDexScreenerGainers()
  }
}

async function fetchBirdeyeNewListings(apiKey: string): Promise<{ items: any[], sourceName: string }> {
  if (!apiKey) {
    console.log('[Hunter] No BirdEye API key, falling back to DexScreener')
    return fetchDexScreenerProfiles()
  }
  
  // Check rate limit
  const now = Date.now()
  if (now - lastBirdeyeCall < BIRDEYE_COOLDOWN_MS) {
    console.log('[Hunter] BirdEye rate limited, using cache or fallback')
    const cached = sourceCache.get('newListings')
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return { items: cached.data, sourceName: 'New Listings (cached)' }
    }
    return fetchDexScreenerProfiles()
  }
  
  try {
    lastBirdeyeCall = Date.now()
    
    const response = await fetch(
      'https://public-api.birdeye.so/defi/v2/tokens/new_listing?limit=20&meme_platform_enabled=true',
      {
        method: 'GET',
        headers: {
          'X-API-KEY': apiKey,
          'accept': 'application/json',
          'x-chain': 'solana'
        }
      }
    )
    
    if (!response.ok) {
      console.error('[Hunter] BirdEye new listings error:', response.status)
      return fetchDexScreenerProfiles()
    }
    
    const json = await response.json()
    
    if (!json.success || !json.data?.items) {
      return { items: [], sourceName: 'New Listings (no data)' }
    }
    
    const items = json.data.items
      .filter((t: any) => t.address) // Must have address
      .map((t: any) => formatBirdeyeNewListing(t))
    
    // Cache results
    sourceCache.set('newListings', { data: items, timestamp: Date.now() })
    
    return { items, sourceName: `New Listings (${items.length})` }
  } catch (e) {
    console.error('[Hunter] BirdEye new listings error:', e)
    return fetchDexScreenerProfiles()
  }
}

// =============================================================================
// DEXSCREENER SOURCES (FREE - No API Key Needed)
// =============================================================================

async function fetchDexScreenerProfiles(): Promise<{ items: any[], sourceName: string }> {
  // Check cache first
  const cached = sourceCache.get('profiles')
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { items: cached.data, sourceName: 'Profiles (cached)' }
  }
  
  try {
    const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', { 
      headers: { 'Accept': 'application/json' }
    })
    const profiles = await response.json()
    
    if (!Array.isArray(profiles)) {
      return { items: [], sourceName: 'Profiles (no data)' }
    }
    
    const solanaTokens = profiles.filter((t: any) => t.chainId === 'solana')
    const addresses = solanaTokens.slice(0, 30).map((t: any) => t.tokenAddress).filter(Boolean)
    
    // Enrich with pair data
    const pairData = await fetchPairDataBatch(addresses)
    
    const items: any[] = []
    const now = Date.now()
    
    for (const profile of solanaTokens.slice(0, 30)) {
      const addr = profile.tokenAddress
      const pair = pairData[addr]
      
      if (pair) {
        const ageMs = pair.pairCreatedAt ? now - pair.pairCreatedAt : 0
        items.push({
          address: addr,
          symbol: pair.baseToken?.symbol ? `$${pair.baseToken.symbol}` : extractSymbol(profile),
          name: pair.baseToken?.name || profile.header || 'Unknown',
          logoURI: profile.icon || pair.info?.imageUrl || null,
          source: 'profile',
          isNewborn: ageMs > 0 && ageMs < 2 * 60 * 60 * 1000, // < 2 hours
          ageMinutes: ageMs > 0 ? Math.round(ageMs / 60000) : undefined,
          liquidity: pair.liquidity?.usd || 0,
          price: parseFloat(pair.priceUsd) || 0,
          priceChange5m: pair.priceChange?.m5 || 0,
          priceChange1h: pair.priceChange?.h1 || 0,
          volume1h: pair.volume?.h1 || 0,
          txns: {
            m5: pair.txns?.m5 || { buys: 0, sells: 0 },
            h1: pair.txns?.h1 || { buys: 0, sells: 0 },
          },
          fdv: pair.fdv || 0,
          pairAddress: pair.pairAddress,
        })
      } else {
        // No pair data yet - still include for discovery
        items.push({
          address: addr,
          symbol: extractSymbol(profile),
          name: profile.header || 'Unknown',
          logoURI: profile.icon || null,
          source: 'profile',
          isNewborn: true, // Assume new if no pair data
        })
      }
    }
    
    // Filter for quality (some liquidity or very new)
    const qualityItems = items.filter(t => 
      (t.liquidity && t.liquidity >= 1000) || t.isNewborn
    )
    
    // Cache results
    sourceCache.set('profiles', { data: qualityItems, timestamp: Date.now() })
    
    return { items: qualityItems.slice(0, 20), sourceName: `Profiles (${qualityItems.length})` }
  } catch (e) {
    console.error('[Hunter] Profiles error:', e)
    return { items: [], sourceName: 'Profiles (error)' }
  }
}

async function fetchDexScreenerBoosts(): Promise<{ items: any[], sourceName: string }> {
  // Check cache first
  const cached = sourceCache.get('boosts')
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { items: cached.data, sourceName: 'Boosts (cached)' }
  }
  
  try {
    const response = await fetch('https://api.dexscreener.com/token-boosts/latest/v1', { 
      headers: { 'Accept': 'application/json' }
    })
    const boosts = await response.json()
    
    if (!Array.isArray(boosts)) {
      return { items: [], sourceName: 'Boosts (no data)' }
    }
    
    const solanaTokens = boosts.filter((t: any) => t.chainId === 'solana')
    const addresses = solanaTokens.slice(0, 30).map((t: any) => t.tokenAddress).filter(Boolean)
    
    // Enrich with pair data
    const pairData = await fetchPairDataBatch(addresses)
    
    const items: any[] = []
    const now = Date.now()
    
    for (const boost of solanaTokens.slice(0, 30)) {
      const addr = boost.tokenAddress
      const pair = pairData[addr]
      
      if (pair) {
        const ageMs = pair.pairCreatedAt ? now - pair.pairCreatedAt : 0
        const liq = pair.liquidity?.usd || 0
        const txns1h = (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0)
        
        // Boosted tokens with decent activity
        if (liq >= 5000 || txns1h >= 10) {
          items.push({
            address: addr,
            symbol: pair.baseToken?.symbol ? `$${pair.baseToken.symbol}` : extractSymbol(boost),
            name: pair.baseToken?.name || boost.header || 'Unknown',
            logoURI: boost.icon || pair.info?.imageUrl || null,
            source: 'boost',
            isHighVolume: txns1h >= 50,
            boostAmount: boost.amount || boost.totalAmount || 0,
            ageMinutes: ageMs > 0 ? Math.round(ageMs / 60000) : undefined,
            liquidity: liq,
            price: parseFloat(pair.priceUsd) || 0,
            priceChange5m: pair.priceChange?.m5 || 0,
            priceChange1h: pair.priceChange?.h1 || 0,
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
    }
    
    // Sort by boost amount (most boosted first)
    items.sort((a, b) => (b.boostAmount || 0) - (a.boostAmount || 0))
    
    // Cache results
    sourceCache.set('boosts', { data: items, timestamp: Date.now() })
    
    return { items: items.slice(0, 20), sourceName: `Boosts (${items.length})` }
  } catch (e) {
    console.error('[Hunter] Boosts error:', e)
    return { items: [], sourceName: 'Boosts (error)' }
  }
}

async function fetchDexScreenerGainers(): Promise<{ items: any[], sourceName: string }> {
  // Check cache first
  const cached = sourceCache.get('gainers')
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { items: cached.data, sourceName: 'Gainers (cached)' }
  }
  
  try {
    // Get tokens from boosts but sort by price change
    const response = await fetch('https://api.dexscreener.com/token-boosts/top/v1', { 
      headers: { 'Accept': 'application/json' }
    })
    const boosts = await response.json()
    
    if (!Array.isArray(boosts)) {
      // Fallback to profiles
      return fetchDexScreenerProfiles()
    }
    
    const solanaTokens = boosts.filter((t: any) => t.chainId === 'solana')
    const addresses = solanaTokens.slice(0, 40).map((t: any) => t.tokenAddress).filter(Boolean)
    
    // Enrich with pair data
    const pairData = await fetchPairDataBatch(addresses)
    
    const items: any[] = []
    const now = Date.now()
    
    for (const token of solanaTokens.slice(0, 40)) {
      const addr = token.tokenAddress
      const pair = pairData[addr]
      
      if (pair) {
        const liq = pair.liquidity?.usd || 0
        const priceChange1h = pair.priceChange?.h1 || 0
        const txns1h = (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0)
        const ageMs = pair.pairCreatedAt ? now - pair.pairCreatedAt : 0
        
        // High activity gainers
        if (liq >= 10000 && txns1h >= 20) {
          items.push({
            address: addr,
            symbol: pair.baseToken?.symbol ? `$${pair.baseToken.symbol}` : '$UNK',
            name: pair.baseToken?.name || 'Unknown',
            logoURI: token.icon || pair.info?.imageUrl || null,
            source: 'gainer',
            isHighVolume: true,
            ageMinutes: ageMs > 0 ? Math.round(ageMs / 60000) : undefined,
            liquidity: liq,
            price: parseFloat(pair.priceUsd) || 0,
            priceChange5m: pair.priceChange?.m5 || 0,
            priceChange1h: priceChange1h,
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
    }
    
    // Sort by 1h price change (biggest gainers first)
    items.sort((a, b) => (b.priceChange1h || 0) - (a.priceChange1h || 0))
    
    // Cache results
    sourceCache.set('gainers', { data: items, timestamp: Date.now() })
    
    return { items: items.slice(0, 20), sourceName: `Gainers (${items.length})` }
  } catch (e) {
    console.error('[Hunter] Gainers error:', e)
    return { items: [], sourceName: 'Gainers (error)' }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function formatBirdeyeToken(t: any, source: string): any {
  return {
    address: t.address,
    symbol: t.symbol ? `$${t.symbol}` : '$UNK',
    name: t.name || 'Unknown',
    logoURI: t.logoURI || t.logo || null,
    source,
    rank: t.rank,
    liquidity: t.liquidity || 0,
    price: t.price || 0,
    priceChange24h: t.priceChange24hPercent || 0,
    volume24h: t.volume24hUSD || t.v24hUSD || 0,
    mc: t.mc || t.marketCap || 0,
  }
}

function formatBirdeyeNewListing(t: any): any {
  const now = Date.now()
  const listTime = t.listTime ? t.listTime * 1000 : now // listTime is in seconds
  const ageMs = now - listTime
  
  return {
    address: t.address,
    symbol: t.symbol ? `$${t.symbol}` : '$UNK',
    name: t.name || 'Unknown',
    logoURI: t.logoURI || t.logo || null,
    source: 'newListing',
    isNewborn: true,
    ageMinutes: Math.round(ageMs / 60000),
    liquidity: t.liquidity || 0,
    price: t.price || 0,
    mc: t.mc || t.marketCap || 0,
    // Meme platform info
    memeplatform: t.memeplatform,
  }
}

async function fetchPairDataBatch(addresses: string[]): Promise<Record<string, any>> {
  const results: Record<string, any> = {}
  if (addresses.length === 0) return results
  
  // DexScreener allows up to 30 addresses per request
  for (let i = 0; i < addresses.length; i += 30) {
    const chunk = addresses.slice(i, i + 30)
    try {
      const response = await fetch(
        `https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`,
        { headers: { 'Accept': 'application/json' } }
      )
      const pairs = await response.json()
      
      if (Array.isArray(pairs)) {
        for (const pair of pairs) {
          const addr = pair.baseToken?.address
          if (!addr) continue
          // Keep pair with highest liquidity
          const liq = pair.liquidity?.usd || 0
          if (!results[addr] || liq > (results[addr].liquidity?.usd || 0)) {
            results[addr] = pair
          }
        }
      }
    } catch (e) {
      console.error('[Hunter] Pair batch fetch error:', e)
    }
  }
  
  return results
}

function extractSymbol(item: any): string {
  let symbol = 'UNK'
  
  // Try header
  if (item.header && typeof item.header === 'string' && !item.header.startsWith('http')) {
    symbol = item.header.split(/[\s\-–]/)[0].replace(/[^a-zA-Z0-9$]/g, '').toUpperCase()
  }
  
  // Try description
  if ((!symbol || symbol === 'UNK') && item.description) {
    const match = item.description.match(/\$([A-Z0-9]+)/i)
    if (match) symbol = match[1].toUpperCase()
  }
  
  // Fallback to address prefix
  if (!symbol || symbol === 'UNK') {
    symbol = item.tokenAddress?.slice(0, 6)?.toUpperCase() || 'UNK'
  }
  
  return symbol.startsWith('$') ? symbol : '$' + symbol
}