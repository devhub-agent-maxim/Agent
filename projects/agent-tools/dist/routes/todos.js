"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const todos_repository_1 = require("../db/todos-repository");
const auth_1 = require("../middleware/auth");
const rate_limiter_1 = require("../middleware/rate-limiter");
const error_handler_1 = require("../middleware/error-handler");
const async_handler_1 = require("../middleware/async-handler");
const router = (0, express_1.Router)();
// Apply authentication to all routes
router.use(auth_1.authenticateApiKey);
// Apply rate limiting to all routes
router.use(rate_limiter_1.todoRateLimiter);
// Validation helpers
const validateCreateInput = (body) => {
    if (!body.title || typeof body.title !== 'string') {
        throw new error_handler_1.ValidationError('Title is required and must be a string');
    }
    if (body.title.trim().length === 0) {
        throw new error_handler_1.ValidationError('Title cannot be empty');
    }
    if (body.title.length > 200) {
        throw new error_handler_1.ValidationError('Title cannot exceed 200 characters');
    }
    if (body.description !== undefined && typeof body.description !== 'string') {
        throw new error_handler_1.ValidationError('Description must be a string');
    }
    if (body.description && body.description.length > 1000) {
        throw new error_handler_1.ValidationError('Description cannot exceed 1000 characters');
    }
};
const validateUpdateInput = (body) => {
    if (Object.keys(body).length === 0) {
        throw new error_handler_1.ValidationError('At least one field must be provided for update');
    }
    if (body.title !== undefined) {
        if (typeof body.title !== 'string') {
            throw new error_handler_1.ValidationError('Title must be a string');
        }
        if (body.title.trim().length === 0) {
            throw new error_handler_1.ValidationError('Title cannot be empty');
        }
        if (body.title.length > 200) {
            throw new error_handler_1.ValidationError('Title cannot exceed 200 characters');
        }
    }
    if (body.description !== undefined && typeof body.description !== 'string') {
        throw new error_handler_1.ValidationError('Description must be a string');
    }
    if (body.description && body.description.length > 1000) {
        throw new error_handler_1.ValidationError('Description cannot exceed 1000 characters');
    }
    if (body.completed !== undefined && typeof body.completed !== 'boolean') {
        throw new error_handler_1.ValidationError('Completed must be a boolean');
    }
};
// POST /todos - Create a new todo
router.post('/', (0, async_handler_1.asyncHandler)(async (req, res) => {
    validateCreateInput(req.body);
    const input = {
        title: req.body.title.trim(),
        description: req.body.description?.trim()
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
router.put('/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    validateUpdateInput(req.body);
    const input = {};
    if (req.body.title !== undefined) {
        input.title = req.body.title.trim();
    }
    if (req.body.description !== undefined) {
        input.description = req.body.description.trim();
    }
    if (req.body.completed !== undefined) {
        input.completed = req.body.completed;
    }
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