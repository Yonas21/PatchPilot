import { Evaluations } from './Evaluations';
import { ReleaseReview } from './release/ReleaseReview';
import { useState, type ComponentProps } from 'react';
import { Tasks } from './Tasks';
import { Workbench } from './Workbench';

export function Remediation(props: ComponentProps<typeof Tasks>) {
  const [tab, setTab] = useState<'plans' | 'tasks' | 'release' | 'evaluations'>('plans');
  return (
    <>
      <div className="workbench-tabs" aria-label="Remediation views">
        <button
          className={tab === 'plans' ? 'selected' : ''}
          aria-pressed={tab === 'plans'}
          onClick={() => setTab('plans')}
        >
          Plans & verification
        </button>
        <button
          className={tab === 'tasks' ? 'selected' : ''}
          aria-pressed={tab === 'tasks'}
          onClick={() => setTab('tasks')}
        >
          Individual tasks ({props.data.tickets.length})
        </button>
        <button
          className={tab === 'release' ? 'selected' : ''}
          aria-pressed={tab === 'release'}
          onClick={() => setTab('release')}
        >
          Release review
        </button>
        <button
          className={tab === 'evaluations' ? 'selected' : ''}
          aria-pressed={tab === 'evaluations'}
          onClick={() => setTab('evaluations')}
        >
          Agent evaluations
        </button>
      </div>
      {tab === 'plans' ? (
        <Workbench data={props.data} refreshParent={() => props.run(async () => {})} />
      ) : tab === 'evaluations' ? (
        <Evaluations />
      ) : tab === 'release' ? (
        <ReleaseReview data={props.data} />
      ) : (
        <Tasks {...props} />
      )}
    </>
  );
}
