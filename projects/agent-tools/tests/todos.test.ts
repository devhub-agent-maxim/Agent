import request from 'supertest';
import app from '../src/index';
import { todoRepository } from '../src/db/todos-repository';

describe('TODO API', () => {
  beforeEach(() => {
    // Clear the repository before each test
    todoRepository.clear();
  });

  describe('POST /todos', () => {
    it('should create a new todo with valid input', async () => {
      const response = await request(app)
        .post('/todos')
        .send({ title: 'Test Todo', description: 'Test Description' })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        title: 'Test Todo',
        description: 'Test Description',
        completed: false,
        createdAt: expect.any(String)
      });
    });

    it('should create a todo without description', async () => {
      const response = await request(app)
        .post('/todos')
        .send({ title: 'Test Todo' })
        .expect(201);

      expect(response.body).toMatchObject({
        title: 'Test Todo',
        completed: false
      });
      expect(response.body.description).toBeUndefined();
    });

    it('should trim whitespace from title and description', async () => {
      const response = await request(app)
        .post('/todos')
        .send({ title: '  Trimmed  ', description: '  Also trimmed  ' })
        .expect(201);

      expect(response.body.title).toBe('Trimmed');
      expect(response.body.description).toBe('Also trimmed');
    });

    it('should reject request without title', async () => {
      const response = await request(app)
        .post('/todos')
        .send({ description: 'No title' })
        .expect(400);

      expect(response.body.error).toBe('Title is required and must be a string');
    });

    it('should reject request with empty title', async () => {
      const response = await request(app)
        .post('/todos')
        .send({ title: '   ' })
        .expect(400);

      expect(response.body.error).toBe('Title cannot be empty');
    });

    it('should reject request with non-string title', async () => {
      const response = await request(app)
        .post('/todos')
        .send({ title: 123 })
        .expect(400);

      expect(response.body.error).toBe('Title is required and must be a string');
    });

    it('should reject title exceeding 200 characters', async () => {
      const longTitle = 'a'.repeat(201);
      const response = await request(app)
        .post('/todos')
        .send({ title: longTitle })
        .expect(400);

      expect(response.body.error).toBe('Title cannot exceed 200 characters');
    });

    it('should reject non-string description', async () => {
      const response = await request(app)
        .post('/todos')
        .send({ title: 'Valid Title', description: 123 })
        .expect(400);

      expect(response.body.error).toBe('Description must be a string');
    });

    it('should reject description exceeding 1000 characters', async () => {
      const longDesc = 'a'.repeat(1001);
      const response = await request(app)
        .post('/todos')
        .send({ title: 'Valid Title', description: longDesc })
        .expect(400);

      expect(response.body.error).toBe('Description cannot exceed 1000 characters');
    });
  });

  describe('GET /todos', () => {
    it('should return empty array when no todos exist', async () => {
      const response = await request(app)
        .get('/todos')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return all todos', async () => {
      // Create some todos
      await request(app).post('/todos').send({ title: 'Todo 1' });
      await request(app).post('/todos').send({ title: 'Todo 2' });
      await request(app).post('/todos').send({ title: 'Todo 3' });

      const response = await request(app)
        .get('/todos')
        .expect(200);

      expect(response.body).toHaveLength(3);
      expect(response.body[0].title).toBe('Todo 1');
      expect(response.body[1].title).toBe('Todo 2');
      expect(response.body[2].title).toBe('Todo 3');
    });
  });

  describe('GET /todos/:id', () => {
    it('should return a specific todo by id', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Specific Todo', description: 'Find me' });

      const response = await request(app)
        .get(`/todos/${created.body.id}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: created.body.id,
        title: 'Specific Todo',
        description: 'Find me',
        completed: false
      });
    });

    it('should return 404 for non-existent todo', async () => {
      const response = await request(app)
        .get('/todos/non-existent-id')
        .expect(404);

      expect(response.body.error).toBe('Todo not found');
    });
  });

  describe('PUT /todos/:id', () => {
    it('should update todo title', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Original Title' });

      const response = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      expect(response.body.title).toBe('Updated Title');
      expect(response.body.id).toBe(created.body.id);
    });

    it('should update todo description', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Test', description: 'Original' });

      const response = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({ description: 'Updated' })
        .expect(200);

      expect(response.body.description).toBe('Updated');
      expect(response.body.title).toBe('Test');
    });

    it('should update todo completed status', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Test' });

      const response = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({ completed: true })
        .expect(200);

      expect(response.body.completed).toBe(true);
    });

    it('should update multiple fields at once', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Original', description: 'Original desc' });

      const response = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({
          title: 'New Title',
          description: 'New Description',
          completed: true
        })
        .expect(200);

      expect(response.body).toMatchObject({
        title: 'New Title',
        description: 'New Description',
        completed: true
      });
    });

    it('should trim whitespace from updated values', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Test' });

      const response = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({ title: '  Trimmed  ', description: '  Also trimmed  ' })
        .expect(200);

      expect(response.body.title).toBe('Trimmed');
      expect(response.body.description).toBe('Also trimmed');
    });

    it('should return 404 for non-existent todo', async () => {
      const response = await request(app)
        .put('/todos/non-existent-id')
        .send({ title: 'Updated' })
        .expect(404);

      expect(response.body.error).toBe('Todo not found');
    });

    it('should reject update with no fields', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Test' });

      const response = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('At least one field must be provided for update');
    });

    it('should reject empty title', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Test' });

      const response = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({ title: '   ' })
        .expect(400);

      expect(response.body.error).toBe('Title cannot be empty');
    });

    it('should reject non-string title', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Test' });

      const response = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({ title: 123 })
        .expect(400);

      expect(response.body.error).toBe('Title must be a string');
    });

    it('should reject title exceeding 200 characters', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Test' });

      const longTitle = 'a'.repeat(201);
      const response = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({ title: longTitle })
        .expect(400);

      expect(response.body.error).toBe('Title cannot exceed 200 characters');
    });

    it('should reject non-string description', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Test' });

      const response = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({ description: 123 })
        .expect(400);

      expect(response.body.error).toBe('Description must be a string');
    });

    it('should reject description exceeding 1000 characters', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Test' });

      const longDesc = 'a'.repeat(1001);
      const response = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({ description: longDesc })
        .expect(400);

      expect(response.body.error).toBe('Description cannot exceed 1000 characters');
    });

    it('should reject non-boolean completed', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Test' });

      const response = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({ completed: 'true' })
        .expect(400);

      expect(response.body.error).toBe('Completed must be a boolean');
    });
  });

  describe('DELETE /todos/:id', () => {
    it('should delete an existing todo', async () => {
      const created = await request(app)
        .post('/todos')
        .send({ title: 'To Delete' });

      await request(app)
        .delete(`/todos/${created.body.id}`)
        .expect(204);

      // Verify it's deleted
      await request(app)
        .get(`/todos/${created.body.id}`)
        .expect(404);
    });

    it('should return 404 for non-existent todo', async () => {
      const response = await request(app)
        .delete('/todos/non-existent-id')
        .expect(404);

      expect(response.body.error).toBe('Todo not found');
    });

    it('should not affect other todos when deleting one', async () => {
      const todo1 = await request(app).post('/todos').send({ title: 'Todo 1' });
      const todo2 = await request(app).post('/todos').send({ title: 'Todo 2' });
      const todo3 = await request(app).post('/todos').send({ title: 'Todo 3' });

      await request(app).delete(`/todos/${todo2.body.id}`).expect(204);

      const remaining = await request(app).get('/todos').expect(200);
      expect(remaining.body).toHaveLength(2);
      expect(remaining.body.map((t: any) => t.id)).toEqual([
        todo1.body.id,
        todo3.body.id
      ]);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete CRUD lifecycle', async () => {
      // Create
      const created = await request(app)
        .post('/todos')
        .send({ title: 'Lifecycle Test', description: 'Testing CRUD' })
        .expect(201);

      expect(created.body.completed).toBe(false);

      // Read single
      const fetched = await request(app)
        .get(`/todos/${created.body.id}`)
        .expect(200);

      expect(fetched.body.title).toBe('Lifecycle Test');

      // Update
      const updated = await request(app)
        .put(`/todos/${created.body.id}`)
        .send({ completed: true, description: 'Updated description' })
        .expect(200);

      expect(updated.body.completed).toBe(true);
      expect(updated.body.description).toBe('Updated description');

      // Read list
      const list = await request(app).get('/todos').expect(200);
      expect(list.body).toHaveLength(1);

      // Delete
      await request(app)
        .delete(`/todos/${created.body.id}`)
        .expect(204);

      // Verify deletion
      await request(app)
        .get(`/todos/${created.body.id}`)
        .expect(404);
    });

    it('should handle multiple todos independently', async () => {
      const todo1 = await request(app)
        .post('/todos')
        .send({ title: 'First' });

      const todo2 = await request(app)
        .post('/todos')
        .send({ title: 'Second' });

      // Update only first
      await request(app)
        .put(`/todos/${todo1.body.id}`)
        .send({ completed: true });

      // Verify second is unchanged
      const fetchedTodo2 = await request(app)
        .get(`/todos/${todo2.body.id}`)
        .expect(200);

      expect(fetchedTodo2.body.completed).toBe(false);
    });
  });

  describe('API Documentation', () => {
    it('should serve Swagger UI at /api-docs', async () => {
      const response = await request(app)
        .get('/api-docs/')
        .expect(200);

      expect(response.text).toContain('swagger-ui');
    });
  });
});
