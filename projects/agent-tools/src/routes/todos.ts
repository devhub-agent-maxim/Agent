import { Router, Request, Response } from 'express';
import { CreateTodoInput, UpdateTodoInput } from '../models/todo';
import { todoRepository } from '../db/todos-repository';
import { authenticateApiKey } from '../middleware/auth';
import { todoRateLimiter } from '../middleware/rate-limiter';
import { ValidationError, NotFoundError } from '../middleware/error-handler';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

// Apply authentication to all routes
router.use(authenticateApiKey);

// Apply rate limiting to all routes
router.use(todoRateLimiter);

// Validation helpers
const validateCreateInput = (body: any): void => {
  if (!body.title || typeof body.title !== 'string') {
    throw new ValidationError('Title is required and must be a string');
  }
  if (body.title.trim().length === 0) {
    throw new ValidationError('Title cannot be empty');
  }
  if (body.title.length > 200) {
    throw new ValidationError('Title cannot exceed 200 characters');
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    throw new ValidationError('Description must be a string');
  }
  if (body.description && body.description.length > 1000) {
    throw new ValidationError('Description cannot exceed 1000 characters');
  }
};

const validateUpdateInput = (body: any): void => {
  if (Object.keys(body).length === 0) {
    throw new ValidationError('At least one field must be provided for update');
  }
  if (body.title !== undefined) {
    if (typeof body.title !== 'string') {
      throw new ValidationError('Title must be a string');
    }
    if (body.title.trim().length === 0) {
      throw new ValidationError('Title cannot be empty');
    }
    if (body.title.length > 200) {
      throw new ValidationError('Title cannot exceed 200 characters');
    }
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    throw new ValidationError('Description must be a string');
  }
  if (body.description && body.description.length > 1000) {
    throw new ValidationError('Description cannot exceed 1000 characters');
  }
  if (body.completed !== undefined && typeof body.completed !== 'boolean') {
    throw new ValidationError('Completed must be a boolean');
  }
};

// POST /todos - Create a new todo
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  validateCreateInput(req.body);

  const input: CreateTodoInput = {
    title: req.body.title.trim(),
    description: req.body.description?.trim()
  };

  const todo = todoRepository.create(input);
  res.status(201).json(todo);
}));

// GET /todos - Get all todos
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const todos = todoRepository.findAll();
  res.json(todos);
}));

// GET /todos/:id - Get a specific todo
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const todo = todoRepository.findById(id);

  if (!todo) {
    throw new NotFoundError('Todo not found');
  }

  res.json(todo);
}));

// PUT /todos/:id - Update a todo
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  validateUpdateInput(req.body);

  const input: UpdateTodoInput = {};
  if (req.body.title !== undefined) {
    input.title = req.body.title.trim();
  }
  if (req.body.description !== undefined) {
    input.description = req.body.description.trim();
  }
  if (req.body.completed !== undefined) {
    input.completed = req.body.completed;
  }

  const todo = todoRepository.update(id, input);

  if (!todo) {
    throw new NotFoundError('Todo not found');
  }

  res.json(todo);
}));

// DELETE /todos/:id - Delete a todo
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = todoRepository.delete(id);

  if (!deleted) {
    throw new NotFoundError('Todo not found');
  }

  res.status(204).send();
}));

export default router;
