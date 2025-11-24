// server/api/new-listings.get.ts
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  
  try {
    // Fetch last 20 new listings
    const response = await fetch('https://public-api.birdeye.so/defi/v2/tokens/new_listing?limit=20&meme_platform_enabled=true', {
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
    return { error: 'Failed to fetch new listings' }
  }
})