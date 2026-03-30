import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  errorHandler
} from '../src/middleware/error-handler';
import { asyncHandler } from '../src/middleware/async-handler';

describe('Error Handler Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('Custom Error Classes', () => {
    it('should create AppError with correct properties', () => {
      const error = new AppError('Test error', 500);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });

    it('should create ValidationError with 400 status', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error).toBeInstanceOf(AppError);
    });

    it('should create NotFoundError with 404 status', () => {
      const error = new NotFoundError('Resource not found');
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
      expect(error).toBeInstanceOf(AppError);
    });

    it('should create UnauthorizedError with 401 status', () => {
      const error = new UnauthorizedError('Access denied');
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(401);
      expect(error.isOperational).toBe(true);
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('Error Handler - ValidationError (400)', () => {
    it('should handle ValidationError and return 400', async () => {
      app.get('/test', (req: Request, res: Response, next: NextFunction) => {
        next(new ValidationError('Title is required'));
      });
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Title is required');
      expect(response.body).toHaveProperty('message', 'Title is required');
      expect(response.body).toHaveProperty('statusCode', 400);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('path', '/test');
    });
  });

  describe('Error Handler - UnauthorizedError (401)', () => {
    it('should handle UnauthorizedError and return 401', async () => {
      app.get('/test', (req: Request, res: Response, next: NextFunction) => {
        next(new UnauthorizedError('Invalid API key'));
      });
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid API key');
      expect(response.body).toHaveProperty('message', 'Invalid API key');
      expect(response.body).toHaveProperty('statusCode', 401);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('path', '/test');
    });
  });

  describe('Error Handler - NotFoundError (404)', () => {
    it('should handle NotFoundError and return 404', async () => {
      app.get('/test', (req: Request, res: Response, next: NextFunction) => {
        next(new NotFoundError('Todo not found'));
      });
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Todo not found');
      expect(response.body).toHaveProperty('message', 'Todo not found');
      expect(response.body).toHaveProperty('statusCode', 404);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('path', '/test');
    });
  });

  describe('Error Handler - Internal Server Error (500)', () => {
    it('should handle generic Error and return 500', async () => {
      app.get('/test', (req: Request, res: Response, next: NextFunction) => {
        next(new Error('Unexpected error'));
      });
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'An unexpected error occurred');
      expect(response.body).toHaveProperty('message', 'An unexpected error occurred');
      expect(response.body).toHaveProperty('statusCode', 500);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('path', '/test');
    });

    it('should handle AppError with 500 status', async () => {
      app.get('/test', (req: Request, res: Response, next: NextFunction) => {
        next(new AppError('Database connection failed', 500));
      });
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Database connection failed');
      expect(response.body).toHaveProperty('message', 'Database connection failed');
      expect(response.body).toHaveProperty('statusCode', 500);
    });
  });

  describe('Async Handler', () => {
    it('should catch errors from async handlers and pass to error middleware', async () => {
      app.get(
        '/test',
        asyncHandler(async (req: Request, res: Response) => {
          throw new ValidationError('Async validation failed');
        })
      );
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Async validation failed');
      expect(response.body).toHaveProperty('message', 'Async validation failed');
    });

    it('should catch rejected promises from async handlers', async () => {
      app.get(
        '/test',
        asyncHandler(async (req: Request, res: Response) => {
          await Promise.reject(new NotFoundError('Resource not found'));
        })
      );
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Resource not found');
      expect(response.body).toHaveProperty('message', 'Resource not found');
    });

    it('should allow successful async handlers to complete', async () => {
      app.get(
        '/test',
        asyncHandler(async (req: Request, res: Response) => {
          await Promise.resolve();
          res.json({ success: true });
        })
      );
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
    });
  });

  describe('Error Response Format', () => {
    it('should include timestamp in ISO format', async () => {
      app.get('/test', (req: Request, res: Response, next: NextFunction) => {
        next(new ValidationError('Test error'));
      });
      app.use(errorHandler);

      const response = await request(app).get('/test');

      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should include request path', async () => {
      app.get('/api/test/path', (req: Request, res: Response, next: NextFunction) => {
        next(new NotFoundError('Not found'));
      });
      app.use(errorHandler);

      const response = await request(app).get('/api/test/path');

      expect(response.body.path).toBe('/api/test/path');
    });
  });
});
