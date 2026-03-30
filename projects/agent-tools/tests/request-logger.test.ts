import request from 'supertest';
import express, { Request, Response } from 'express';
import { requestLogger } from '../src/middleware/request-logger';
import { logger } from '../src/utils/logger';

describe('Request Logger Middleware', () => {
  let app: express.Application;
  let loggerInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    app = express();
    app.use(requestLogger);
    app.use(express.json());

    // Add a test route
    app.get('/test', (req: Request, res: Response) => {
      res.json({ message: 'test response' });
    });

    app.post('/test', (req: Request, res: Response) => {
      res.json({ message: 'created' });
    });

    // Mock logger to capture calls
    loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('request ID generation', () => {
    it('should attach a unique requestId to each request', async () => {
      await request(app).get('/test');

      expect(loggerInfoSpy).toHaveBeenCalled();
      const firstCall = loggerInfoSpy.mock.calls[0];
      expect(firstCall[1]).toHaveProperty('requestId');
      expect(typeof firstCall[1].requestId).toBe('string');
      expect(firstCall[1].requestId.length).toBeGreaterThan(0);
    });

    it('should generate different requestIds for different requests', async () => {
      await request(app).get('/test');
      await request(app).get('/test');

      expect(loggerInfoSpy).toHaveBeenCalledTimes(4); // 2 requests * 2 logs each (incoming + completed)

      const firstRequestId = loggerInfoSpy.mock.calls[0][1].requestId;
      const secondRequestId = loggerInfoSpy.mock.calls[2][1].requestId;

      expect(firstRequestId).not.toBe(secondRequestId);
    });
  });

  describe('request logging', () => {
    it('should log incoming request with method, path, and requestId', async () => {
      await request(app).get('/test?foo=bar');

      expect(loggerInfoSpy).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          requestId: expect.any(String),
          method: 'GET',
          path: '/test',
          query: { foo: 'bar' }
        })
      );
    });

    it('should log request completion with status code and duration', async () => {
      await request(app).get('/test');

      // Should be called twice: once for incoming, once for completed
      expect(loggerInfoSpy).toHaveBeenCalledTimes(2);

      const completedLog = loggerInfoSpy.mock.calls[1];
      expect(completedLog[0]).toBe('Request completed');
      expect(completedLog[1]).toMatchObject({
        requestId: expect.any(String),
        method: 'GET',
        path: '/test',
        statusCode: 200,
        duration: expect.stringMatching(/^\d+ms$/)
      });
    });

    it('should log POST requests correctly', async () => {
      await request(app)
        .post('/test')
        .send({ data: 'test' });

      expect(loggerInfoSpy).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          method: 'POST',
          path: '/test'
        })
      );
    });
  });

  describe('duration tracking', () => {
    it('should track request duration', async () => {
      await request(app).get('/test');

      const completedLog = loggerInfoSpy.mock.calls[1];
      const duration = completedLog[1].duration;

      expect(duration).toMatch(/^\d+ms$/);
      const durationValue = parseInt(duration);
      expect(durationValue).toBeGreaterThanOrEqual(0);
    });

    it('should track duration for slow requests', async () => {
      // Add a slow endpoint
      app.get('/slow', async (req: Request, res: Response) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        res.json({ message: 'slow response' });
      });

      await request(app).get('/slow');

      const completedLog = loggerInfoSpy.mock.calls[1];
      const duration = completedLog[1].duration;
      const durationValue = parseInt(duration);

      expect(durationValue).toBeGreaterThanOrEqual(100);
    });
  });

  describe('error handling', () => {
    it('should log requests even when handler throws error', async () => {
      app.get('/error', (req: Request, res: Response) => {
        throw new Error('Test error');
      });

      // Add error handler to prevent test from failing
      app.use((err: Error, req: Request, res: Response, next: any) => {
        res.status(500).json({ error: err.message });
      });

      await request(app).get('/error');

      // Should still log incoming request
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          method: 'GET',
          path: '/error'
        })
      );
    });
  });
});
