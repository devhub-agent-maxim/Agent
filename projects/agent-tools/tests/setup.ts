import fs from 'fs';
import path from 'path';

// Set test environment
process.env.NODE_ENV = 'test';

// Clean up test database before all tests
const dbPath = path.join(__dirname, '../data/todos.test.db');

beforeAll(() => {
  // Remove test database if it exists
  if (fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath);
    } catch (err) {
      // Ignore errors
    }
  }
});
