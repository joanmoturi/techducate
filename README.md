# Techducate Africa

A community-first technology education website and operations platform. Built as a **new project**, as requested; there was no existing Techducate repository or implementation to preserve.

The public website uses green, black, grey and white, original CSS/SVG illustrations, local system fonts and no third-party tracking. There are no invented organisational statistics, clients, testimonials, payment details or historical claims. The normal database starts with **no programmes, accounts or fabricated records**. Browser-test fixtures exist only in a separate in-memory test server.

## Run locally (PowerShell)

Use Node.js 24.14+ or Node.js 26 and npm. SQLite is included in Node; no separate database installation is required.

```powershell
Set-Location C:\Users\joanmoturi\techducate
npm ci
Copy-Item .env.example .env
npm run db:migrate
npm run dev
```

Open `http://127.0.0.1:5173`. The API listens on port 3001. **Use 127.0.0.1, not localhost**, unless you also update `APP_ORIGIN` and the Vite proxy to match. All mutating requests require this exact origin. The production API serves the built website itself; Vite is development-only.

Create the first administrator in another terminal. Choose your own real email and strong, unique password. Never use an example password:

```powershell
Set-Location C:\Users\joanmoturi\techducate
$secure = Read-Host "New staff password (at least 12 characters)" -AsSecureString
$env:STAFF_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
npm run staff -- create --email "YOUR-VERIFIED-EMAIL" --name "YOUR-NAME" --role admin
Remove-Item Env:\STAFF_PASSWORD
```

Sign in, open **My learning → Team operations** (`/admin`), complete **Settings**, and create the first draft programme. No default administrator/password is installed.

## What works

| Area              | Implemented first version                                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public website    | Home, mission, searchable programme catalogue/detail, supported-learning and hackathon filters, partner services, donation offers, volunteer applications, contact, privacy/safeguarding notice; mobile navigation and keyboard access.                                 |
| Public forms      | Server validation, required privacy acknowledgement, honeypot, rate limits, persistence, useful reference and honest confirmation. Nothing claims that email was sent.                                                                                                  |
| Programmes        | Course, bootcamp, workshop, outreach, hackathon and competition; draft/publication/status controls; audience, eligibility text, dates, locations, delivery, funding options and capacities.                                                                             |
| Access            | Adult/guardian account registration, application review, consent verification, paid-access verification, waitlists and transactional capacity/budget checks. All options require staff approval.                                                                        |
| Funding           | Separate free, paid, fully sponsored, scholarship, subsidised, partner-funded, invitation and application allocations; sponsor, commitment, actual received funding, approved award budget, per-place award cost and computed approved allocations.                     |
| Learning          | Modules and plain-text lessons, draft/published content, scoped access, persisted completion and post-completion ratings. Shared live schedules, overlap checks, in-app change updates and attendance.                                                                  |
| Innovation events | Team configuration and private join codes, member limits, leader-only team submission, individual submissions, deadlines, HTTPS project links, rubric validation, assigned judges, private feedback and staff-selected winners released to the submitting participants. |
| Operations        | Programme configuration, staff assignments, application review, attendance, actual aggregate programme reports, operational counts, staff queues, internal notes, assignees and status histories. Private CSV exports for public-submission queues.                     |
| Donations         | Offers/pledges are distinct from cash received. Staff record an actual receipt, actual received amount/currency, verification and allocation. Equipment offers use receipt references, not pretend payment processing.                                                  |
| Partner services  | Service descriptions, structured organisational enquiries, follow-up workflow, internal assignment/history and atomic conversion of an accepted enquiry into a linked private programme draft.                                                                          |
| Privacy           | Adult-managed child applications, minimum child fields, offline consent review gate, no public child lists or projects, scoped records, account deletion, individual enquiry deletion, retention review command and audit trail.                                        |

Financial amounts use integer minor currency units (KES 2,500.00 is stored as 250000). Currency totals are never combined. **The funding register is not an accounting ledger**: donation receipt records and programme funding summaries are reconciled manually and must not be added together as separate cash receipts.

## Operational enhancement

The existing website, programmes, applications, scholarships, schedules, learning, events and enquiry queues are retained. The additional authenticated workspace is **My learning → Delivery, funding & impact** (`/operations`); adult/guardian controls and concern intake are at `/safety`.

| New capability           | Working scope                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guardian permissions     | Relationship and conditional emergency contact; separate participation, communications and media declarations; independent officer verification with an external evidence reference, notice version and expiry. Withdrawal/version changes immediately recheck participation access. No identity-document uploads or child medical database.              |
| Safeguarding             | Explicit permission, restricted concern intake, assigned officer, due date, follow-up history, referrals/closure, retention date and preservation holds. Neither administrator nor manager status alone exposes incidents or screening evidence.                                                                                                          |
| Contributors             | Volunteer/paid/part-time/contractor lifecycle, skills, availability, orientation, restricted screening/training/acknowledgement records, separately protected service arrangements, scoped assignment and independently reviewed contributions. Clearance expiry/departure revokes provider access and private dashboard meeting links.                   |
| Funding                  | Private donor/source and grant register; linked verified donations, pledges, restricted/unrestricted awards, grant status/deadline/conditions, in-kind records; immutable receipt/allocation/release/expenditure proposals, separate authorised approval, duplicate-reference checks, change histories and reconciliation CSV. Not accounting or payroll. |
| Delivery                 | Managed schools, community/partner/virtual venues, programme location mapping, configurable evidence-backed readiness checks, opening/running gates, objectives, target places, beneficiary description and report-safe lessons/next steps. No default requirement to have a physical venue for an online course.                                         |
| Impact                   | Real activity, distinct outputs/outcomes, configurable indicators, independently reviewed evidence snapshots, date/programme/location/source/category/age filters, suppression of small cohorts, aggregate CSV and print/Save-as-PDF report. No fake statistics, public child profiles or photographs.                                                    |
| Communication & recovery | Permission-aware in-app broadcasts to adult/guardian accounts, notification preferences, an offline warning without pretending offline learning, lazy staff workspaces, online SQLite snapshots, integrity checks and non-overwriting restore that revokes sessions/reset links.                                                                          |

Trusted operators must explicitly authorise safeguarding officers and a **different** financial approver:

```powershell
npm run staff -- permission --email "VERIFIED-SAFEGUARDING-OFFICER" --permission safeguarding
npm run staff -- permission --email "VERIFIED-FINANCE-APPROVER" --permission finance-approver
# Add --revoke to remove a permission. Sessions are revoked on either change.
```

Use multiple individual accounts. An officer cannot verify their own guardian declaration or screening; a financial proposer cannot approve their own proposal. Permissions are not automatically given to administrators. OS access to these commands is a trusted administrative boundary, not a substitute for written organisational authorisation.

**Upgrade:** back up with `npm run recovery` **before** migration/startup (startup also migrates). Additive migrations 002–003 preserve version-1 records. Legacy `consent_verified` checkboxes are deliberately insufficient: existing child applications retain their decisions/data but participation pauses until guardian purpose-specific consent is reverified. See `docs\OPERATIONS.md` for exact operating and recovery procedures.

## Roles

| Role         | Server-enforced access                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`      | Site configuration, financial setup, all programmes/reviews, donations, staff assignments, reports, audit and deletion tools. No anonymous access is allowed.                                                                                                                                                                                                              |
| `manager`    | Create nonfinancial programmes; manage programme operations, applications, nonfinancial enquiries, assignments, contributor lifecycle and aggregate reports. Cannot configure financial amounts/sponsors, see compensation or establish verified consent without explicit safeguarding permission. Existing general programme configuration is an administrator UI action. |
| `finance`    | Donation review/receipts, funding sources/grants/actions/reconciliation, restricted service arrangements and manual programme payment verification. Proposal review additionally needs `finance-approver` and a different proposer. Cannot read partner/volunteer/contact queues, guardian records, screening evidence or incidents.                                       |
| `instructor` | Only assigned programmes. Instructor/mentor/facilitator assignments can manage lessons, sessions and attendance using first names and user IDs, without guardian contact details or finances. Judge assignments can review submissions and score, but not access learning or attendance.                                                                                   |
| `learner`    | Own applications, approved learning, progress, schedules, in-app updates and event participation. This is an adult/guardian-managed account.                                                                                                                                                                                                                               |
| `partner`    | Own account and any individually approved participation; no organisation-wide data access. There is intentionally no partner portal or implicit organisation permissions.                                                                                                                                                                                                  |

Create additional staff with the `create` CLI command above and `--role manager`, `finance` or `instructor`. Promote an existing account with:

```powershell
npm run staff -- role --email "VERIFIED-ACCOUNT-EMAIL" --role instructor
```

Changing a role revokes the user's existing sessions. At least one administrator must remain.
Role checks still apply after a permission grant; promoting/demoting an account does not override them. Safeguarding grants operate only for admin/manager/instructor roles, and finance-approver grants only for admin/finance roles.

## Configuration

See `.env.example`. No external provider keys are needed for this version.

| Environment variable | Purpose                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`           | `development` locally; set `production` for Secure cookies and HTTPS-origin enforcement.                                                                 |
| `HOST`               | Default `127.0.0.1`. Use `0.0.0.0` only inside a properly protected container/network.                                                                   |
| `PORT`               | API/production web listener; default 3001.                                                                                                               |
| `APP_ORIGIN`         | Exact public origin, without trailing slash. Local: `http://127.0.0.1:5173`; production must be your verified `https://` origin.                         |
| `DATABASE_PATH`      | SQLite database path; default `./data/techducate.sqlite`. Must be persistent and writable by the app process, never in the served `dist` folder.         |
| `TRUST_PROXY`        | `0` by default. `1` only behind exactly one trusted proxy which replaces forwarded client headers.                                                       |
| `STAFF_PASSWORD`     | Temporary environment value used only by the staff-account creation CLI; clear immediately afterwards. Never commit it or put it in a frontend variable. |

Administrators configure verified contact email/location, optional legal entity name, public donation instructions, privacy contact, safeguarding instructions and retention review threshold in **Settings**. Until supplied, the site explicitly says payment instructions are not configured. The legal entity field does not confer registration status.

## Quality commands

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Browser tests start and stop their own isolated server at `http://127.0.0.1:4173`; do not run another service there. If Playwright reports that Chromium is missing, install it with `npx playwright install chromium` and rerun. Automated checks include real public forms, catalogue filtering, adult application → staff approval → saved lesson completion, draft creation, mobile overflow/navigation and axe WCAG AA checks on selected public pages. These are not a full accessibility certification or penetration test.

`npm run format` formats source and documentation using Prettier.

## Production

```powershell
npm ci
npm run build
$env:NODE_ENV = "production"
$env:APP_ORIGIN = "https://YOUR-VERIFIED-DOMAIN"
$env:DATABASE_PATH = "C:\TechducateData\techducate.sqlite"
$env:HOST = "127.0.0.1"
$env:PORT = "3001"
npm run db:migrate
npm start
```

Run under a supervised service account behind an HTTPS reverse proxy. **Do not launch until the organisational, legal, safeguarding and operational checklist in `docs\OPERATIONS.md` is completed.** No production deployment, real message, payment or domain purchase has been performed. A temporary fictional client review is not a production launch.

An optional `Dockerfile` prepares a non-root single-instance deployment with a persistent `/app/data` volume. The container recipe requires validation in your deployment environment; Docker is not part of the local test suite.

## Isolated client review

`npm run review:create -- --credentials "<absolute private JSON path>"` creates a separate
`data\review.sqlite` with nine random-password role accounts and labelled fictional examples.
The credential directory must already exist outside the project with restrictive OS permissions.
Existing review files are never overwritten, and the normal database is untouched.

Run the built application separately with that database, an exact HTTPS review origin, and both
`REVIEW_USERNAME` and `REVIEW_PASSWORD` from the private credential file. The optional whole-site
gate protects assets and APIs as well as pages; ordinary application login and permissions still
apply. A temporary approved Cloudflare tunnel needs the computer and both processes to remain
running. Use fictional information only. See `docs\OPERATIONS.md` for setup, sharing and shutdown
requirements. Never commit or publicly share credentials.

## Documentation and limitations

- `docs\ARCHITECTURE.md`: domain model, authorisation, access rules, brand tokens, integration boundaries and limits.
- `docs\OPERATIONS.md`: workflows, launch checklist, legal review blockers, recovery, backups, retention, deployment and incident handling.
- `docs\DEPLOYMENT.md`: verified source location, GitHub publication, current review URL, cross-session deployment history and review restart instructions.
- `docs\VERIFICATION.md`: actual check results, coverage and checks not performed.
- `server\integrations.ts`: typed but **disabled** payment, notification and AI provider boundaries.

**Intentionally deferred:** asset-level inventory/maintenance and resource forecasting; curriculum pathways, individual verified skills, assessed certificates/public verification; a multi-dependant learner identity/progression model; alumni directory/community; partner portals/multi-organisation tenancy; online payments; external messaging/reminders; AI tutoring; offline learning/material downloads; language packs; rich media/SCORM/quizzes; private attachments; accounting/payroll integrations. No UI pretends these services exist. In-kind receipt descriptions are not an equipment inventory. Programme eligibility beyond implemented checks remains human-reviewed.

Account recovery uses a one-use 30-minute link issued by authorised operators through `npm run staff -- recover --email "VERIFIED-ACCOUNT-EMAIL"`, **after offline ownership verification**. The link is printed locally for secure delivery, not emailed. MFA and self-service email verification are launch-hardening work; consider a managed identity provider before serving real children's records at scale.
