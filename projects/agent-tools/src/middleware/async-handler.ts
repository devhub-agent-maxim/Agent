import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrapper for async route handlers to catch errors and pass them to error middleware
 * Usage: router.get('/', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn: RequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
