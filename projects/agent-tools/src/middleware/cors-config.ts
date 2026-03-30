import cors from 'cors';
import { CorsOptions } from 'cors';

/**
 * CORS configuration with secure defaults
 *
 * Allowed origins are loaded from CORS_ALLOWED_ORIGINS environment variable.
 * If not set, defaults to localhost in development.
 *
 * Example .env:
 * CORS_ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com
 */

const getAllowedOrigins = (): string[] => {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;

  if (envOrigins) {
    return envOrigins.split(',').map(origin => origin.trim()).filter(Boolean);
  }

  // Default allowed origins for development
  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001'
  ];
};

const allowedOrigins = getAllowedOrigins();

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    }
  },
  credentials: true, // Allow cookies and authorization headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed HTTP methods
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['X-Request-Id'], // Headers that clients can access
  maxAge: 86400, // Cache preflight response for 24 hours (in seconds)
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

export const corsMiddleware = cors(corsOptions);
export { allowedOrigins };
