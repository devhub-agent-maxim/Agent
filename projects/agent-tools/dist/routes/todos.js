"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const todo_1 = require("../models/todo");
const router = (0, express_1.Router)();
// Validation helpers
const validateCreateInput = (body) => {
    if (!body.title || typeof body.title !== 'string') {
        return { valid: false, error: 'Title is required and must be a string' };
    }
    if (body.title.trim().length === 0) {
        return { valid: false, error: 'Title cannot be empty' };
    }
    if (body.title.length > 200) {
        return { valid: false, error: 'Title cannot exceed 200 characters' };
    }
    if (body.description !== undefined && typeof body.description !== 'string') {
        return { valid: false, error: 'Description must be a string' };
    }
    if (body.description && body.description.length > 1000) {
        return { valid: false, error: 'Description cannot exceed 1000 characters' };
    }
    return { valid: true };
};
const validateUpdateInput = (body) => {
    if (Object.keys(body).length === 0) {
        return { valid: false, error: 'At least one field must be provided for update' };
    }
    if (body.title !== undefined) {
        if (typeof body.title !== 'string') {
            return { valid: false, error: 'Title must be a string' };
        }
        if (body.title.trim().length === 0) {
            return { valid: false, error: 'Title cannot be empty' };
        }
        if (body.title.length > 200) {
            return { valid: false, error: 'Title cannot exceed 200 characters' };
        }
    }
    if (body.description !== undefined && typeof body.description !== 'string') {
        return { valid: false, error: 'Description must be a string' };
    }
    if (body.description && body.description.length > 1000) {
        return { valid: false, error: 'Description cannot exceed 1000 characters' };
    }
    if (body.completed !== undefined && typeof body.completed !== 'boolean') {
        return { valid: false, error: 'Completed must be a boolean' };
    }
    return { valid: true };
};
// POST /todos - Create a new todo
router.post('/', (req, res) => {
    const validation = validateCreateInput(req.body);
    if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
    }
    const input = {
        title: req.body.title.trim(),
        description: req.body.description?.trim()
    };
    const todo = todo_1.todoStore.create(input);
    res.status(201).json(todo);
});
// GET /todos - Get all todos
router.get('/', (req, res) => {
    const todos = todo_1.todoStore.findAll();
    res.json(todos);
});
// GET /todos/:id - Get a specific todo
router.get('/:id', (req, res) => {
    const { id } = req.params;
    const todo = todo_1.todoStore.findById(id);
    if (!todo) {
        return res.status(404).json({ error: 'Todo not found' });
    }
    res.json(todo);
});
// PUT /todos/:id - Update a todo
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const validation = validateUpdateInput(req.body);
    if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
    }
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
    const todo = todo_1.todoStore.update(id, input);
    if (!todo) {
        return res.status(404).json({ error: 'Todo not found' });
    }
    res.json(todo);
});
// DELETE /todos/:id - Delete a todo
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const deleted = todo_1.todoStore.delete(id);
    if (!deleted) {
        return res.status(404).json({ error: 'Todo not found' });
    }
    res.status(204).send();
});
exports.default = router;
//# sourceMappingURL=todos.js.map