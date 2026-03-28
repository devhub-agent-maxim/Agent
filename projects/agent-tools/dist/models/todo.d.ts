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
declare class TodoStore {
    private todos;
    private idCounter;
    create(input: CreateTodoInput): Todo;
    findAll(): Todo[];
    findById(id: string): Todo | undefined;
    update(id: string, input: UpdateTodoInput): Todo | undefined;
    delete(id: string): boolean;
    clear(): void;
}
export declare const todoStore: TodoStore;
export {};
//# sourceMappingURL=todo.d.ts.map