// server/api/hunter.get.ts
import { defineEventHandler, getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)
  
  // Default Filters based on your strategy
  const minLiq = query.min_liquidity || 5000
  const minTrade = query.min_trade || 10
  
  try {
    const response = await fetch(`https://public-api.birdeye.so/defi/v3/token/list?sort_by=v24hUSD&sort_type=desc&min_liquidity=${minLiq}&min_trade_1h_count=${minTrade}&limit=20`, {
      method: 'GET',
      headers: {
        'X-API-KEY': config.birdEyeApiKey,
        'accept': 'application/json',
        'x-chain': 'solana'
      }
    })

    const data = await response.json()
    return data
  } catch (error) {
    return { error: 'Failed to fetch hunter list' }
  }
})