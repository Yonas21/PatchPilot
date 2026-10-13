import { useEffect, useRef, type ReactNode } from 'react';
import { X, ShieldCheck, Search, ArrowUpRight, LoaderCircle } from 'lucide-react';
import type { Severity } from '../../shared/types';

export function Badge({ severity }: { severity: Severity }) {
  return (
    <span className={`badge severity-${severity}`}>
      <span className="badge-dot" />
      {severity === 'unknown' ? 'Needs review' : severity}
    </span>
  );
}

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onCancel={onClose}
      aria-labelledby="dialog-title"
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <p className="eyebrow">PATCHPILOT WORKSPACE</p>
          <h2 id="dialog-title">{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}

export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <ShieldCheck size={28} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Spinner({ label = 'Working…' }: { label?: string }) {
  return (
    <span className="inline">
      <LoaderCircle size={16} className="spin" />
      {label}
    </span>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-box">
      <Search size={17} />
      <span className="sr-only">{placeholder}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="text-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
