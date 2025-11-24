import { defineEventHandler, readBody } from 'h3'
import { getDb, saveDb, type Trade } from '../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const action = body.action 
  
  // Load current state from file
  const db = getDb()

  if (action === 'OPEN') {
    const investAmount = body.amount || 10 
    
    const newTrade: Trade = {
      id: Math.random().toString(36).substring(7),
      address: body.token.address, // Ensure address is saved!
      symbol: body.token.symbol,
      name: body.token.name,
      logoURI: body.token.logoURI,
      entryPrice: body.token.price,
      amount: investAmount, 
      timestamp: Date.now(),
      status: 'OPEN'
    }
    
    // Add to active trades
    db.activeTrades.push(newTrade)
    saveDb(db) // Persist to file
    
    return { success: true, trade: newTrade, message: `Opened position: $${investAmount} on ${newTrade.symbol}` }
  }

  if (action === 'CLOSE') {
    const tradeIndex = db.activeTrades.findIndex((t: any) => t.id === body.tradeId)
    
    if (tradeIndex === -1) return { error: 'Trade not found' }

    const trade = db.activeTrades[tradeIndex]
    const currentPrice = body.currentPrice
    
    // Calculate Profit/Loss
    const priceChange = (currentPrice - trade.entryPrice) / trade.entryPrice
    const pnl = trade.amount * priceChange

    // Update trade details
    trade.exitPrice = currentPrice
    trade.pnl = pnl
    trade.status = 'CLOSED'
    trade.closedAt = Date.now()

    // Move from Active to History
    db.activeTrades.splice(tradeIndex, 1)
    db.history.unshift(trade) // Add to top of history
    
    saveDb(db) // Persist to file

    return { 
      success: true, 
      pnl: pnl, 
      message: `Sold ${trade.symbol}. PnL: $${pnl.toFixed(2)} (${(priceChange * 100).toFixed(2)}%)` 
    }
  }
})