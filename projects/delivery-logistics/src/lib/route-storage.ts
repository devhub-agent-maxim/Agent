import { v4 as uuidv4 } from 'uuid';
import type { DriverRoute, MultiDriverPlan } from '../routes/multi-driver';

const STORAGE_PREFIX = 'routeflow_plan_';

export function saveRoute(plan: MultiDriverPlan): string {
  const id = uuidv4();
  try {
    localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(plan));
  } catch {
    // localStorage may be unavailable in SSR — silently ignore
  }
  return id;
}

export function getRoute(id: string): MultiDriverPlan | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as MultiDriverPlan;
  } catch {
    return null;
  }
}

export function getDriverRoute(planId: string, driverIndex: number): DriverRoute | null {
  const plan = getRoute(planId);
  if (!plan) return null;
  return plan.routes[driverIndex] ?? null;
}
