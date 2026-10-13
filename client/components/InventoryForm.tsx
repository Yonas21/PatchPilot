import { useState, type FormEvent } from 'react';
import { FileJson, Github, Sparkles, Upload } from 'lucide-react';
import { post } from '../api';
import { Modal, Spinner } from './Shared';
import { parseRepositoryInput } from '../../shared/repository-input';

export function InventoryForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [source, setSource] = useState<'upload' | 'github' | 'demo'>('upload');
  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [repository, setRepository] = useState('');
  const [ref, setRef] = useState('HEAD');
  const [path, setPath] = useState('package-lock.json');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function updateRepository(value: string) {
    setRepository(value);
    try {
      const parsed = parseRepositoryInput(value, ref, path);
      if (/^https:\/\/github\.com\//i.test(value.trim())) {
        setRepository(`${parsed.owner}/${parsed.repo}`);
        setRef(parsed.ref);
        setPath(parsed.path);
      }
    } catch {
      // Keep incomplete input editable; report validation errors on submission.
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      let lockfile;
      if (source === 'upload') {
        if (!file) throw new Error('Choose an npm package-lock.json file.');
        if (file.size > 1024 * 1024) throw new Error('Choose a lockfile smaller than 1 MiB.');
        try {
          lockfile = JSON.parse(await file.text());
        } catch {
          throw new Error('This file is not valid JSON.');
        }
      }
      const parsedRepository =
        source === 'github' ? parseRepositoryInput(repository, ref, path) : undefined;
      await post('/inventories', {
        name:
          name ||
          (source === 'demo'
            ? 'Northstar API · demo'
            : parsedRepository
              ? `${parsedRepository.owner}/${parsedRepository.repo}`.slice(0, 100)
              : file?.name),
        context,
        source,
        lockfile,
        repository: parsedRepository,
      });
      await onCreated();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Add an inventory"
      subtitle="Give your analyst a precise picture of your dependencies."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="source-options">
          {[
            { value: 'upload', label: 'Upload lockfile', icon: FileJson },
            { value: 'github', label: 'Public GitHub', icon: Github },
            { value: 'demo', label: 'Try a demo', icon: Sparkles },
          ].map((option) => (
            <button
              type="button"
              key={option.value}
              className={source === option.value ? 'selected' : ''}
              aria-pressed={source === option.value}
              onClick={() => {
                setSource(option.value as typeof source);
                setError('');
              }}
            >
              <option.icon size={21} />
              {option.label}
            </button>
          ))}
        </div>
        <label className="field">
          Inventory name
          <input
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder={source === 'demo' ? 'Northstar API · demo' : 'e.g. Customer API'}
          />
        </label>
        {source === 'upload' && (
          <label className="file-drop">
            <Upload size={25} />
            <strong>{file?.name ?? 'Choose your package-lock.json'}</strong>
            <span>npm lockfile v1, v2 or v3 · up to 1 MiB / 2,000 package versions</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
        )}
        {source === 'github' && (
          <>
            <label className="field">
              Public repository
              <input
                required
                value={repository}
                onChange={(event) => setRepository(event.target.value)}
                onBlur={(event) => updateRepository(event.target.value)}
                placeholder="owner/repository or GitHub lockfile URL"
              />
            </label>
            <div className="form-columns">
              <label className="field">
                Branch or commit
                <input required value={ref} onChange={(event) => setRef(event.target.value)} />
              </label>
              <label className="field">
                Lockfile path
                <input required value={path} onChange={(event) => setPath(event.target.value)} />
              </label>
            </div>
            <p className="field-help">
              Paste a GitHub file link to fill the branch and path automatically. For branch names
              containing slashes, check these fields before importing. Public repositories only; the
              exact commit is recorded with each scan.
            </p>
          </>
        )}
        {source === 'demo' && (
          <div className="callout">
            <Sparkles size={20} />
            <div>
              <strong>Synthetic inventory. Real advisory data.</strong>
              <p>
                Six package versions, including older lodash, axios, and jsonwebtoken releases.
                Nothing is installed or executed.
              </p>
            </div>
          </div>
        )}
        <label className="field">
          Application context <span className="optional">Optional</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="e.g. A public Node.js API. Uses JWT sessions and handles user-supplied JSON."
          />
        </label>
        <p className="field-help">
          Use non-sensitive context. It is sent to Gemini with public advisory evidence when AI
          analysis runs.
        </p>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? <Spinner label="Importing…" /> : 'Import & scan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
