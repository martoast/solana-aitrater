import { defineEventHandler } from 'h3'
import { getDb } from '../utils/db'

export default defineEventHandler((event) => {
  const db = getDb()
  
  return { 
    trades: db.activeTrades,
    history: db.history // We can now show history too!
  }
})