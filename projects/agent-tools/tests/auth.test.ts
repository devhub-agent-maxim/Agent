import request from 'supertest';
import app from '../src/index';
import { todoRepository } from '../src/db/todos-repository';

describe('API Key Authentication', () => {
  const VALID_API_KEY = 'test-key-123';
  const INVALID_API_KEY = 'invalid-key';

  beforeAll(() => {
    process.env.API_KEYS = VALID_API_KEY;
  });

  beforeEach(() => {
    // Clear all todos before each test
    const todos = todoRepository.findAll();
    todos.forEach(todo => todoRepository.delete(todo.id));
  });

  afterAll(() => {
    delete process.env.API_KEYS;
  });

  describe('Missing Authorization', () => {
    it('should return 401 when no authorization header is provided', async () => {
      const response = await request(app)
        .get('/todos')
        .expect(401);

      expect(response.body).toEqual({ error: 'Missing authorization header' });
    });

    it('should return 401 when authorization header is malformed', async () => {
      const response = await request(app)
        .get('/todos')
        .set('Authorization', 'InvalidFormat')
        .expect(401);

      expect(response.body).toEqual({
        error: 'Invalid authorization header format. Expected: Bearer <token>'
      });
    });
  });

  describe('Invalid API Key', () => {
    it('should return 403 when API key is invalid', async () => {
      const response = await request(app)
        .get('/todos')
        .set('Authorization', `Bearer ${INVALID_API_KEY}`)
        .expect(403);

      expect(response.body).toEqual({ error: 'Invalid API key' });
    });
  });

  describe('Valid API Key', () => {
    it('should allow access when valid API key is provided', async () => {
      const response = await request(app)
        .get('/todos')
        .set('Authorization', `Bearer ${VALID_API_KEY}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should allow creating a todo with valid API key', async () => {
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${VALID_API_KEY}`)
        .send({ title: 'Test Todo' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('Test Todo');
    });
  });

  describe('Public Routes', () => {
    it('should allow access to /health without authentication', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('uptime');
    });
  });
});
