"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.todoStore = void 0;
// In-memory storage
class TodoStore {
    constructor() {
        this.todos = new Map();
        this.idCounter = 1;
    }
    create(input) {
        const id = `todo-${this.idCounter++}`;
        const todo = {
            id,
            title: input.title,
            description: input.description,
            completed: false,
            createdAt: new Date()
        };
        this.todos.set(id, todo);
        return todo;
    }
    findAll() {
        return Array.from(this.todos.values());
    }
    findById(id) {
        return this.todos.get(id);
    }
    update(id, input) {
        const todo = this.todos.get(id);
        if (!todo)
            return undefined;
        const updated = {
            ...todo,
            ...(input.title !== undefined && { title: input.title }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.completed !== undefined && { completed: input.completed })
        };
        this.todos.set(id, updated);
        return updated;
    }
    delete(id) {
        return this.todos.delete(id);
    }
    clear() {
        this.todos.clear();
        this.idCounter = 1;
    }
}
exports.todoStore = new TodoStore();
//# sourceMappingURL=todo.js.map