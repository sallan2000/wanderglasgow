import type { PlannerOptions, WalkPlanningError } from './walk-planner';
import { WalkOptimisationLimitError } from './efficient-walk-order';

export type RecoveryAction =
  | { kind: 'retry'; label: string; description?: string }
  | { kind: 'radius-up'; label: string }
  | { kind: 'radius-down'; label: string }
  | { kind: 'stops-down'; label: string }
  | { kind: 'switch-to-nearby'; label: string }
  | { kind: 'start-mylocation'; label: string };

/** How a failed plan may be repaired with a single change to the form. */
export interface RecoveryOptions {
  radii: readonly number[];
}

/**
 * Resolve, from a failed plan, the next steps that are actually available
 * given the visitor's current settings. Each action is a small concrete
 * change before retrying, so a routing failure hands the visitor a path
 * forward instead of a dead-end "try again".
 */
export function getRecoveryActions(
  error: WalkPlanningError,
  options: PlannerOptions,
  { radii }: RecoveryOptions,
): RecoveryAction[] {
  const actions: RecoveryAction[] = [];

  if (error instanceof WalkOptimisationLimitError) {
    actions.push({ kind: 'radius-down', label: 'Choose a smaller search radius' });
    actions.push({ kind: 'stops-down', label: 'Fewer stops' });
    return actions;
  }

  if (error.kind === 'empty') {
    if (radii.indexOf(options.radiusKm) < radii.length - 1) {
      actions.push({ kind: 'radius-up', label: 'Widen the search radius' });
    } else {
      actions.push({ kind: 'retry', label: 'Expand the search to the next radius' });
    }
    // "Include more categories" = drop the theme filter by switching to nearby.
    actions.push({ kind: 'switch-to-nearby', label: 'Try nearby instead' });
    actions.push({ kind: 'start-mylocation', label: 'Use this location as the start' });
    return actions;
  }

  if (error.message.includes('exceeded the distance limit')) {
    actions.push({ kind: 'stops-down', label: 'Try fewer stops' });
    actions.push({ kind: 'start-mylocation', label: 'Use a closer starting point' });
    return actions;
  }

  // Remaining planning errors (service, bad settings, unknown).
  actions.push({
    kind: 'retry',
    label: error.message.includes('service') ? 'Try again' : 'Check the settings and try again',
  });
  return actions;
}
