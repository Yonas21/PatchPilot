import { Activity as ActivityIcon, Clock3, Sparkles } from 'lucide-react';
import type { Dashboard } from '../../shared/types';
import { dateTime } from '../api';
import { Empty } from './Shared';

export function ActivityLog({ data }: { data: Dashboard }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">NOTHING HAPPENS IN A BLACK BOX</p>
          <h1>Activity log</h1>
          <p className="page-description">
            Scans, AI analysis, approvals, and monitoring — all in one place.
          </p>
        </div>
      </div>
      <section className="panel">
        {data.activity.length ? (
          <div className="event-list">
            {data.activity.map((event) => (
              <article className="event-row" key={event.id}>
                <span className={`activity-symbol ${event.kind}`}>
                  {event.kind === 'ai' ? (
                    <Sparkles size={17} />
                  ) : event.kind === 'monitor' ? (
                    <Clock3 size={17} />
                  ) : (
                    <ActivityIcon size={17} />
                  )}
                </span>
                <div>
                  <h3>{event.title}</h3>
                  <p>{event.detail}</p>
                </div>
                <time>{dateTime(event.createdAt)}</time>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Your activity trail is ready"
            description="Add an inventory to start your first scan. Every meaningful action will be recorded here."
          />
        )}
      </section>
    </>
  );
}
