import { useEffect, useState } from 'react';
import { ArrowLeft, Check, FileCheck2, Sparkles } from 'lucide-react';
import type { Ticket } from '../../shared/types';
import { api, post, dateTime } from '../api';
import { Badge, ExternalLink, Modal, Spinner } from './Shared';
import type { FindingRow } from './Overview';

export function FindingDetail({
  row,
  gemini,
  ticket,
  onClose,
  refresh,
}: {
  row: FindingRow;
  gemini: boolean;
  ticket?: Ticket;
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const { finding, scan, inventoryName } = row;
  const [mode, setMode] = useState<'evidence' | 'draft'>('evidence');
  const [draft, setDraft] = useState({ title: '', body: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(ticket);
  useEffect(() => {
    setSaved(ticket);
  }, [ticket]);
  async function analyze() {
    setBusy('analysis');
    setError('');
    try {
      await post(`/scans/${scan.id}/findings/${finding.key}/brief`);
      await refresh();
    } catch (error) {
      setError((error as Error).message);
      await refresh();
    } finally {
      setBusy('');
    }
  }
  async function prepare() {
    setBusy('draft');
    setError('');
    try {
      setDraft(await api(`/scans/${scan.id}/findings/${finding.key}/draft`));
      setMode('draft');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function approve() {
    setBusy('save');
    setError('');
    try {
      const created = await post<Ticket>('/tickets', {
        ...draft,
        scanId: scan.id,
        findingKey: finding.key,
        approved: true,
      });
      setSaved(created);
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <Modal
      wide
      title={mode === 'draft' ? 'Review remediation task' : finding.dependency.name}
      subtitle={
        mode === 'draft'
          ? 'Review the exact content before saving it to your local task board.'
          : `${inventoryName} · installed version ${finding.dependency.version}`
      }
      onClose={onClose}
    >
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {saved && mode === 'draft' ? (
        <div className="saved-task">
          <span className="success-icon">
            <Check size={28} />
          </span>
          <h3>Remediation task saved</h3>
          <p>{saved.title}</p>
          <p className="muted">Stored locally. No GitHub issue or external message was created.</p>
          <a className="button button-primary" href={`/api/tickets/${saved.id}/export`} download>
            Download Markdown task
          </a>
          <button className="text-button" onClick={() => setMode('evidence')}>
            Back to evidence
          </button>
        </div>
      ) : mode === 'draft' ? (
        <>
          <button className="text-button back-link" onClick={() => setMode('evidence')}>
            <ArrowLeft size={16} />
            Back to evidence
          </button>
          <label className="field">
            Task title
            <input
              maxLength={180}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label className="field">
            Task body <span className="optional">Markdown</span>
            <textarea
              className="draft-body"
              rows={16}
              maxLength={15000}
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
          </label>
          <div className="callout">
            <FileCheck2 size={19} />
            <p>
              This action saves an approved local task. You can export it for your issue tracker.
            </p>
          </div>
          <div className="modal-actions">
            <button className="button button-outline" onClick={() => setMode('evidence')}>
              Back
            </button>
            <button
              disabled={!!busy || draft.title.trim().length < 5 || draft.body.trim().length < 10}
              className="button button-primary"
              onClick={approve}
            >
              {busy === 'save' ? <Spinner label="Saving…" /> : 'Approve & save task'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="finding-meta">
            <Badge severity={finding.advisory.severity} />
            <span className="tag">{finding.dependency.dev ? 'Development' : 'Runtime'}</span>
            <code>{finding.advisory.id}</code>
          </div>
          <h3 className="advisory-title">{finding.advisory.summary}</h3>
          <p className="footnote">
            Published affected-version match. Application exploitability has not been verified.
          </p>
          {row.stale && (
            <div className="callout">
              <p>
                This evidence is from an earlier scan. The latest scan has not provided complete
                coverage to supersede it.
              </p>
            </div>
          )}
          <div className="ai-brief">
            <div className="ai-brief-heading">
              <h3>
                <Sparkles size={19} />
                Analyst brief
              </h3>
              <span className="tag">{finding.brief ? finding.brief.model : 'Gemini'}</span>
            </div>
            {finding.brief ? (
              <>
                <p>{finding.brief.summary}</p>
                <h4>Why it matters</h4>
                <p>{finding.brief.impact}</p>
                <h4>Recommended investigation</h4>
                <ol>
                  {finding.brief.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                <h4>What still needs checking</h4>
                <ul>
                  {finding.brief.uncertainties.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
                <p className="footnote">
                  Evidence: {finding.brief.evidenceIds.join(', ')} · Generated{' '}
                  {dateTime(finding.brief.createdAt)}
                </p>
              </>
            ) : (
              <>
                <p>
                  {gemini
                    ? 'Turn this advisory into a practical investigation plan grounded in the evidence below.'
                    : 'Add your Gemini key to .env to generate an AI brief. Advisory evidence and local tasks work without it.'}
                </p>
                {finding.briefError && <p className="error-text">{finding.briefError}</p>}
                <button
                  disabled={!!busy || !gemini}
                  className="button button-primary"
                  onClick={analyze}
                >
                  {busy === 'analysis' ? (
                    <Spinner label="Analyzing evidence…" />
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Generate AI brief
                    </>
                  )}
                </button>
              </>
            )}
          </div>
          <section className="detail-section">
            <h3>Advisory fix candidates</h3>
            {finding.advisory.fixedVersions.length ? (
              <>
                <div className="version-list">
                  {finding.advisory.fixedVersions.map((version) => (
                    <code key={version}>{version}</code>
                  ))}
                </div>
                <p className="footnote">
                  These may belong to different release branches. Confirm compatibility and test
                  before upgrading.
                </p>
              </>
            ) : (
              <p className="muted">No later fixed version is supplied in this advisory.</p>
            )}
          </section>
          <section className="detail-section">
            <h3>Source evidence</h3>
            <div className="source-links">
              {finding.advisory.references.slice(0, 5).map((url, index) => (
                <ExternalLink key={url} href={url}>
                  {index === 0
                    ? 'View full OSV advisory'
                    : `${new URL(url).hostname} · Reference ${index}`}
                </ExternalLink>
              ))}
            </div>
            <details>
              <summary>Read advisory details</summary>
              <p className="advisory-body">
                {finding.advisory.details || 'No additional description was supplied.'}
              </p>
            </details>
            <p className="footnote">
              Scan: {dateTime(scan.createdAt)}
              {scan.repositorySha ? ` · Commit ${scan.repositorySha.slice(0, 8)}` : ''}
            </p>
          </section>
          <div className="modal-actions">
            <span className="muted">You review. Your agent prepares.</span>
            <button
              className="button button-primary"
              disabled={!!busy}
              onClick={() => (saved ? setMode('draft') : void prepare())}
            >
              {busy === 'draft' ? (
                <Spinner />
              ) : (
                <>
                  <FileCheck2 size={17} />
                  {saved ? 'View saved task' : 'Prepare remediation task'}
                </>
              )}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
