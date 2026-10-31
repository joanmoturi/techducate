# Implementation verification

Verified locally on Windows on October 30, 2026.

## Original implementation baseline

| Command/check                         | Actual final result                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm test`                            | **37 passed**, 0 failed/skipped. Isolated API/database/business-rule integration tests.                           |
| `npm run test:e2e -- --reporter=line` | **10 passed** in Chromium. Tests run against an isolated in-memory database, not the normal application database. |
| `npm run typecheck`                   | Passed; also executed as part of the production build.                                                            |
| `npm run lint`                        | Passed with no reported warnings or errors.                                                                       |
| `npm run build`                       | Passed. Production client output generated in `dist`.                                                             |
| `npm run db:migrate`                  | Passed. Initial migration applied/repeatable; no production data seeded.                                          |
| `PRAGMA integrity_check`              | `ok` for the newly created persistent local database.                                                             |
| Clean normal database                 | 0 accounts and 0 programmes after migration. Automated test identities/content never populated it.                |

## Coverage

The final mobile styling change was also checked with a focused two-test browser rerun (mobile navigation/overflow and accessibility); both passed. The local website and API were checked live on loopback, and desktop/mobile screenshots were visually inspected.

`npm audit --omit=dev --audit-level=moderate` reported **0 vulnerabilities** for runtime dependencies. This is a package-advisory check, not an independent security audit.

Public contact, volunteer, donation and organisation enquiries validate and persist. Origin, JSON content, honeypot, rate-limit and authenticated CSRF checks are exercised. Sessions and passwords are protected, and user-selected registration roles cannot escalate privileges.

Programme tests verify publication/registration windows, audience checks, duplicate applications, consent requirements, free/paid/sponsored/scholarship decisions, transactional allocation capacity, award budgets, waiting lists, fee locking, manual payment verification and refund access revocation.

Scoped instructor/judge access, role demotion/session revocation, learning restrictions, private content, persisted progress, completion-qualified ratings, shared schedule changes/conflicts, attendance and actual reports are tested.

Hackathon tests cover team capacity/membership/cross-event invites, leader-only submissions, private projects, rubric ranges, own-project scoring rejection, immutable scored rubrics, deadlines, HTTPS-only links and hidden/released scores.

Donation tests distinguish offers from actual cash receipts and receipt/verification/allocation statuses. Partner tests verify accepted-enquiry conversion and prevention of duplicate conversion, plus denial of unrelated external contacts. CSV formula neutralisation, notification ownership, one-use account recovery and cascading account deletion are covered.

Browser tests exercise public page navigation, mobile overflow/navigation, all four public forms, catalogue search, adult registration → application → staff approval → saved lesson completion, and private programme draft creation.

Automated axe WCAG AA checks passed on the home, contact, programme catalogue and support pages. Earlier test runs identified and led to fixes for accessible labels, hint associations and insufficient contrast. No test was disabled to obtain the final passing result.

## Operational enhancement: final results

| Check                                 | Actual result                                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                            | **55 passed**, no failures/skips: original 37 retained (guardian test strengthened for real evidence verification), plus 18 operational tests.                                                      |
| `npm run test:e2e -- --reporter=line` | **16 passed** in Chromium: original 10 plus 6 complete operational journeys.                                                                                                                        |
| `npm run typecheck`, `npm run lint`   | Passed, no reported warnings.                                                                                                                                                                       |
| Production build                      | Passed, including the final browser runner's clean production build. Staff and operational workspaces are separate lazy chunks.                                                                     |
| Migration 001 → 003                   | Automated upgrade preserved an existing account and approved child application; the legacy consent flag no longer grants participation without re-verification. Reopening migrations is repeatable. |
| Normal database                       | Integrity `ok`, migration versions 1/2/3, **0 accounts and 0 programmes**. No real data was seeded or replaced.                                                                                     |
| Snapshot/restore tests                | Passed with a live WAL source: persistent records retained, restored sessions revoked, existing destination refused, public `dist` destination refused.                                             |
| Recovery CLI                          | Actual `backup`, `verify` and `restore` commands passed against the empty normal database and separate temporary destinations. Original database was not replaced.                                  |
| Permission CLI                        | Actual grant/revoke commands passed on a test-only identity in the isolated restored copy. No staff account or permission was added to the normal database.                                         |
| Local preview                         | Website HTTP 200 on loopback port 5173; API health returned `{"status":"ok"}` on port 3001.                                                                                                         |

Operational API tests cover explicit permissions, anonymous/role/CSRF denial, restricted incident intake/actions/holds/disposal, privacy in ordinary reports, guardian ownership, independent evidence verification/history, optional purpose separation, emergency-data minimisation, notice-version invalidation, withdrawal and expiry, preservation of approved records/progress, immediate content/schedule/event/attendance gates, readiness checks, screening/orientation/lifecycle/expiry, private meeting-link revocation, compensation/history privacy, independently reviewed contributions, dual-control cash approval, competing balance checks, restricted allocations/releases/expenditure, duplicate references/donation links, locked canonical receipts and approved corrections, in-kind exclusion from cash, grant history, real aggregate metrics, output/outcome evidence and source/date/location privacy filters.

The six additional browser journeys exercise:

1. Guardian registration/application → relationship/declaration → officer verification and restricted evidence history → application approval → withdrawal and loss of learner access.
2. Authenticated restricted concern → denial to ordinary manager → authorised officer assignment and persisted follow-up.
3. Managed location → programme mapping → incomplete readiness blocks application → evidence-backed completion persists, with no overflow at 390px.
4. Donor/source → grant → receipt proposal → approval by a separate finance account → actual KES 1,000 cash balance and reconciliation CSV download.
5. Aggregate report/CSV, privacy projection, print button action and actual Chromium-generated `%PDF` output; axe WCAG AA checks on safety/location/funding/provider pages.
6. Officer-reviewed screening/training → contributor activation/orientation → assignment → provider observation/contribution → independent reviews and permission-aware in-app announcement.

The baseline security agent reported **no substantiated findings in its existing-code assessment** and supplied additional-module invariants. Enhancement access-control regressions and projection checks were then implemented/tested; this is **not an independent penetration test of the completed enhancements**.

The operational-enhancement acceptance database remained empty. Fixtures from that phase belonged only to isolated automated tests or a temporary CLI proof copy. Temporary snapshot/restore proof copies were removed after verification.

## Approved isolated client review: 30 October 2026

The user approved a temporary password-protected Cloudflare preview with explicitly fictional data.
It serves the production build and API from a separate loopback process and `data\review.sqlite`;
it does not expose Vite or seed the normal database. Credentials are generated uniquely, hashed in
SQLite, and delivered only through a private file outside the repository and served directory.
The artifact directory has a protected Windows ACL granting the current user, SYSTEM and local
Administrators access; its files inherit those restricted permissions.

| Check                      | Actual result                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API regressions            | **59 passed**, no failures/skips: preceding 55 plus four review-gate tests.                                                                                                                                         |
| Existing browser suite     | **16 passed** after a clean production build.                                                                                                                                                                       |
| Typecheck and lint         | Passed.                                                                                                                                                                                                             |
| Review provisioning        | Nine role accounts, two fictional programmes, adult lesson/schedules, one approved fictional adult and one pending fictional child application. No verified consent, screening or received funding was fabricated.  |
| Repeat provisioning        | Refused to overwrite the database/credentials; credential-file hash unchanged.                                                                                                                                      |
| Normal database            | Still **0 users and 0 programmes**, integrity `ok`; original local API remains healthy.                                                                                                                             |
| Official tunnel executable | Downloaded from the official Cloudflare release; SHA-256 matched the release's published digest before execution.                                                                                                   |
| Actual public HTTPS        | Anonymous root, dashboard, API and compiled JavaScript asset requests returned **401**. Correct gate access returned the built site/API. Review flag, no-store/no-index headers and private-file boundaries passed. |
| Public browser logins      | All **nine** accounts signed in through the real HTTPS hostname: admin, manager, finance proposer, independent approver, safeguarding officer, instructor, learner, guardian and partner.                           |
| Public access controls     | Role/grant-specific funding, incident and staff endpoints; Secure/HttpOnly/SameSite Strict session cookies; foreign-origin and missing-CSRF rejection passed for every account.                                     |
| Delivery boundaries        | Instructor can access the assigned adult course, not the child programme; adult learner can load the lesson; unverified child application cannot load child lessons.                                                |
| Mobile review              | 390px page displayed the fictional-data notice with no horizontal overflow; desktop/mobile review screenshots captured privately.                                                                                   |
| Persistent processes       | Separate review server and tunnel listening on loopback; protected public health returned `ok`.                                                                                                                     |

This is a computer-hosted temporary review link, not durable production hosting, a verified legal
assessment or a production safeguarding exercise. The partner account does not supply a partner
portal. Real payment/messaging integrations remain disabled. Review accounts and fictional data
must not be carried into production, and the server/tunnel must be stopped after review.

## Not verified or not available

- **Current Kenyan legal requirements/guidance** could not be retrieved reliably from the authoritative sites in this environment. Legal/safeguarding review remains a launch blocker; see `OPERATIONS.md`. Engineering tests are not proof of compliance.
- No production environment, owned public domain or durable cloud deployment was provisioned or tested. The separately approved temporary HTTPS review tunnel is described above.
- The optional Docker recipe was not built or run here.
- No real payment, email, SMS, WhatsApp or AI provider is integrated; those interfaces are explicitly disabled, not tested as live services.
- No real guardian identity/screening process was performed. Staff must use an approved offline process.
- No independent penetration test, manual assistive-technology audit, cross-browser certification, load test, timed/off-host production restore drill or container-image security scan was performed. Local SQLite round-trip and CLI recovery were exercised; these do not validate production backup storage, NTFS ACLs, encryption or scheduler/alerting.
- Broader product limitations and required organisational setup are listed candidly in `README.md` and `OPERATIONS.md`.
