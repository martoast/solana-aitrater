import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  
  try {
    const response = await fetch('https://public-api.birdeye.so/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=10', {
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
    return { error: 'Failed to fetch trending tokens' }
  }
})