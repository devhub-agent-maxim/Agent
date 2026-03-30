import rateLimit from 'express-rate-limit';

/**
 * Rate limiter configuration for API endpoints
 *
 * Default: 100 requests per 15 minutes per IP address
 *
 * When limit is exceeded, returns 429 Too Many Requests with:
 * - Retry-After header (seconds until reset)
 * - X-RateLimit-Limit header (max requests allowed)
 * - X-RateLimit-Remaining header (requests remaining)
 * - X-RateLimit-Reset header (timestamp when limit resets)
 */
export const todoRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers

  // Skip successful requests from counting against the limit
  skipSuccessfulRequests: false,

  // Skip failed requests from counting against the limit
  skipFailedRequests: false,

  // Handler for when rate limit is exceeded
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Create a custom rate limiter with specific configuration
 *
 * @param windowMs - Time window in milliseconds
 * @param max - Maximum number of requests per window
 * @returns Rate limiter middleware
 */
export const createRateLimiter = (windowMs: number, max: number) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Too many requests, please try again later.'
      });
    }
  });
};
