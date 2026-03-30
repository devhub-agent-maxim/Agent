import { getDatabase, saveDatabase } from './database';

export interface ScheduledTask {
  id: number;
  name: string;
  cron_expression: string;
  command: string;
  enabled: number;
  last_run: number | null;
  next_run: number | null;
  created_at: number;
}

export interface CreateScheduledTask {
  name: string;
  cron_expression: string;
  command: string;
  enabled?: number;
}

function rowToTask(row: any[]): ScheduledTask {
  return {
    id: row[0] as number,
    name: row[1] as string,
    cron_expression: row[2] as string,
    command: row[3] as string,
    enabled: row[4] as number,
    last_run: row[5] as number | null,
    next_run: row[6] as number | null,
    created_at: row[7] as number,
  };
}

export class SchedulesRepository {
  create(task: CreateScheduledTask): ScheduledTask {
    const db = getDatabase();
    db.run(
      `INSERT INTO scheduled_tasks (name, cron_expression, command, enabled) VALUES (?, ?, ?, ?)`,
      [task.name, task.cron_expression, task.command, task.enabled !== undefined ? task.enabled : 1]
    );

    // Get the last inserted row ID
    const result = db.exec('SELECT last_insert_rowid() as id');
    const lastId = result[0].values[0][0] as number;

    saveDatabase();
    return this.findById(lastId)!;
  }

  findAll(): ScheduledTask[] {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM scheduled_tasks ORDER BY id DESC');

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map(rowToTask);
  }

  findById(id: number): ScheduledTask | null {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM scheduled_tasks WHERE id = ?', [id]);

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    return rowToTask(result[0].values[0]);
  }

  findEnabled(): ScheduledTask[] {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM scheduled_tasks WHERE enabled = 1');

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map(rowToTask);
  }

  delete(id: number): boolean {
    const db = getDatabase();
    const initialCount = this.findAll().length;
    db.run('DELETE FROM scheduled_tasks WHERE id = ?', [id]);
    saveDatabase();
    const finalCount = this.findAll().length;
    return finalCount < initialCount;
  }

  updateLastRun(id: number, timestamp: number): void {
    const db = getDatabase();
    db.run('UPDATE scheduled_tasks SET last_run = ? WHERE id = ?', [timestamp, id]);
    saveDatabase();
  }

  updateNextRun(id: number, timestamp: number | null): void {
    const db = getDatabase();
    db.run('UPDATE scheduled_tasks SET next_run = ? WHERE id = ?', [timestamp, id]);
    saveDatabase();
  }

  setEnabled(id: number, enabled: boolean): boolean {
    const db = getDatabase();
    const initialTask = this.findById(id);
    if (!initialTask) {
      return false;
    }

    db.run('UPDATE scheduled_tasks SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
    saveDatabase();

    const updatedTask = this.findById(id);
    return updatedTask ? updatedTask.enabled === (enabled ? 1 : 0) : false;
  }
}
