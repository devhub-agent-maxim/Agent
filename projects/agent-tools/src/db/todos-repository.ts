import { db, getNextIdCounter, incrementIdCounter, resetIdCounter } from './database';
import { Todo, CreateTodoInput, UpdateTodoInput } from '../models/todo';

interface TodoRow {
  id: string;
  title: string;
  description: string | null;
  completed: number;
  created_at: string;
}

export class TodoRepository {
  private rowToTodo(row: TodoRow): Todo {
    return {
      id: row.id,
      title: row.title,
      description: row.description || undefined,
      completed: row.completed === 1,
      createdAt: new Date(row.created_at)
    };
  }

  create(input: CreateTodoInput): Todo {
    const counter = getNextIdCounter();
    const id = `todo-${counter}`;
    incrementIdCounter();

    const createdAt = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO todos (id, title, description, completed, created_at)
      VALUES (?, ?, ?, 0, ?)
    `);

    stmt.run(id, input.title, input.description || null, createdAt);

    return {
      id,
      title: input.title,
      description: input.description,
      completed: false,
      createdAt: new Date(createdAt)
    };
  }

  findAll(): Todo[] {
    const stmt = db.prepare('SELECT * FROM todos ORDER BY created_at ASC');
    const rows = stmt.all() as TodoRow[];
    return rows.map(row => this.rowToTodo(row));
  }

  findById(id: string): Todo | undefined {
    const stmt = db.prepare('SELECT * FROM todos WHERE id = ?');
    const row = stmt.get(id) as TodoRow | undefined;
    return row ? this.rowToTodo(row) : undefined;
  }

  update(id: string, input: UpdateTodoInput): Todo | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    const updates: string[] = [];
    const values: any[] = [];

    if (input.title !== undefined) {
      updates.push('title = ?');
      values.push(input.title);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description || null);
    }
    if (input.completed !== undefined) {
      updates.push('completed = ?');
      values.push(input.completed ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  }

  delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM todos WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  clear(): void {
    db.prepare('DELETE FROM todos').run();
    resetIdCounter();
  }
}

export const todoRepository = new TodoRepository();
