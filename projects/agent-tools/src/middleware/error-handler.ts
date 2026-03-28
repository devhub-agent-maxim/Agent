import { Request, Response, NextFunction } from 'express';
import { ErrorResponse } from '../types/errors';

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    Error.captureStackTrace(this, this.constructor);

    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(message, 400);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Centralized error handler middleware
 * Should be registered as the last middleware in the Express app
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Default to 500 if not an AppError
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const isOperational = err instanceof AppError ? err.isOperational : false;

  // Log error details
  if (!isOperational || statusCode >= 500) {
    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      statusCode,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  }

  // Format error response
  // Use 'error' field for the message to maintain backward compatibility with existing tests
  const errorMessage = isOperational ? err.message : 'An unexpected error occurred';

  const errorResponse: ErrorResponse = {
    error: errorMessage,
    message: errorMessage,
    statusCode,
    timestamp: new Date().toISOString(),
    path: req.path
  };

  // Don't expose internal error details in production for non-operational errors
  if (process.env.NODE_ENV === 'production' && !isOperational) {
    errorResponse.error = 'An unexpected error occurred';
    errorResponse.message = 'An unexpected error occurred';
  }

  res.status(statusCode).json(errorResponse);
};
