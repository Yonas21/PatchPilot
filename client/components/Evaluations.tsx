import { PagedList } from './Pagination';
import { useState } from 'react';
import type { EvaluationReport } from '../../shared/evaluation';
import { api, dateTime } from '../api';

export function Evaluations() {
  const [report, setReport] = useState<EvaluationReport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true);
    setError('');
    try {
      setReport(await api<EvaluationReport>('/workbench/evaluations'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'patchpilot-evaluation.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel workbench-lab">
      <p className="eyebrow">MEASURE THE GUARDRAILS</p>
      <h1>Agent evaluations</h1>
      <p>
        Run synthetic scenarios through the same brief validator, scan comparison, and release
        evaluator used by PatchPilot.
      </p>
      <p className="muted">
        Deterministic guardrail checks—not a live Gemini benchmark. These results do not measure
        model accuracy, prompt-injection resistance, or application compatibility. No provider calls
        or inventory changes occur.
      </p>
      <div className="workbench-actions">
        <button className="button button-primary" disabled={busy} onClick={() => void run()}>
          {busy ? 'Running…' : 'Run evaluation suite'}
        </button>
        {report && (
          <button className="button button-outline" onClick={download}>
            Export results
          </button>
        )}
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {report && (
        <>
          <h2 role="status">
            {report.passed}/{report.total} scenarios passed
          </h2>
          <p className="muted">
            {report.suite} · {dateTime(report.executedAt)}
          </p>
          <PagedList
            items={report.results}
            label="Evaluation scenarios"
            size={10}
            key={report.executedAt}
          >
            {(pageItems) => (
              <div className="evaluation-grid">
                {pageItems.map((result) => (
                  <article className="impact-owner" key={result.id}>
                    <small>{result.category}</small>
                    <h3>{result.name}</h3>
                    <p>
                      <strong>{result.passed ? 'PASS' : 'FAIL'}</strong> · Expected:{' '}
                      {result.expected} · Actual: {result.actual}
                    </p>
                    {result.detail && <p className="error-text">{result.detail}</p>}
                  </article>
                ))}
              </div>
            )}
          </PagedList>
        </>
      )}
    </section>
  );
}
