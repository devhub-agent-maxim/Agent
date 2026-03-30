// Test environment setup
// Set required environment variables for testing
process.env.AGENT_TOOLS_URL = 'http://localhost:3000';
process.env.AGENT_SCHEDULER_URL = 'http://localhost:3002';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002';
process.env.PORT = '3001';
