/**
 * Task Loader — Task file lifecycle management.
 *
 * Tasks live in ai/tasks/{status}/{id}.json
 * Moving a task = move file between status directories
 */
import fs from 'fs';
import path from 'path';
import { dirs } from './config';
import { Task, TaskStatus } from './types';

const STATUS_DIRS: TaskStatus[] = [
  'PENDING', 'PLANNING', 'RUNNING', 'DEVELOPER_DONE',
  'REVIEW', 'FIXING', 'PASS', 'DONE',
  'FAILED', 'ESCALATED', 'MANUAL_GATE',
];

/**
 * Load a task from any status directory by ID.
 */
export function loadTask(taskId: string): Task | null {
  for (const status of STATUS_DIRS) {
    const filePath = getTaskPath(taskId, status);
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Get the current status of a task by checking which directory it's in.
 */
export function getTaskStatus(taskId: string): TaskStatus | null {
  for (const status of STATUS_DIRS) {
    if (fs.existsSync(getTaskPath(taskId, status))) {
      return status;
    }
  }
  return null;
}

/**
 * Move a task to a new status directory.
 * Returns the updated task with new status.
 */
export function moveTask(task: Task, newStatus: TaskStatus): Task {
  const currentStatus = getTaskStatus(task.id);
  const oldPath = currentStatus ? getTaskPath(task.id, currentStatus) : null;
  const newPath = getTaskPath(task.id, newStatus);

  // Ensure target directory exists
  const targetDir = path.dirname(newPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Update task status
  const updated: Task = { ...task, status: newStatus };

  // Write to new location
  fs.writeFileSync(newPath, JSON.stringify(updated, null, 2));

  // Remove from old location
  if (oldPath && oldPath !== newPath && fs.existsSync(oldPath)) {
    fs.unlinkSync(oldPath);
  }

  return updated;
}

/**
 * List all tasks in a given status directory.
 */
export function listTasksByStatus(status: TaskStatus): Task[] {
  const dir = path.join(dirs.tasks, status.toLowerCase());
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch {
      return null;
    }
  }).filter((t): t is Task => t !== null);
}

/**
 * List all pending tasks, sorted by priority.
 */
export function pendingTasks(): Task[] {
  const tasks = listTasksByStatus('PENDING');
  const priorityOrder: Record<string, number> = {
    'critical': 0, 'high': 1, 'medium': 2, 'low': 3,
  };
  return tasks.sort((a, b) =>
    (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99)
  );
}

/**
 * List all tasks across all statuses.
 */
export function allTasks(): Task[] {
  const result: Task[] = [];
  for (const status of STATUS_DIRS) {
    result.push(...listTasksByStatus(status));
  }
  return result;
}

/**
 * Delete a task file.
 */
export function deleteTask(taskId: string): boolean {
  const status = getTaskStatus(taskId);
  if (!status) return false;
  const filePath = getTaskPath(taskId, status);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Save a new task to pending directory.
 */
export function saveTask(task: Task): void {
  const filePath = getTaskPath(task.id, task.status || 'PENDING');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(task, null, 2));
}

/**
 * Get task status summary for planner context.
 */
export function taskStatusSummary(): { id: string; status: TaskStatus; priority: string; title: string }[] {
  return allTasks().map(t => ({
    id: t.id,
    status: t.status,
    priority: t.priority,
    title: t.title,
  }));
}

function getTaskPath(taskId: string, status: TaskStatus): string {
  return path.join(dirs.tasks, status.toLowerCase(), `${taskId}.json`);
}