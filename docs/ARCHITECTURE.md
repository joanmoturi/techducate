# Architecture and business rules

## Structure

- `src`: React + React Router, strict TypeScript, shared accessible controls and responsive CSS. The SPA and API share an origin. System fonts and original vector/CSS artwork avoid external image/font requests.
- `shared\domain.ts`: Zod input schemas, enums and typed contracts used by both layers. The backend revalidates every write; frontend checks never confer permission.
- `shared\operations.ts`, `server\operations.ts`: additive operational contracts and protected API for consent, safeguarding, contributors, funding, locations/readiness, announcements and aggregate impact.
- `server\operational-rules.ts`: participation consent/expiry/version, provider clearance/departure and readiness rules reused by original learning, application, event, attendance and dashboard paths.
- `server\recovery-service.ts`, `server\recovery.ts`: verified online snapshots and new-directory restore; restore migrates the copy and invalidates session/reset credentials.
- `server\app.ts`: Express routes, origin/CSRF checks, validation, granular permission gates, queues, learning, events, exports and JSON error handling.
- `server\programmes.ts`: publication, scoped access, transactional capacity, budget, consent and enrolment decisions.
- `server\auth.ts`: scrypt password hashes, constant-time hash comparisons, random server-side sessions, hashed session/recovery tokens, per-session CSRF and Secure/HttpOnly/SameSite cookies.
- `server\db.ts`, `server\migrations`: SQLite foreign keys, WAL, transactions/savepoints, versioned schema migration, audit and in-app notification helpers. Money is integer minor units.
- `server\cli.ts`: migration, staff creation/promotion, manually delivered recovery links and retention review.
- `tests`, `server\app.test.ts`: isolated browser and API integration tests; never use the live database.

One process and one SQLite writer volume is the intended deployment. Do not mount the SQLite file concurrently in multiple replicas or use a serverless ephemeral filesystem. Multi-instance availability, distributed rate limiting and scheduled work need an explicit architecture change.

## Stored concepts

Users/sessions/recovery tokens; programmes/funding allocations/provider assignments; applications including consent/payment status; lessons/progress/ratings; scheduled sessions/attendance; teams/membership/projects/scores; typed public-submission queues/status history; notifications; settings; administrative audit.

Programme configuration lives in validated JSON with relational funding rows and foreign keys for core invariants. Funding modes already referenced by applications cannot be removed. Capacity cannot be reduced below approved allocations. Fees/currencies cannot change after an application is submitted; award cost cannot change after an award. Programme type cannot change after applications exist. Existing teams and scored rubrics are protected against incompatible configuration changes.

Migrations run before startup and in the migration command. Migration 001 creates the initial schema without destructive resets. Future changes require a new migration and pre-deployment backup/restore test; never edit a migration already applied to real data.

Migrations 002–003 add permission grants, locations/operating policies, scoped guardian details, append-only purpose-specific declarations, restricted concerns/actions, provider lifecycle/screening/agreements/contributions, source/award/action registers, reviewed impact observations, preferences/announcements and protected before/after history. Existing rows are not rebuilt or seeded. Legacy child consent flags intentionally do not confer access after upgrade; they remain stored for history, but reviewed current consent is authoritative.

Safeguarding is a dedicated capability granted through an audited trusted CLI, not an automatic admin inheritance. Financial approvers need both the correct current role and an explicit grant. Consent/screening self-verification and financial self-approval are rejected. Permission changes invalidate sessions; current grants are loaded on each request. Screening/financial history has the same restricted authorisation as the underlying record and is not mixed into ordinary narrative logs.

Child participation is deliberately application-scoped. A guardian's account is not a universal learner identifier: the version-1 one-account/application-per-programme constraint remains. Never infer unique children across programmes from account counts. A future multi-dependant model must also move progress/attendance/team identity off the account key rather than superficially adding a child selector.

Funding proposals are immutable; approval revalidates current balances in `BEGIN IMMEDIATE`, then marks exactly one review. Donation-linked awards read the existing canonical verified receipt, while grant cash is the sum of approved receipt actions. In-kind contributions cannot enter cash actions. Per-programme allocation less release bounds expenditure. Currency/restriction/reference are locked; grant administrative metadata retains before/after history. Programme seat-award budgets are not cash balances and are not automatically synchronised.

Report APIs aggregate only authorised staff scopes, suppress small cohorts/cells/complements, omit child identity/evidence/incident fields and audit exports. Reports are not public. Age-filtered reports suppress small nonempty age strata and omit whole-programme custom indicators. These are disclosure-reduction measures, not formal statistical disclosure control or automatic free-text redaction. Source associations are not individual donor attribution; programme-period filters are explicitly distinct from transaction-date accounting. Browser print/PDF and CSV share the displayed aggregate model.

Staff and new operational pages are lazy-loaded; the marketing route does not eagerly load administrative UI. No external fonts/images/tracking or new provider dependency was introduced. An offline status message is informational: learning/API access still requires a live connection, and only already-saved progress survives interruptions.

## Nonprofit and revenue model

All participation modes share one programme/application lifecycle. No programme is forced into a free-versus-paid boolean.

Each programme has one allocation row per funding mode, each with its own capacity. Total capacity is the sum. A programme can combine six paid and four sponsored places, for example. An application does not reserve a place or award a scholarship; approval under an immediate transaction consumes its selected allocation.

Scholarship, sponsored, partner-funded and subsidised awards use the same manual eligibility process and configured award budget. Committed amounts are pledges; received funding is a separately entered fact; budget is an approved limit. Allocated cost is approved places times the fixed per-place award amount. Staff must reconcile source receipts and expenditure outside this register; this is not double-entry accounting, tax receipt issuance or grant accounting.

Every application starts pending or, if already full, waitlisted (when enabled). Pending applications can exceed capacity; only approval reserves a place. Staff choose promotion from the waiting list; there is no automated promise or ranking.

Paid/subsidised access requires BOTH a verified manual payment and an approved application. Browser success messages and submitted references cannot update payment status. Failed/refunded payments immediately invalidate content access even if an old application decision still says approved. Financial review and application review remain independent and auditable.

Manual donation offers start pending. Receipt, verification and allocation are separate staff actions. Staff must enter an actual receipt reference and actual monetary amount/currency before recording cash received. Dashboard received/verified totals use actual receipt values, never offered amounts. No donation automatically changes a funding allocation or learner award.

## Publication and learning access

- Draft/archived programmes and future `publishAt` dates are hidden even through direct IDs.
- Open/scheduled/full programmes accept applications only within their registration window. Full programmes use the waiting list only when configured.
- Audience rules enforce the three age groups; free-text experience, detailed eligibility, invitation and scholarship requirements need human review.
- Approved content requires publication, valid consent for minors and verified payment for charged allocations. Provider access requires an assignment in the appropriate responsibility. A role name alone does not grant instructor access.
- Learners see published lessons only. Completing an authorised lesson saves one idempotent progress row. Ratings require enrolment and completion of every currently published lesson.
- Completion reporting means **self-recorded completion of current published lessons**, not an assessed qualification. A newly published lesson can change completion figures.
- Session writes reject overlaps within the programme, shared providers or currently approved participants. Approval and provider assignment also check existing conflicts. UTC is persisted; the UI converts local datetime inputs and renders the viewer's locale.
- A schedule record is shared, not copied between dashboards. Changes generate private in-app notices. There are no email or external message claims.

## Events

Hackathons/competitions have separate team/deadline/challenge/rules/rubric/release configuration. Teams require approved participation in the same event, one team per user/event and a private random join code. Only the leader submits a team project. Individual events do not require teams.

Project links allow HTTPS only; they are not fetched by the server, preventing server-side fetching of participant-supplied URLs. New-tab links use `noopener noreferrer`. Uploads are intentionally not supported, and no unauthorised static-download route exists.

Judges must be assigned, cannot score their own/team project, must provide one in-range value per criterion and see only their own unpublished scores. A scored project and rubric cannot be changed underneath judging. Staff can select winners and release scores. Release is **to the project owner/team, not the public**; first-version child-safeguarding policy favours private results. Other participants cannot browse submissions. Judges and mentors receive only the scoped data needed by their assigned responsibilities.

## Organisations

Partner enquiries contain organisation/contact/participant intent and operational details, scoped to authorised staff. Accepted enquiries can be converted atomically into linked private programme drafts, using the supplied details and administrator-reviewed configuration. Repeating conversion cannot create another linked programme.

There is deliberately no organisation session/portal or public enquiry lookup. External contacts receive a saved reference, not a token authorising someone to query other records. A future portal must introduce verified organisation membership, explicit report grants and per-request tenant/organisation checks. Do not grant the `partner` role access to staff APIs.

## Security boundaries

Mutation requests require the exact configured Origin and JSON, plus a session-bound CSRF token for authenticated sessions. Sessions expire after 12 hours. Password resets are hashed, one-use and expire after 30 minutes. Passwords require 12–128 characters. Role changes revoke sessions.

Public forms and authentication are rate limited per observed client address. Limits are in-memory for a single instance, reset on restart and do not replace edge abuse controls. Configure trusted proxies correctly, use network controls and evaluate stronger bot protection before a high-traffic campaign. No cross-origin CORS access is enabled.

React renders user content as text, never injected HTML. API responses use `no-store`; Helmet supplies security headers and a self-only script policy. Private CSV export neutralises spreadsheet formula prefixes, requires staff permissions and records an audit event. Logs do not deliberately include passwords, tokens or submitted bodies. Restrict infrastructure access to both logs and SQLite.

SQLite is **not encrypted by the app**. Use encrypted storage, OS permissions, supervised non-admin execution, restricted backup access and organisation-approved key management. No guarantee of regulatory compliance, penetration-test coverage or production readiness is implied.

## Integrations

`server\integrations.ts` defines typed payment initiation/callback verification, outbound messaging and human-review-only AI draft boundaries. No provider is instantiated. Integration statuses remain explicitly disabled.

Payment activation (Pesapal or an organisation-selected provider) needs authorised merchant onboarding, server-only secrets, sandbox tests, callback origin/signature validation, exact amount/currency/reference reconciliation, replay protection/idempotency and refunds/dispute handling. Never add a callback that trusts browser navigation or a submitted status.

Messaging needs an approved provider, server-side credentials, a transactional outbox/retry worker, delivery-failure reporting, channel preferences and reviewed guardian routing. Save submissions even when outbound delivery fails; never claim an email was sent without provider acceptance.

AI activation needs approved provider/data agreements, server-side secrets, minimised prompts without child PII, consent/legal review, age safeguards and human review before curriculum/rubric publication. AI must never make scholarship, eligibility or safeguarding decisions. Do not implement a pretend chatbot when credentials are missing.

## Brand and accessibility

Core tokens: green `#196c45`; deep green/ink `#172a22`; muted grey `#647069`; white `#ffffff`; soft green `#e9f2e8`. Warm grey and lighter greens are supporting surfaces, not separate brand colours. CSS illustrations are original; no existing Techducate brand assets were supplied.

Keyboard focus, skip navigation, named inputs and descriptions, reduced-motion handling, live success/error messages, visible loading/empty states, and mobile layouts are provided. Automated axe checks cover selected pages; manual keyboard, screen-reader, zoom and low-bandwidth testing remain launch review tasks.
