import request from 'supertest';
import app from '../src/index';
import { todoRepository } from '../src/db/todos-repository';

const API_KEY = 'test-api-key-12345';

describe('Todo Validation', () => {
  beforeAll(() => {
    // Set up API keys for authentication
    process.env.API_KEYS = API_KEY;
  });

  beforeEach(() => {
    // Clear database before each test
    todoRepository.clear();
  });

  afterAll(() => {
    // Clean up environment
    delete process.env.API_KEYS;
  });

  describe('POST /todos - Create Todo Validation', () => {
    it('should accept valid todo with title only', async () => {
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ title: 'Valid Todo' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('Valid Todo');
      expect(response.body.completed).toBe(false);
    });

    it('should accept valid todo with title and description', async () => {
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          title: 'Todo with Description',
          description: 'This is a detailed description'
        })
        .expect(201);

      expect(response.body.title).toBe('Todo with Description');
      expect(response.body.description).toBe('This is a detailed description');
    });

    it('should trim whitespace from title and description', async () => {
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          title: '  Trimmed Title  ',
          description: '  Trimmed Description  '
        })
        .expect(201);

      expect(response.body.title).toBe('Trimmed Title');
      expect(response.body.description).toBe('Trimmed Description');
    });

    it('should reject todo without title', async () => {
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ description: 'Missing title' })
        .expect(400);

      expect(response.body.error).toContain('Title is required');
      expect(response.body.message).toContain('Title is required');
    });

    it('should reject todo with empty title', async () => {
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ title: '' })
        .expect(400);

      expect(response.body.error).toContain('Title cannot be empty');
      expect(response.body.message).toContain('Title cannot be empty');
    });

    it('should reject todo with title exceeding 200 characters', async () => {
      const longTitle = 'a'.repeat(201);
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ title: longTitle })
        .expect(400);

      expect(response.body.error).toContain('Title cannot exceed 200 characters');
      expect(response.body.message).toContain('Title cannot exceed 200 characters');
    });

    it('should accept title at 200 character boundary', async () => {
      const maxTitle = 'a'.repeat(200);
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ title: maxTitle })
        .expect(201);

      expect(response.body.title).toBe(maxTitle);
    });

    it('should reject todo with description exceeding 1000 characters', async () => {
      const longDescription = 'a'.repeat(1001);
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          title: 'Valid Title',
          description: longDescription
        })
        .expect(400);

      expect(response.body.error).toContain('Description cannot exceed 1000 characters');
      expect(response.body.message).toContain('Description cannot exceed 1000 characters');
    });

    it('should accept description at 1000 character boundary', async () => {
      const maxDescription = 'a'.repeat(1000);
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          title: 'Valid Title',
          description: maxDescription
        })
        .expect(201);

      expect(response.body.description).toBe(maxDescription);
    });

    it('should reject todo with non-string title', async () => {
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ title: 12345 })
        .expect(400);

      expect(response.body.error).toContain('Title must be a string');
      expect(response.body.message).toContain('Title must be a string');
    });

    it('should reject todo with non-string description', async () => {
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          title: 'Valid Title',
          description: 12345
        })
        .expect(400);

      expect(response.body.error).toContain('Description must be a string');
      expect(response.body.message).toContain('Description must be a string');
    });

    it('should reject todo with non-boolean completed field', async () => {
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          title: 'Valid Title',
          completed: 'yes'
        })
        .expect(400);

      expect(response.body.error).toContain('Completed must be a boolean');
      expect(response.body.message).toContain('Completed must be a boolean');
    });

    it('should strip unknown fields from request', async () => {
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          title: 'Valid Todo',
          unknownField: 'should be removed',
          anotherUnknown: 123
        })
        .expect(201);

      expect(response.body).not.toHaveProperty('unknownField');
      expect(response.body).not.toHaveProperty('anotherUnknown');
      expect(response.body.title).toBe('Valid Todo');
    });
  });

  describe('PUT /todos/:id - Update Todo Validation', () => {
    let todoId: string;

    beforeEach(async () => {
      // Create a todo for update tests
      const response = await request(app)
        .post('/todos')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ title: 'Original Todo' });
      todoId = response.body.id;
    });

    it('should accept valid title update', async () => {
      const response = await request(app)
        .put(`/todos/${todoId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      expect(response.body.title).toBe('Updated Title');
    });

    it('should accept valid description update', async () => {
      const response = await request(app)
        .put(`/todos/${todoId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ description: 'New description' })
        .expect(200);

      expect(response.body.description).toBe('New description');
    });

    it('should accept valid completed status update', async () => {
      const response = await request(app)
        .put(`/todos/${todoId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ completed: true })
        .expect(200);

      expect(response.body.completed).toBe(true);
    });

    it('should accept multiple fields update', async () => {
      const response = await request(app)
        .put(`/todos/${todoId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          title: 'Multi Update',
          description: 'Updated description',
          completed: true
        })
        .expect(200);

      expect(response.body.title).toBe('Multi Update');
      expect(response.body.description).toBe('Updated description');
      expect(response.body.completed).toBe(true);
    });

    it('should reject update with no fields', async () => {
      const response = await request(app)
        .put(`/todos/${todoId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({})
        .expect(400);

      expect(response.body.error).toContain('At least one field must be provided for update');
      expect(response.body.message).toContain('At least one field must be provided for update');
    });

    it('should reject update with empty title', async () => {
      const response = await request(app)
        .put(`/todos/${todoId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ title: '' })
        .expect(400);

      expect(response.body.error).toContain('Title cannot be empty');
      expect(response.body.message).toContain('Title cannot be empty');
    });

    it('should reject update with title exceeding 200 characters', async () => {
      const longTitle = 'a'.repeat(201);
      const response = await request(app)
        .put(`/todos/${todoId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ title: longTitle })
        .expect(400);

      expect(response.body.error).toContain('Title cannot exceed 200 characters');
      expect(response.body.message).toContain('Title cannot exceed 200 characters');
    });

    it('should reject update with description exceeding 1000 characters', async () => {
      const longDescription = 'a'.repeat(1001);
      const response = await request(app)
        .put(`/todos/${todoId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ description: longDescription })
        .expect(400);

      expect(response.body.error).toContain('Description cannot exceed 1000 characters');
      expect(response.body.message).toContain('Description cannot exceed 1000 characters');
    });

    it('should reject update with non-boolean completed field', async () => {
      const response = await request(app)
        .put(`/todos/${todoId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({ completed: 'true' })
        .expect(400);

      expect(response.body.error).toContain('Completed must be a boolean');
      expect(response.body.message).toContain('Completed must be a boolean');
    });

    it('should strip unknown fields from update request', async () => {
      const response = await request(app)
        .put(`/todos/${todoId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          title: 'Updated',
          unknownField: 'should be removed'
        })
        .expect(200);

      expect(response.body).not.toHaveProperty('unknownField');
      expect(response.body.title).toBe('Updated');
    });

    it('should trim whitespace from updated fields', async () => {
      const response = await request(app)
        .put(`/todos/${todoId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          title: '  Trimmed Update  ',
          description: '  Trimmed Desc  '
        })
        .expect(200);

      expect(response.body.title).toBe('Trimmed Update');
      expect(response.body.description).toBe('Trimmed Desc');
    });
  });
});
