import { type HTMLAttributes } from 'react';
import type { RecoveryAction } from '../planner-recovery';

type Props = {
  actions: RecoveryAction[];
  onRetry: () => void;
  onApply: (action: RecoveryAction) => void;
};

export default function PlannerRecoveryPanel({ actions, onRetry, onApply }: Props) {
  return (
    <div
      className="planner-msg planner-recovery"
      role="region"
      aria-label="How to fix this walk"
      data-testid="panel-planner-recovery"
    >
      <h4>Can't build this walk yet?</h4>
      <p className="planner-note" data-testid="text-recovery-hint">
        Try one of these next steps before retrying:
      </p>
      <div className="recovery-actions">
        {actions.map((action) => (
          <button
            key={action.kind}
            type="button"
            className="chip button-secondary"
            onClick={() => onApply(action)}
            data-testid={`action-recovery-${action.kind}`}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div className="planner-actions">
        <button
          className="button-primary"
          onClick={onRetry}
          data-testid="button-planner-retry-recovery"
        >
          Try again with these settings
        </button>
      </div>
    </div>
  );
}
