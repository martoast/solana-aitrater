import { defineEventHandler, readBody } from 'h3'
import { getDb, saveDb, type Trade } from '../utils/db'
import { calculateBuyFees, formatFeeBreakdown } from '../utils/fees'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const action = body.action

  // Load current state from file
  const db = getDb()

  // Check if we're on devnet (for fee simulation)
  const config = useRuntimeConfig()
  const isDevnet = config.public.solanaNetwork === 'devnet'

  if (action === 'OPEN') {
    const investAmount = body.amount || 10

    // Calculate fees for buy transaction
    const feeCalc = calculateBuyFees(investAmount, isDevnet)

    // The net amount is what actually gets used to buy tokens
    // This means user gets fewer tokens than if there were no fees
    const effectiveInvestment = feeCalc.netAmount

    const newTrade: Trade = {
      id: Math.random().toString(36).substring(7),
      address: body.token.address, // Ensure address is saved!
      symbol: body.token.symbol,
      name: body.token.name,
      logoURI: body.token.logoURI,
      entryPrice: body.token.price,
      amount: investAmount, // Original investment amount
      entryFees: feeCalc.totalFees, // Track fees paid on entry
      totalFees: feeCalc.totalFees,
      timestamp: Date.now(),
      status: 'OPEN'
    }

    // Add to active trades
    db.activeTrades.push(newTrade)
    saveDb(db) // Persist to file

    // Include fee info in response message
    const feeInfo = isDevnet ? ` (Net after fees: $${effectiveInvestment.toFixed(2)})` : ''
    return {
      success: true,
      trade: newTrade,
      message: `Opened position: $${investAmount} on ${newTrade.symbol}${feeInfo}`,
      feeBreakdown: isDevnet ? formatFeeBreakdown(feeCalc) : undefined
    }
  }

  if (action === 'CLOSE') {
    const tradeIndex = db.activeTrades.findIndex((t: any) => t.id === body.tradeId)

    if (tradeIndex === -1) return { error: 'Trade not found' }

    const trade = db.activeTrades[tradeIndex]
    const currentPrice = body.currentPrice

    // Calculate the value of the position at current price
    // We use the net amount after entry fees to calculate token quantity
    const entryFees = trade.entryFees || 0
    const netEntryAmount = trade.amount - entryFees
    const tokenQuantity = netEntryAmount / trade.entryPrice
    const grossSaleValue = tokenQuantity * currentPrice

    // Apply exit fees to the sale proceeds
    const { calculateSellFees } = await import('../utils/fees')
    const exitFeeCalc = calculateSellFees(grossSaleValue, isDevnet)
    const netSaleProceeds = exitFeeCalc.netAmount

    // Calculate actual P&L considering both entry and exit fees
    // P&L = Net proceeds from sale - Original investment
    const pnl = netSaleProceeds - trade.amount
    const priceChange = (currentPrice - trade.entryPrice) / trade.entryPrice

    // Update trade details
    trade.exitPrice = currentPrice
    trade.exitFees = exitFeeCalc.totalFees
    trade.totalFees = entryFees + exitFeeCalc.totalFees
    trade.pnl = pnl
    trade.status = 'CLOSED'
    trade.closedAt = Date.now()

    // Move from Active to History
    db.activeTrades.splice(tradeIndex, 1)
    db.history.unshift(trade) // Add to top of history

    saveDb(db) // Persist to file

    const feeInfo = isDevnet ? ` | Fees: $${trade.totalFees?.toFixed(4)}` : ''
    return {
      success: true,
      pnl: pnl,
      message: `Sold ${trade.symbol}. PnL: $${pnl.toFixed(2)} (${(priceChange * 100).toFixed(2)}%)${feeInfo}`,
      feeBreakdown: isDevnet ? formatFeeBreakdown(exitFeeCalc) : undefined
    }
  }
})