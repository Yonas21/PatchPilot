import { Boxes, Github, Sparkles } from 'lucide-react';
import type { Dashboard } from '../../shared/types';
import { ExternalLink, Modal } from './Shared';

export function Settings({ data, onClose }: { data: Dashboard; onClose: () => void }) {
  return (
    <Modal
      title="Your integrations"
      subtitle="Two public data APIs. One AI key. Everything runs locally."
      onClose={onClose}
    >
      <div className="provider-card">
        <span className="provider-icon">
          <Boxes size={23} />
        </span>
        <div>
          <h3>OSV vulnerability database</h3>
          <p>Live exact-version advisory lookups. No key needed.</p>
        </div>
        <span className="tag tag-green">Public API</span>
      </div>
      <div className="provider-card">
        <span className="provider-icon">
          <Github size={23} />
        </span>
        <div>
          <h3>GitHub</h3>
          <p>Import public repository lockfiles. No write access.</p>
        </div>
        <span className="tag tag-green">Public API</span>
      </div>
      <div className="provider-card">
        <span className="provider-icon">
          <Sparkles size={23} />
        </span>
        <div>
          <h3>Gemini</h3>
          <p>{data.integrations.model}</p>
        </div>
        <span className={`tag ${data.integrations.gemini ? 'tag-green' : 'tag-amber'}`}>
          {data.integrations.gemini ? 'Key configured' : 'Key needed'}
        </span>
      </div>
      <div className="setup-guide">
        <h3>Connect your AI analyst</h3>
        <ol>
          <li>
            Create a free-tier API key in{' '}
            <ExternalLink href="https://aistudio.google.com/apikey">Google AI Studio</ExternalLink>.
          </li>
          <li>
            Open <code>.env</code> in this project's root folder.
          </li>
          <li>
            Add your key to <code>GEMINI_API_KEY=</code> and save.
          </li>
        </ol>
        <p>
          The app reads the key when you request analysis. No restart needed. A configured key is
          not proof that the API request will succeed.
        </p>
      </div>
      <div className="callout">
        <Sparkles size={18} />
        <p>
          With a key configured, every scan automatically analyzes its highest-priority finding.
          Other findings can be analyzed on demand. Public advisory data and non-sensitive context
          are sent to Gemini.
        </p>
      </div>
      <p className="footnote">
        Free-tier quota depends on your Google project. Gemini free-tier data may be used to improve
        Google's products. Keep confidential context out of this demo.
      </p>
      <div className="modal-actions">
        <button className="button button-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </Modal>
  );
}
