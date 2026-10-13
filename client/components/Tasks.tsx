import { PagedList } from './Pagination';
import { ArrowUpRight, CheckCheck, Download, FileCheck2 } from 'lucide-react';
import type { Dashboard } from '../../shared/types';
import { dateTime, patch, type RunAction } from '../api';
import { Empty } from './Shared';

export function Tasks({
  data,
  run,
  busy,
  onInspect,
}: {
  data: Dashboard;
  run: RunAction;
  busy: boolean;
  onInspect: (id: string) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TURN EVIDENCE INTO ACTION</p>
          <h1>Remediation</h1>
          <p className="page-description">
            Human-approved tasks, saved on your machine and ready to share.
          </p>
        </div>
        <span className="tag">
          <FileCheck2 size={14} />
          Local task board
        </span>
      </div>
      <div className="callout task-note">
        <FileCheck2 size={19} />
        <p>
          Tasks are stored locally. Export Markdown for your issue tracker. Marking a task done does
          not verify that a vulnerability is fixed.
        </p>
      </div>
      {!data.tickets.length ? (
        <section className="panel">
          <Empty
            title="A clear plan starts with a finding"
            description="Open a finding in the triage queue, prepare a remediation task, and review it before approval."
          />
        </section>
      ) : (
        <PagedList items={data.tickets} label="Tasks" size={10}>
          {(pageItems) => (
            <div className="task-list">
              {pageItems.map((ticket) => (
                <section className={`panel task-card ${ticket.status}`} key={ticket.id}>
                  <div className="task-card-main">
                    <span className={`task-state ${ticket.status}`}>
                      <CheckCheck size={20} />
                    </span>
                    <div>
                      <button className="task-title" onClick={() => onInspect(ticket.id)}>
                        {ticket.title}
                      </button>
                      <p>
                        {data.inventories.find((item) => item.id === ticket.inventoryId)?.name} ·
                        Approved {dateTime(ticket.createdAt)}
                      </p>
                    </div>
                    <span className={`tag ${ticket.status === 'done' ? 'tag-green' : ''}`}>
                      {ticket.status}
                    </span>
                  </div>
                  <div className="task-actions">
                    <button className="text-button" onClick={() => onInspect(ticket.id)}>
                      Read task
                      <ArrowUpRight size={15} />
                    </button>
                    <a
                      className="button button-outline"
                      href={`/api/tickets/${ticket.id}/export`}
                      download
                    >
                      <Download size={15} />
                      Export Markdown
                    </a>
                    <button
                      disabled={busy}
                      className="button button-primary"
                      onClick={() =>
                        void run(
                          () =>
                            patch(`/tickets/${ticket.id}`, {
                              status: ticket.status === 'done' ? 'open' : 'done',
                            }),
                          'Task updated',
                        )
                      }
                    >
                      {ticket.status === 'done' ? 'Reopen task' : 'Mark done'}
                    </button>
                  </div>
                </section>
              ))}
            </div>
          )}
        </PagedList>
      )}
    </>
  );
}
