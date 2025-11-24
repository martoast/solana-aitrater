import fs from 'node:fs'
import path from 'node:path'

// Define the structure of our Trade
export interface Trade {
  id: string;
  address: string; // Crucial for tracking
  symbol: string;
  name: string;
  logoURI?: string;
  entryPrice: number;
  amount: number;
  timestamp: number;
  status: 'OPEN' | 'CLOSED';
  
  // Exit Data (Optional)
  exitPrice?: number;
  pnl?: number;
  closedAt?: number;
}

// Define the DB Structure
interface Database {
  activeTrades: Trade[];
  history: Trade[]; // Sold trades go here
}

// File Path (Saved in the root of your project)
const DB_DIR = path.resolve(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'trades.json')

// Ensure file exists
const initDb = () => {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR)
  }
  if (!fs.existsSync(DB_PATH)) {
    const initialData: Database = { activeTrades: [], history: [] }
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2))
  }
}

// Read Data
export const getDb = (): Database => {
  initDb()
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8')
    return JSON.parse(data)
  } catch (e) {
    return { activeTrades: [], history: [] }
  }
}

// Write Data
export const saveDb = (data: Database) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
}