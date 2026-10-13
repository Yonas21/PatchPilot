import { useState } from 'react';
import type { ReleasePolicy } from '../../../shared/release';

export function PolicyForm({
  policy,
  busy,
  onSave,
}: {
  policy: ReleasePolicy;
  busy: boolean;
  onSave: (policy: ReleasePolicy) => Promise<void>;
}) {
  const [draft, setDraft] = useState(policy);
  return (
    <details className="panel release-policy" open>
      <summary>Release criteria</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(draft);
        }}
      >
        <div className="release-columns">
          <label className="field">
            Block severities at or above
            <select
              value={draft.minimumSeverity}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  minimumSeverity: e.target.value as ReleasePolicy['minimumSeverity'],
                })
              }
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="moderate">Moderate</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="field">
            Maximum evidence age (hours)
            <input
              type="number"
              required
              min={1}
              max={168}
              value={draft.maxAgeHours}
              onChange={(e) => setDraft({ ...draft, maxAgeHours: Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="release-checkbox">
          <input
            type="checkbox"
            checked={draft.includeDevelopment}
            onChange={(e) => setDraft({ ...draft, includeDevelopment: e.target.checked })}
          />
          Include development dependencies
        </label>
        <label className="release-checkbox">
          <input
            type="checkbox"
            checked={draft.blockUnknown}
            onChange={(e) => setDraft({ ...draft, blockUnknown: e.target.checked })}
          />
          Block findings with unknown severity
        </label>
        <p className="muted">
          Complete coverage and current source evidence are always required. Changing criteria does
          not alter previous decisions.
        </p>
        <button className="button button-outline" disabled={busy}>
          Save release criteria
        </button>
      </form>
    </details>
  );
}
