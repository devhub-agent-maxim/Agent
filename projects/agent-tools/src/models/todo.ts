export interface Todo {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  createdAt: Date;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string;
  completed?: boolean;
}

// In-memory storage
class TodoStore {
  private todos: Map<string, Todo> = new Map();
  private idCounter: number = 1;

  create(input: CreateTodoInput): Todo {
    const id = `todo-${this.idCounter++}`;
    const todo: Todo = {
      id,
      title: input.title,
      description: input.description,
      completed: false,
      createdAt: new Date()
    };
    this.todos.set(id, todo);
    return todo;
  }

  findAll(): Todo[] {
    return Array.from(this.todos.values());
  }

  findById(id: string): Todo | undefined {
    return this.todos.get(id);
  }

  update(id: string, input: UpdateTodoInput): Todo | undefined {
    const todo = this.todos.get(id);
    if (!todo) return undefined;

    const updated: Todo = {
      ...todo,
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.completed !== undefined && { completed: input.completed })
    };

    this.todos.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.todos.delete(id);
  }

  clear(): void {
    this.todos.clear();
    this.idCounter = 1;
  }
}

export const todoStore = new TodoStore();
