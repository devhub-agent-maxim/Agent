import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = process.env.NODE_ENV === 'test' ? 'todos.test.db' : 'todos.db';
const DB_PATH = path.join(DATA_DIR, DB_FILE);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database connection
export const db: Database.Database = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );

    INSERT OR IGNORE INTO metadata (key, value) VALUES ('id_counter', 1);
  `);
}

// Get next ID counter
export function getNextIdCounter(): number {
  const stmt = db.prepare('SELECT value FROM metadata WHERE key = ?');
  const result = stmt.get('id_counter') as { value: number } | undefined;
  return result?.value || 1;
}

// Increment ID counter
export function incrementIdCounter(): number {
  const stmt = db.prepare('UPDATE metadata SET value = value + 1 WHERE key = ?');
  stmt.run('id_counter');
  return getNextIdCounter();
}

// Reset ID counter (for testing)
export function resetIdCounter(): void {
  const stmt = db.prepare('UPDATE metadata SET value = 1 WHERE key = ?');
  stmt.run('id_counter');
}

// Close database connection
export function closeDatabase(): void {
  db.close();
}
