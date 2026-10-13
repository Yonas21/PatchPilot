import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Finding, Ticket } from '../shared/types.js';
import type { Store } from './store.js';

export const ticketSchema = z.object({
  inventoryId: z.string().min(1),
  scanId: z.string().min(1),
  findingKey: z.string().min(1),
  title: z.string().trim().min(5).max(180),
  body: z.string().trim().min(10).max(15_000),
});

export function draftTicket(finding: Finding) {
  const { dependency, advisory, brief } = finding;
  return {
    title: `Review ${dependency.name}@${dependency.version}: ${advisory.summary}`.slice(0, 180),
    body: [
      `## Dependency\n${dependency.name}@${dependency.version} (${dependency.dev ? 'development' : 'runtime'})`,
      `## Evidence\n${advisory.id} — ${advisory.summary}\nSource severity: ${advisory.severity}\n${advisory.references.join('\n')}`,
      `## Assessment\n${brief?.summary ?? 'Published affected-version match. Application reachability has not been established.'}`,
      `## Next steps\n${(brief?.steps ?? ['Inspect use of the affected package and the advisory prerequisites.', 'Evaluate a compatible patched version or mitigation.', 'Run regression tests and rescan the updated lockfile.']).map((step) => `- [ ] ${step}`).join('\n')}`,
      `## Uncertainty\n${(brief?.uncertainties ?? ['A dependency match does not establish exploitability.', 'Compatibility of any upgrade must be checked by an engineer.']).join('\n')}`,
      advisory.fixedVersions.length
        ? `## Advisory fix candidates\n${advisory.fixedVersions.join(', ')}\nThese may belong to different release branches; verify applicability.`
        : '## Fix availability\nNo later fixed version was supplied in the advisory evidence.',
      `\nPrepared by PatchPilot. ${brief ? `AI model: ${brief.model}.` : 'Evidence template; no AI analysis used.'}`,
    ].join('\n\n'),
  };
}

export function approveTicket(store: Store, input: z.infer<typeof ticketSchema>): Ticket {
  const data = ticketSchema.parse(input);
  const existing = store
    .list('tickets')
    .find(
      (ticket) => ticket.inventoryId === data.inventoryId && ticket.findingKey === data.findingKey,
    );
  if (existing) return existing;
  const now = new Date().toISOString();
  const ticket: Ticket = {
    ...data,
    id: randomUUID(),
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
  store.put('tickets', ticket);
  store.event('ticket', 'Remediation task approved', ticket.title);
  return ticket;
}
