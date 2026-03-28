import request from 'supertest';
import app from '../src/index';
import { todoRepository } from '../src/db/todos-repository';
import { db, closeDatabase, initializeDatabase } from '../src/db/database';
import fs from 'fs';
import path from 'path';

describe('TODO Persistence', () => {
  beforeAll(() => {
    // Ensure database is initialized
    initializeDatabase();
  });

  beforeEach(() => {
    // Clear data before each test for isolation
    todoRepository.clear();
  });

  it('should persist todos after creating them', async () => {
    // Create a todo
    const response = await request(app)
      .post('/todos')
      .send({ title: 'Persist Test', description: 'Testing persistence' })
      .expect(201);

    const todoId = response.body.id;

    // Simulate restart by re-fetching from database
    const persisted = todoRepository.findById(todoId);

    expect(persisted).toBeDefined();
    expect(persisted?.title).toBe('Persist Test');
    expect(persisted?.description).toBe('Testing persistence');
    expect(persisted?.completed).toBe(false);
  });

  it('should persist multiple todos and retrieve them in order', async () => {
    // Create multiple todos
    await request(app).post('/todos').send({ title: 'First Todo' });
    await request(app).post('/todos').send({ title: 'Second Todo' });
    await request(app).post('/todos').send({ title: 'Third Todo' });

    // Retrieve all todos directly from repository
    const todos = todoRepository.findAll();

    expect(todos).toHaveLength(3);
    expect(todos[0].title).toBe('First Todo');
    expect(todos[1].title).toBe('Second Todo');
    expect(todos[2].title).toBe('Third Todo');
  });

  it('should persist todo updates', async () => {
    // Create a todo
    const created = await request(app)
      .post('/todos')
      .send({ title: 'Original Title', description: 'Original Description' })
      .expect(201);

    const todoId = created.body.id;

    // Update the todo
    await request(app)
      .put(`/todos/${todoId}`)
      .send({
        title: 'Updated Title',
        description: 'Updated Description',
        completed: true
      })
      .expect(200);

    // Retrieve directly from repository to verify persistence
    const persisted = todoRepository.findById(todoId);

    expect(persisted).toBeDefined();
    expect(persisted?.title).toBe('Updated Title');
    expect(persisted?.description).toBe('Updated Description');
    expect(persisted?.completed).toBe(true);
  });

  it('should persist todo deletions', async () => {
    // Create two todos
    const todo1 = await request(app)
      .post('/todos')
      .send({ title: 'Keep This' })
      .expect(201);

    const todo2 = await request(app)
      .post('/todos')
      .send({ title: 'Delete This' })
      .expect(201);

    // Delete the second todo
    await request(app)
      .delete(`/todos/${todo2.body.id}`)
      .expect(204);

    // Verify persistence by querying repository
    const remaining = todoRepository.findAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(todo1.body.id);
    expect(remaining[0].title).toBe('Keep This');

    const deleted = todoRepository.findById(todo2.body.id);
    expect(deleted).toBeUndefined();
  });

  it('should maintain ID counter across operations', async () => {
    // Create first todo
    const todo1 = await request(app)
      .post('/todos')
      .send({ title: 'Todo 1' })
      .expect(201);

    expect(todo1.body.id).toBe('todo-1');

    // Create second todo
    const todo2 = await request(app)
      .post('/todos')
      .send({ title: 'Todo 2' })
      .expect(201);

    expect(todo2.body.id).toBe('todo-2');

    // Delete first todo
    await request(app).delete(`/todos/${todo1.body.id}`).expect(204);

    // Create third todo - should get next ID, not reuse deleted one
    const todo3 = await request(app)
      .post('/todos')
      .send({ title: 'Todo 3' })
      .expect(201);

    expect(todo3.body.id).toBe('todo-3');

    // Verify all operations persisted correctly
    const allTodos = todoRepository.findAll();
    expect(allTodos).toHaveLength(2);
    expect(allTodos.map(t => t.id)).toEqual(['todo-2', 'todo-3']);
  });

  it('should handle empty descriptions correctly in persistence', async () => {
    // Create todo without description
    const response = await request(app)
      .post('/todos')
      .send({ title: 'No Description' })
      .expect(201);

    // Verify it persists correctly
    const persisted = todoRepository.findById(response.body.id);
    expect(persisted).toBeDefined();
    expect(persisted?.description).toBeUndefined();

    // Update to add description
    await request(app)
      .put(`/todos/${response.body.id}`)
      .send({ description: 'Added Description' })
      .expect(200);

    const updated = todoRepository.findById(response.body.id);
    expect(updated?.description).toBe('Added Description');
  });
});
