"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const todos_repository_1 = require("../db/todos-repository");
const auth_1 = require("../middleware/auth");
const rate_limiter_1 = require("../middleware/rate-limiter");
const error_handler_1 = require("../middleware/error-handler");
const async_handler_1 = require("../middleware/async-handler");
const validate_1 = require("../middleware/validate");
const todo_schemas_1 = require("../validation/todo-schemas");
const router = (0, express_1.Router)();
// Apply authentication to all routes
router.use(auth_1.authenticateApiKey);
// Apply rate limiting to all routes
router.use(rate_limiter_1.todoRateLimiter);
// POST /todos - Create a new todo
router.post('/', (0, validate_1.validate)(todo_schemas_1.createTodoSchema), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = {
        title: req.body.title,
        description: req.body.description
    };
    const todo = todos_repository_1.todoRepository.create(input);
    res.status(201).json(todo);
}));
// GET /todos - Get all todos
router.get('/', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const todos = todos_repository_1.todoRepository.findAll();
    res.json(todos);
}));
// GET /todos/:id - Get a specific todo
router.get('/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const todo = todos_repository_1.todoRepository.findById(id);
    if (!todo) {
        throw new error_handler_1.NotFoundError('Todo not found');
    }
    res.json(todo);
}));
// PUT /todos/:id - Update a todo
router.put('/:id', (0, validate_1.validate)(todo_schemas_1.updateTodoSchema), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const input = {
        ...(req.body.title !== undefined && { title: req.body.title }),
        ...(req.body.description !== undefined && { description: req.body.description }),
        ...(req.body.completed !== undefined && { completed: req.body.completed })
    };
    const todo = todos_repository_1.todoRepository.update(id, input);
    if (!todo) {
        throw new error_handler_1.NotFoundError('Todo not found');
    }
    res.json(todo);
}));
// DELETE /todos/:id - Delete a todo
router.delete('/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const deleted = todos_repository_1.todoRepository.delete(id);
    if (!deleted) {
        throw new error_handler_1.NotFoundError('Todo not found');
    }
    res.status(204).send();
}));
exports.default = router;
//# sourceMappingURL=todos.js.map