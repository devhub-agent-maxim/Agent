import express, { Request, Response } from 'express';
import { SchedulesRepository } from '../db/schedules-repository';

const router = express.Router();
const repository = new SchedulesRepository();

// Validation helper for cron expressions
function isValidCronExpression(expression: string): boolean {
  // Basic cron validation: 5 or 6 fields separated by spaces
  // Format: second(optional) minute hour day month weekday
  const parts = expression.trim().split(/\s+/);
  return parts.length === 5 || parts.length === 6;
}

// POST /schedules - Create a new scheduled task
router.post('/', (req: Request, res: Response) => {
  const { name, cron_expression, command, enabled } = req.body;

  // Validation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Name is required and must be a non-empty string' });
    return;
  }

  if (!cron_expression || typeof cron_expression !== 'string') {
    res.status(400).json({ error: 'Cron expression is required and must be a string' });
    return;
  }

  if (!isValidCronExpression(cron_expression)) {
    res.status(400).json({ error: 'Invalid cron expression format' });
    return;
  }

  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    res.status(400).json({ error: 'Command is required and must be a non-empty string' });
    return;
  }

  if (enabled !== undefined && typeof enabled !== 'number' && typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'Enabled must be a boolean or number (0 or 1)' });
    return;
  }

  try {
    const enabledValue = enabled !== undefined ? (enabled ? 1 : 0) : 1;
    const task = repository.create({
      name: name.trim(),
      cron_expression: cron_expression.trim(),
      command: command.trim(),
      enabled: enabledValue,
    });

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create scheduled task' });
  }
});

// GET /schedules - List all scheduled tasks
router.get('/', (_req: Request, res: Response) => {
  try {
    const tasks = repository.findAll();
    res.json({ schedules: tasks, count: tasks.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve scheduled tasks' });
  }
});

// GET /schedules/:id - Get a specific scheduled task
router.get('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid schedule ID' });
    return;
  }

  try {
    const task = repository.findById(id);
    if (!task) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve scheduled task' });
  }
});

// DELETE /schedules/:id - Delete a scheduled task
router.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid schedule ID' });
    return;
  }

  try {
    const deleted = repository.delete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete scheduled task' });
  }
});

// PATCH /schedules/:id/toggle - Enable/disable a schedule
router.patch('/:id/toggle', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { enabled } = req.body;

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid schedule ID' });
    return;
  }

  if (typeof enabled !== 'boolean' && typeof enabled !== 'number') {
    res.status(400).json({ error: 'Enabled must be a boolean or number' });
    return;
  }

  try {
    const updated = repository.setEnabled(id, !!enabled);
    if (!updated) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    const task = repository.findById(id);
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update scheduled task' });
  }
});

export default router;
