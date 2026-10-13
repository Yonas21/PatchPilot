# PatchPilot

A locally running AI dependency security analyst for small SaaS teams. Import an npm lockfile, scan exact versions against OSV, turn evidence into a Gemini triage brief, and approve an exportable remediation task.

The role research, functional specifications, architecture, and implementation plan are in [PROPOSAL.md](PROPOSAL.md). The current user-approved scope is **local only, with Gemini as the only credential**.

## Run locally

Requires Node.js 24 or newer and npm. Internet access is needed for live API requests; local data persists in SQLite. The installed Node runtime may print an experimental SQLite warning.

```sh
npm ci
npm run build
npm start
```

Open **http://localhost:4310**. The server binds only to `127.0.0.1`. For development, use `npm run dev`; the same port serves the React frontend and backend. Reload the browser after frontend edits; hot reload is disabled to keep one local server.

If `.env` does not exist, copy `.env.example` to `.env`. Add a key from [Google AI Studio](https://aistudio.google.com/apikey):

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.1-flash-lite
PORT=4310
DATA_DIR=./data
```

Do not commit or share `.env`. The server reads Gemini configuration when analysis is requested, so saving the key does not require a restart. No key is sent to the frontend. Restart after changing the port or database directory.

Without a Gemini key, scans, evidence, monitoring, task approval, and export still work. The app explicitly marks AI analysis unavailable; it does not substitute a fake AI response.

## What it does

1. **Inventory:** upload npm `package-lock.json` v1/v2/v3, import one from a public GitHub repository (including a full `/blob/branch/path` file URL), or try the labeled synthetic demo. Supports nested/scoped npm packages and exact-version aliases. Limit: 1 MiB and 2,000 unique package versions.
2. **Scan:** query live OSV records with bounded concurrency and pagination. Show coverage, skipped entries, failures, severity, advisory references, and candidate fixes.
3. **Analyze:** when Gemini is configured, automatically analyze the highest-priority finding per scan. Generate other briefs on demand. Validate structured output, evidence IDs, and proposed versions against source data.
4. **Act:** review/edit a task, explicitly approve it, and persist it in SQLite. Duplicate approvals reuse the same task. Export Markdown for an issue tracker; mark tasks done or reopen them locally.
5. **Monitor:** opt into daily checks while the backend is running. A minute-based worker processes due schedules and records new-finding notifications in the activity log. GitHub imports refresh the lockfile; uploads remain snapshots.

Priority is deterministic: published critical → high → moderate → low → unknown, runtime before development at equal severity. Unknown severity is visible as “Needs review.” A published affected-version match is not proof of application exploitability. Candidate fixed versions may belong to different release branches and require compatibility checks.

Partial/failed rescans retain older findings with an “Earlier evidence” label. Only complete coverage supersedes old evidence. Task completion is independent of verification that a vulnerable package was actually removed or upgraded.

## Integrations and costs

| API | Role | Credentials / limits |
| --- | --- | --- |
| [OSV](https://google.github.io/osv.dev/api/) | Published vulnerability evidence | Public API; documentation currently states no API limits. App uses four concurrent queries and a 15-minute cache. |
| [GitHub REST](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) | Public lockfile import at a recorded commit | No token; normally 60 requests/hour per IP. Imports and refreshes consume multiple reads; shared-IP quota can be exhausted. |
| [Gemini](https://ai.google.dev/gemini-api/docs/pricing) | Structured analysis | Only required secret. Uses an eligible free-tier model. Actual quota is project-dependent; check AI Studio. |

OSV and GitHub are the two non-LLM integrations. Gemini is additional. No cloud resources, paid plans, or GitHub writes are configured. Google Cloud Free Tier still requires a linked billing account, so this build uses local scheduling instead. Free-tier Gemini data may be used to improve Google's products: use public/synthetic inventories and non-sensitive context.

## Remediation workbench

Open **Remediation → Plans & verification**. The workbench adds a complete local review loop:

1. Select an inventory and run a new source scan. New scans preserve package snapshots and dependency relationships; historical scans remain readable but cannot support verification without a snapshot.
2. Prepare a plan. Findings are grouped by package/version, ordered by published severity, runtime scope, then finding count. Inspect advisory candidates and root-to-package paths before approval.
3. Approve the immutable plan. A newer source scan blocks approval of an outdated draft. Approval does not install packages or apply a patch.
4. Upload a candidate lockfile or run a later source scan. Candidate scans do not replace the monitored source or the main triage queue.
5. Record the comparison. Advisory aliases are matched across version changes. The result distinguishes persistent, new, no-longer-detected, and inconclusive matches. Partial coverage never establishes disappearance.
6. Export the plan with its evidence, limitations, approval time, and all recorded comparisons.

**Guided lab:** expand the lab section, create its synthetic inventory, prepare and approve its plan, download the candidate, and upload it for verification. The candidate upgrades minimist while deliberately leaving lodash unchanged. Both scans use live OSV data and the existing Gemini brief workflow.

Graph paths describe installed relationships, not runtime reachability. Peer dependencies resolve from their parent installation scope. Legacy lockfiles often lack root declarations; the app asks for ownership investigation instead of guessing from top-level placement. Candidate versions are unverified advisory boundaries, not an optimized or automatically safe upgrade set. Application tests still run separately in your project.

## Candidate checks and release review

In a remediation plan, **Check an upgrade candidate** confirms the exact version in the [public npm registry](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md), then queries OSV. Results distinguish published versions with matches, published versions without matches, and unavailable verification. Checks are persisted with timestamps. They do not install packages, validate compatibility, or verify the candidate's transitive dependency tree. OSV responses can be cached for up to 15 minutes.

Open **Remediation → Release review** to:

1. Select source evidence or an explicitly labeled candidate experiment.
2. Save an inventory-specific severity threshold, development scope, unknown-severity rule, and evidence age limit. Defaults block high/critical and unknown findings across both runtime and development dependencies, with a 24-hour evidence limit.
3. Evaluate and record the decision. Incomplete/missing snapshots, stale evidence, or a superseded source scan block the decision regardless of exceptions.
4. When justified, explicitly approve an exception with a reason, review owner, and expiry within 30 days. Exceptions apply only to the exact finding/version in that inventory. Expired/revoked exceptions no longer apply; findings remain visible.
5. Re-evaluate after an exception or policy change, inspect decision history, and export the review. Historical decisions preserve their original criteria and applied exceptions; they are not current release authorization.

The owner is a local recorded label, not an authenticated identity. There is no deployment gate or CI integration. The decision supports an engineer's review; it does not certify security or prove application tests passed.

## Architecture and code walkthrough

- `shared/types.ts`: frontend/backend data contracts; `shared/scan-selection.ts`: provenance-preserving result selection.
- `server/inventory.ts`: supported lockfile parsing and synthetic demo inventory. Demo dependencies are data only and are never installed.
- `server/providers/`: validated GitHub import, OSV normalization, grounded Gemini response handling, and restricted outbound API access.
- `server/agent.ts`: persisted scan lifecycle, automatic top-finding analysis, daily monitoring, restart recovery, and concurrency limits.
- `server/store.ts`: SQLite persistence; `server/tickets.ts`: task drafts and deduplicated approvals.
- `server/release/`: registry-backed candidate checks, validated criteria and exceptions, immutable decisions, and exports.
- `shared/release-policy.ts`: pure, testable release evaluation with evidence and expiry rules.
- `server/dependency-graph.ts`: installed dependency resolution, including peer relationships.
- `server/workbench/`: immutable plans, explicit approval, isolated candidate scans, verification records, exports, and the synthetic lab.
- `shared/plan-builder.ts` and `shared/scan-comparison.ts`: deterministic grouping, bounded dependency paths, and alias-aware comparison.
- `server/api.ts`: local API, explicit approval checks, origin/session restrictions, task exports, and dashboard state.
- `client/App.tsx`: navigation, polling, provenance-aware finding selection, and shared error/status feedback.
- `client/components/`: overview, searchable triage queue, finding evidence/AI dialog, inventory forms, monitoring, local task board, and activity log.
- `client/styles/`: responsive visual system and accessible focus states. Styles are split to keep authored files below 300 lines.

SQLite data lives in `data/patchpilot.sqlite` by default. The app is intended for one server process and one local user; it is not a publicly exposed multi-tenant service. Do not run two server processes against the same data directory.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

The retained regression suite covers inventory parsing, advisory normalization, partial coverage, grounded AI output, approval/deduplication, local API boundaries, schedule overlap, restart persistence, and preservation of older evidence. Tests use isolated databases and deterministic provider substitutes; they are not live-provider assertions. The local API test binds an ephemeral loopback port.

Initial local verification on 12–13 October 2026:

- Build and strict TypeScript checks pass; 37 regression tests pass after the impact-analysis and evaluation additions.
- Live OSV scan of the synthetic demo: 6/6 versions checked, 31 advisory findings, no lookup failures.
- Live GitHub import of `octokit/types.ts` at `c4b93f2fed6515aa00e8dccf290d4ade41c3b4af`: 93/93 versions checked, 9 findings, no lookup failures.
- Live upload API using this project's lockfile: 200/200 versions checked, no OSV matches at verification time. This is not a source-code audit or a guarantee of security.
- Existing Chrome session: rendered dashboard, finding search/detail, editable task approval, evidence access after approval, task done/reopen, and monitoring toggle verified. A real Markdown download was confirmed on disk with the expected title/advisory.
- Responsive checks covered narrow, tablet, and desktop layouts, plus narrow-screen navigation across all views. Fixed a hidden table label that caused page overflow. Keyboard Enter opens the inventory dialog and Escape closes it; this is not a full accessibility audit.
- Actual server restart retained both existing inventories and the approved demo task; a separate isolated test covers interrupted-scan recovery.
- Independent code review identified partial-history, history-limit, and failed-import persistence defects; all were fixed with regressions.
- Live Gemini brief verified through the app API (HTTP 200), validated against supplied advisory IDs and versions, and persisted for the demo lodash finding using `gemini-3.1-flash-lite`. Google rejected Gemini 2.5 Flash for this new user and reported high demand for 3.8 Flash; the working model is now the default. Model access and quota depend on the project.
- **Pending:** no deployment, narrated recording, or email submission occurred.
- Browser file transfer was blocked by Chrome's extension protocol. Lockfile parsing and upload API are verified independently; native file selection needs a manual check.

Workbench verification on 13 October 2026:

- Live two-package baseline: 4 advisory matches; candidate: 3. Recorded comparison: 1 advisory group no longer detected, 3 persistent, 0 new, with full coverage. Gemini generated a brief for both scans.
- Existing Chrome: plan preparation, approval, unlocked candidate controls, recorded comparison, and comparison filtering verified. Candidate input was sent through the upload API; native file selection remains a manual check.
- The approved plan and comparison survived a real server restart. Narrow, tablet, and desktop checks showed no document overflow.
- Independent review found omitted peer relationships; fixed with a regression. The suite also checks stale approval, cross-inventory/older comparisons, aliases across versions, candidate isolation, compact API responses, and incomplete coverage.
- All authored code files remain at or below 300 lines. The workbench polls summaries rather than full historical package snapshots.

Release-review verification on 13 October 2026:

- Real candidate checks: lodash 4.17.21 was published and had 2 OSV matches; minimist 1.2.6 was published with no OSV matches. These are time-specific lookup results, not safety or compatibility guarantees.
- Existing Chrome: saved lab-specific criteria, recorded a blocked decision, approved a clearly labeled synthetic exception, observed criteria met with exceptions, revoked the exception, and observed blocking restored. The demo exception is left revoked.
- A delayed browser request confirmed inventory/scan selectors remain disabled while evaluating. This fixes the reviewer's finding that a late response could otherwise show a decision under the wrong selection.
- Release review export included criteria, outcome, provenance, and historical-decision limitations. Narrow, tablet, and desktop layouts showed no document overflow.
- Regression tests cover exact exception scope, expiry/revocation, stale/missing/superseded evidence, policy thresholds, registry identity mismatches, provider failure, concurrent check deduplication, and immutable historical decisions.

## Demo and recording outline

1. Explain the role: engineers need an evidence-backed remediation plan, not another generic chatbot.
2. Show the architecture in `PROPOSAL.md` and the two public data integrations.
3. Add the synthetic demo inventory and show the live scan, coverage counts, and findings. Explicitly identify the input as synthetic.
4. Import `octokit/types.ts`, ref `HEAD`, path `package-lock.json`, to demonstrate real GitHub access. Public repositories change; current compatibility is not guaranteed forever.
5. Open a finding, explain its severity/source, and generate a real Gemini brief once the key is configured.
6. Prepare a task, edit it, approve it, and download Markdown. Explain that no GitHub issue was sent.
7. Enable monitoring and show its next-run time. “Check due schedules” processes only already-due schedules; “Scan now” is explicitly manual.
8. Demonstrate the remediation lab: approve the baseline plan, scan the candidate, and explain why remaining findings are still visible. Show the recorded comparison and export.
9. Check an upgrade candidate, then demonstrate release criteria and the blocked → excepted → revoked decision sequence using only the synthetic lab.
10. Walk through `server/agent.ts`, the provider adapters, API approval, and the React finding dialog. Mention limits and what was actually verified.

The narrated submission video and email have not been created or sent. The local app is the current deliverable.

## Boundaries

- No deployment, external messages, automated patches, merges, package execution, private repository access, or GitHub issue creation.
- npm lockfiles only; no pnpm/Yarn/SBOM support. Unsupported dependencies are reported as excluded coverage.
- Uploaded files are inventory snapshots. Use a plan candidate for before/after verification; add a new inventory if the update should become a separate monitored source.
- Monitoring requires the backend process and internet connection. It does not run while the computer or server is off; one overdue check runs on restart.
- AI output can still be wrong despite structural grounding checks; an engineer reviews its reasoning and compatibility recommendations.
- This is a demonstrable workflow prototype, not a replacement for Dependabot, a security audit, or a production vulnerability-management service.
- `.env`, SQLite databases, installed dependencies, build output, and temporary browser artifacts are excluded by `.gitignore`. Share source and documentation without those files.


## Upgrade impact and agent evaluations

In **Remediation → Plans & verification**, each plan includes upgrade impact analysis. Select direct dependency owners to count unique findings within their installed dependency trees. Shared transitive findings count once across the selection; disconnected findings and unresolved edges remain visible. This describes investigation scope, not predicted fixes or runtime exposure.

The **Guided remediation demo** tracks baseline, plan, approval, and comparison progress. After approving a lab plan, **Scan lab candidate** submits the supplied synthetic candidate directly through the candidate-scan workflow. Real projects still upload their regenerated lockfile. Record the comparison, then use Release review to document the decision. Current OSV results determine the outcome.

In **Remediation → Agent evaluations**, run 11 labeled synthetic scenarios through the actual AI-output validator, comparison logic, and release evaluator. Positive controls accompany rejection cases for invented citations, unsupported versions, incomplete scans, stale evidence, and superseded source scans. Export the timestamped expected/actual results as JSON. These are deterministic guardrail evaluations, not live Gemini accuracy or prompt-injection benchmarks; they make no provider calls and do not alter inventories.
