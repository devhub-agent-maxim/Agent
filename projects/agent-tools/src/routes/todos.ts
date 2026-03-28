import { Router, Request, Response } from 'express';
import { CreateTodoInput, UpdateTodoInput } from '../models/todo';
import { todoRepository } from '../db/todos-repository';
import { authenticateApiKey } from '../middleware/auth';
import { todoRateLimiter } from '../middleware/rate-limiter';
import { NotFoundError } from '../middleware/error-handler';
import { asyncHandler } from '../middleware/async-handler';
import { validate } from '../middleware/validate';
import { createTodoSchema, updateTodoSchema } from '../validation/todo-schemas';

const router = Router();

// Apply authentication to all routes
router.use(authenticateApiKey);

// Apply rate limiting to all routes
router.use(todoRateLimiter);

// POST /todos - Create a new todo
router.post('/', validate(createTodoSchema), asyncHandler(async (req: Request, res: Response) => {
  const input: CreateTodoInput = {
    title: req.body.title,
    description: req.body.description
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
router.put('/:id', validate(updateTodoSchema), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const input: UpdateTodoInput = {
    ...(req.body.title !== undefined && { title: req.body.title }),
    ...(req.body.description !== undefined && { description: req.body.description }),
    ...(req.body.completed !== undefined && { completed: req.body.completed })
  };

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
