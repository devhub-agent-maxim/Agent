import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

let db: Database | null = null;
let dbPath: string | null = null;

export async function initDatabase(customPath?: string): Promise<Database> {
  const SQL = await initSqlJs();
  const finalPath = customPath || path.join(process.cwd(), 'data', 'scheduler.db');
  dbPath = finalPath;

  // Load existing database if it exists
  if (fs.existsSync(finalPath)) {
    const buffer = fs.readFileSync(finalPath);
    db = new SQL.Database(buffer);
  } else {
    // Create new database
    db = new SQL.Database();
  }

  // Create scheduled_tasks table
  db.run(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      command TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run INTEGER,
      next_run INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Save to disk
  saveDatabase();

  return db;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function saveDatabase(): void {
  if (!db || !dbPath) {
    return;
  }

  const data = db.export();
  const buffer = Buffer.from(data);

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(dbPath, buffer);
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    dbPath = null;
  }
}
