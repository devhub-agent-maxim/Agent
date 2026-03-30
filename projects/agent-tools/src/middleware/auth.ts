import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to validate Bearer token authentication
 * Expects API_KEYS environment variable with comma-separated valid tokens
 */
export const authenticateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({ error: 'Invalid authorization header format. Expected: Bearer <token>' });
    return;
  }

  const token = parts[1];
  const validKeys = process.env.API_KEYS?.split(',').map(k => k.trim()) || [];

  if (validKeys.length === 0) {
    res.status(500).json({ error: 'API_KEYS not configured' });
    return;
  }

  if (!validKeys.includes(token)) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
};
