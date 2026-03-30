import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { RoutePlanner } from '../routes/planner';
import { DeliveryStop } from '../maps/types';
import { printRoute, printError } from './reporter';

// Load .env from config directory relative to project root
const envPath = path.resolve(__dirname, '../../config/.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

async function main(): Promise<void> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    printError('GOOGLE_MAPS_API_KEY is not set. Copy config/.env.example to config/.env and add your key.');
    process.exit(1);
  }

  // Parse stops from CLI args: node index.js "Address 1" "Address 2" ...
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node dist/cli/index.js "Origin Address" "Stop 1" "Stop 2" ...');
    console.log('Example: node dist/cli/index.js "Shopee HQ Singapore" "1 Orchard Rd" "Marina Bay Sands"');
    process.exit(0);
  }

  const stops: DeliveryStop[] = args.map((address, idx) => ({
    id: idx === 0 ? 'ORIGIN' : `STOP-${idx}`,
    address,
    label: idx === 0 ? 'Origin (Shopee HQ)' : `Delivery ${idx}`,
  }));

  console.log(`\nPlanning route for ${stops.length} stops...`);

  const planner = new RoutePlanner(apiKey);

  try {
    const route = await planner.plan(stops);
    printRoute(route);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    printError(message);
    process.exit(1);
  }
}

main();
