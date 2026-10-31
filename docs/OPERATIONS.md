# Operations, launch decisions and deployment

## Programme workflow

1. Sign in as administrator, open My learning → Team operations → Programmes → Create programme.
2. Set type, audience, delivery, eligibility, public location, dates and participation allocations. Defaults are a private draft; no real records are seeded.
3. Configure each funding capacity. For paid/subsidised places, configure the agreed fee/currency. For sponsored/scholarship places, configure the approved award budget and cost per place; enter funding source and committed/received values separately. These financial configuration actions are administrator-only.
4. Configure publication and registration windows. Publish only verified copy and opportunities the organisation is actually ready to deliver.
5. Create or promote instructor accounts with the staff CLI, then assign each provider in Programme operations → Assignments. Assign judges separately from teachers.
6. Publish modules/lessons, schedule sessions and supply private meeting links in session records, never public programme copy. Conflicts are rejected.
7. Review applications and eligibility. For a child, the guardian first visits `/safety`, records their relationship and purpose-specific declarations; an explicitly authorised officer then verifies authority/evidence/version/expiry in `/operations?tab=safeguarding`. A normal application-review checkbox no longer establishes consent. Do not store identity documents in notes.
8. For paid applications, finance verifies the receipt first under Payments. Then staff separately approve the application. For awards, approval consumes capacity and approved budget. Waiting-list promotion is manual.
9. Record attendance and use the programme report for actual counts, not invented impact metrics. Lesson completion is self-recorded activity, not assessment certification.

**One account supports one participant/application per programme.** A guardian may manage applications in different programmes, but multi-child participation in the same programme requires a reviewed future dependant model or staff-assisted alternative outside this version. Do not work around this by creating accounts that pretend children are adults.

## Hackathon workflow

Choose Hackathon or Competition when creating the programme. Configure challenge, rules, milestones (in rules), optional teams, maximum team size, deadline and rubric (`Criterion | Maximum` per line). Publish and review applicants like other programmes.

Approved participants create/join private teams using leader-provided invite codes. Team leaders or individual participants submit HTTPS project links. There are no uploaded attachments. Assigned judges record rubric scores/feedback; own-team judging is blocked. Staff select winners and release results through configuration only after review. Results remain limited to the submitting participant/team; public child project galleries are not supported.

Programme type, fee/currency and existing team/rubric invariants are guarded. Carefully configure before accepting applications, and use a new programme for genuinely different future cohorts rather than repurposing enrolments.

## Enquiry, volunteer and partner workflow

Open the relevant operations queue, filter by status/search, review the record, assign an authorised staff member and save internal notes/status. Every update appends history. The system does not automatically email the submitter. Contact them only using an authorised, consent-appropriate communication method.

Volunteer screening and safeguarding are organisational processes. An accepted volunteer application does not automatically create staff privileges or grant child-record access. An operator must create/promote an appropriate staff account and managers must scope its assignment.

Manage the extended lifecycle at `/operations?tab=providers`: application reference → review/interview → screening → approval/orientation → active assignment → contributions/feedback → completion/departure. An officer separately records actual screening, training completion, acknowledged safeguarding code and expiry. Pending records may leave uncompleted training/expiry blank; do not invent dates. A different officer must review the contributor's own screening. Managers cannot see screening evidence; they see whether the contributor is currently eligible.

Screening is mandatory for child/youth programmes, any programme with approved child participants, or programmes explicitly configured to require it. All existing assigned providers must be cleared before approving a child. The `active` lifecycle stage requires current screening and completed orientation. Departure blocks provider access even for adult-only programmes; clearance expiry blocks child-facing routes and dashboard meeting links. Managers can still administer programmes to resolve operational problems.

Contributor skills/interests/availability support manual matching, not an automated matching decision. Assignments remain in the existing programme workflow with conflict checks. A provider can report their own assigned contribution; another manager verifies it. Contributions cannot be future-dated, duplicated, or exceed 24 hours per person/day. Finance/admin alone can record service arrangements; this is neither payroll nor an employment classification. Changes have separately restricted before/after history.

For an accepted partner enquiry, select Prepare programme from enquiry. Existing requirements prefill a programme form; review them, configure actual capacity and save. Conversion links one private draft atomically. No client logo, testimonial or public partnership is created. Reports are staff-only. Sharing aggregate reports with a commissioning organisation requires a privacy and agreement check; do not share raw participant lists.

## Donations and reconciliation

Configure verified public donation instructions in administrator Settings. Do not put bank/payment credentials in source code or environment examples.

Public submissions are offers, not receipts. Finance records pending → received → verified → allocated using actual receipt reference, actual received amount/currency (if monetary) and review notes. Receipt, verification and allocation cannot be skipped forward. Equipment/learning-resource receipt records require a reference too.

The pledged amount is retained separately from actual received amounts. Dashboard totals are separated by status/currency. There is no payment gateway, automatic fundraising total, tax receipt, double-entry ledger or automatic donation-to-scholarship award.

### Funding register and grants

1. Finance/admin creates a private source (individual, corporate, institutional, foundation, grant provider or in-kind contributor).
2. Register an award with a unique reference, source, currency, pledged amount and optional permitted programmes. An empty restriction list means unrestricted. Monetary donations **must link the existing verified donation receipt**, which can be linked only once. In-kind descriptions do not create spendable cash. Grants can begin preparing/submitted and are marked awarded with their actual award date before cash can be approved.
3. Keep grant application status, award date, reporting deadline and conditions current. Financial currency and programme restrictions are immutable in this version. Administrative changes retain before/after history. Changing explanatory conditions does not change the enforceable programme restriction list.
4. Propose a verified receipt, cash allocation, release of unspent allocation, or expenditure. Supply the actual transaction/adjustment reference and reason. Negative amounts are accepted only for receipt corrections.
5. A **different** admin/finance account with `finance-approver` permission reviews immutable proposals. Receipt reductions cannot underfund existing allocations; allocations cannot exceed verified unallocated cash; expenditure/release cannot exceed the programme's available allocation; restricted awards cannot fund other programmes. Rejected proposals move no money. Approval rechecks balances transactionally, including competing proposals.
6. A linked donation's original currency/reference/status cannot be rewritten through the old queue. Approved receipt adjustments update its canonical received amount and append reconciliation history. Other donation notes remain editable. Linked receipts cannot be deleted from the generic enquiry queue.
7. Download reconciliation CSV and reconcile with approved accounting software. It includes pending/rejected as well as approved actions: **only approved actions affect balances**. The linked original donation receipt remains the opening balance, not another income action. Export/store the donation register and funding register together for reconciliation; never sum the same receipt twice.

Programme seat capacities, award cost, approved seat-award budget and legacy committed/received summaries remain separately configured facts, not an automatically synchronised accounting ledger. After allocating cash, finance/admin must configure/reconcile sponsored places and approved award budgets in programme configuration. The platform does **not** attribute a particular child's outcomes to a particular donor. No procurement, payment initiation, tax or payroll service is provided.

### Readiness, locations and impact

Create managed locations in `/operations?tab=locations`, then link each programme in Delivery. Use general community areas, not children's home addresses. This mapping supports reports; it does not overwrite the existing public location description, which staff must keep consistent.

Configure objectives, target beneficiary description, planned places and relevant readiness items. Examples: curriculum, assigned screened instructor, venue/connectivity, equipment, reviewed applications/consent, schedule, learning materials, funding, safety and communication plan. Select advisory, mandatory before opening/scheduled delivery, or mandatory before running/completion. Completed items require evidence; human attestations are not automated inspections. No generic physical-delivery items are imposed on simple online courses.

Adding incomplete mandatory checks to an already published programme deliberately pauses applications and learner access without deleting records. Complete the checks to restore access. Changing a consent notice requires a **new, never previously used version** and new guardian declarations/officer verification. The system never treats media permission as a condition of participation.

Create output/outcome indicators with units, targets and required evidence. Record actual observed snapshots; a different manager reviews evidence before inclusion in aggregate reports. Correct an observation by appending a new reviewed snapshot; earlier history is retained. The latest reviewed date/sequence is used, not a sum of repeated snapshots. Attendance is not mastery; a project submission is not proof of a working project; self-recorded lesson completion is not an assessed qualification. Describe limitations and avoid causal claims.

Impact reports filter programme delivery-period overlap (undated programmes use creation date), managed location, programme, category, authorised funding source and age group. Metrics are **lifetime activity within selected programmes**, not period-specific attendance or expenditure transactions. Current approvals/lesson configuration influence these operational snapshots. Counts are places, not deduplicated children across programmes/accounts. Underserved-community descriptions are configured aggregate targeting, not automatic proof of each participant's circumstances.

Small cohorts/cells and small complements are suppressed; age filtering is suppressed when any nonempty age band has fewer than ten applications. Group filters omit whole-programme custom indicators. This is risk reduction, not a formal anonymity guarantee; do not combine exports to infer individuals. Never give partners raw staff API access.

Admin reports may include currency-separated linked award cash, programme allocations/expenditure and separately configured seat-award budgets. A multi-programme award's total cash may appear in multiple programme reports: **do not sum that received amount across report rows**. Funding-source filtering indicates associated delivery, not exclusive donor attribution.

Download aggregate CSV or use **Print / Save report as PDF** in a browser. PDF output is browser-generated, not a background server-generated document. No photographs, child identity fields, guardian contacts, incident narratives or private evidence references are projected. Titles/objectives/challenges are free text, so an authorised human must check and approve the narrative before external sharing. No public report link exists.

### Restricted safeguarding process

Assign at least two trained officers with documented organisational authorisation. Only the explicit safeguarding grant opens consent cases, screening evidence/history or incidents; ordinary admins/managers/providers cannot read incident records. OS command access is a trusted boundary. Separate financial proposal and approval duties with distinct accounts.

Guardians declare participation, communications and media choices separately from their account. Officers use an approved **external** verification procedure to check authority, identity, exact purpose/notice and informed permission; record only the secure evidence reference and a future expiry (within one year). The app records the officer's attestation; it does **not authenticate external evidence or issue a legally valid electronic signature**. Changing guardian details invalidates previous verification. Expiry, withdrawal or notice-version changes are checked on learning, progress, event, attendance and schedule access. Application approval/payment are still separate.

Communications and media are optional. Broadcasts go only to permitted adult/guardian accounts, respect optional update preferences and require verified communications permission for child applications. Essential status updates remain in-app. There is no direct adult-to-child messaging, public child directory, uploaded publicity media or external communication delivery.

Authenticated adults may submit restricted concerns at `/safety`; there is no anonymous/public report lookup. Intake is rate limited per account. The inbox is **not an emergency service and sends no external alert**. Publish verified contact/escalation instructions in Settings; designate a primary officer and deputy to monitor new/urgent/overdue cases at an organisation-approved frequency and arrange out-of-hours coverage.

Officers record triage, accountable officer, next review date, action/referral, closure rationale, approved retention date and legal hold. Open cases need an assigned authorised officer and review date. Defaults are review placeholders, not approved statutory retention periods. Disposal requires explicit confirmation, a closed case, an expired retention date and no hold; a minimal disposal audit survives. Allegations against an officer need a separate protected external escalation route: all explicitly authorised officers can access this version's safeguarding desk, and no conflict-of-interest case wall is implemented.

The organisation must approve child protection/conduct and supervision rules, screening standards and renewal, guardian authority/informed consent procedures, emergency response, mandatory referral/reporting decisions, staff training, confidential case handling, retention/holds and privacy requests. Avoid unnecessary medical/accessibility records: this version does not collect them. Arrange accommodations through an approved minimal-information process outside the platform until a specifically reviewed workflow is added.

## Privacy, safeguarding and Kenyan legal review: launch blockers

This implementation intentionally minimises child data and blocks self-registration by children. These are engineering choices, **not a legal compliance determination**.

Official review starting points are Kenya's **Data Protection Act, 2019**, including provisions concerning children's personal data, and current Office of the Data Protection Commissioner (ODPC) regulations/guidance concerning children, education, consent, registration and impact assessments.

Primary-source retrieval was attempted again during the enhancement. Kenya Law returned no usable text; the ODPC resources request returned 404, and web searches did not yield usable authoritative text. Earlier attempts also encountered a challenge/timeout. **Current legal text and applicable guidance could not be verified in this environment. No claim is made that a current legal review was completed.** An authorised reviewer must obtain the authoritative Act, applicable regulations and current ODPC child/education guidance and record the organisation's decisions before real child data is entered.

Before public launch, have appropriate organisational/legal reviewers decide and approve:

- Controller/legal entity identity, nonprofit classification and verified registration claims. None are invented by the site.
- Applicable processing bases and purpose-specific notices, consent withdrawal, age policies, guardian relationship verification, participation consent and evidence retention.
- Whether a DPIA, ODPC registration, particular consent/age verification measures, breach reporting arrangements or additional educational safeguards apply.
- Data subject access/correction/deletion procedures, guardian authority limitations and appropriate responses to privacy requests.
- Processor agreements, hosting location, international transfers, subprocessors, backup locations and any planned external messaging/AI use.
- Retention periods and legal/financial holds for enquiries, applications, learning records, audit logs, donations and backups.
- Safeguarding officer/contact, safe instructor conduct, provider screening, reviewed communications rules and incident escalation. Configure the approved public instructions in Settings.
- Whether the first-version local authentication is appropriate; deploy MFA/managed identity, self-service verified email and stronger abuse controls before a larger or higher-risk rollout.

Never publish children's names/contact details, photos, results or submissions through admin descriptions. UI fields are not an excuse to enter prohibited data. Public content must be editorially reviewed.

## Account recovery and deletion

After an approved offline ownership check, a trusted operator may run:

```powershell
Set-Location C:\Users\joanmoturi\techducate
npm run staff -- recover --email "VERIFIED-ACCOUNT-EMAIL"
```

The output contains a sensitive, one-use 30-minute recovery link. Deliver it securely to the verified owner; do not paste it into public logs, issues or shared chat. Issuing a new link invalidates old ones. Successful reset invalidates existing sessions. No automatic recovery email is claimed.

Learners can delete their account in My learning → Account & sign out after password confirmation and an explicit acknowledgement. This cascades linked learning/guardian/consent records and teams/projects they lead. Explain that effect before assisting with a privacy request. Accounts linked to concerns, financial proposals/reviews or service agreements require officer-led retention review rather than automatic deletion. Administrator accounts must first transfer duties and be demoted; the last administrator cannot be removed.

Public-submission records are independent of accounts. Administrators may individually delete them, after checking obligations/holds. The content/history are removed and only a minimal audit event remains. Audit IDs may still be pseudonymous data and need a reviewed retention policy.

```powershell
npm run staff -- retention
```

This is a **review-only** command: it lists closed/declined/completed enquiries older than the configured review threshold, without deleting anything. There is no automatic blanket retention purge. Backup expiry and legal holds must be managed separately.

## Production deployment

1. Complete launch approvals, verify content/contact/donation instructions, remove test data, create individual least-privilege staff accounts and rehearse the critical journeys.
2. Provision an encrypted persistent volume and protected backup destination. Use a single application instance. Store the database outside the static asset folder; restrict access to the service account and approved operators.
3. On the host, run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Validate browser journeys in an isolated environment with `npm run test:e2e`.
4. Set `NODE_ENV=production`, the verified HTTPS `APP_ORIGIN`, `DATABASE_PATH`, `HOST`, `PORT` and carefully reviewed `TRUST_PROXY`. Do not use any `VITE_` variable for secrets. Do not commit `.env`.
5. Back up the current database, run `npm run db:migrate`, and start using `npm start` under a supervised non-admin OS/service account. The application serves `dist` and `/api`.
6. Terminate TLS at a maintained reverse proxy, redirect HTTP to HTTPS, replace forwarded headers and expose only the proxy port. Configure `TRUST_PROXY=1` only for exactly one trusted proxy. Bind the app loopback unless the container/network topology requires otherwise.
7. Configure the verified domain/DNS, certificate renewal, access controls, disk/CPU/memory monitoring, service restart policy and log retention. HTTPS, certificate and DNS changes are operator actions, not performed by this project.
8. Verify `/api/health`, cookie Secure/HttpOnly/SameSite attributes, origin/CSRF rejection, hidden draft/content behaviour, mobile forms and data persistence after restarting.
9. Record deployment version, operator, migration version, approvals and recovery owner outside the app; monitor errors without logging submitted bodies or secrets.

`npm start` needs the runtime `tsx` dependency. Production containers can install runtime dependencies only after building in a separate stage. The optional Docker recipe has not been validated locally. Pin approved base-image digests and run vulnerability/image scans in your release pipeline.

Do not use `vite preview` as the production backend: it serves assets but does not implement protected API workflows.

## Temporary fictional client review

`npm run review:create -- --credentials "<absolute private JSON path>"` explicitly creates
`data\review.sqlite`, nine separate role accounts with random passwords, and clearly labelled
fictional programmes/applications. It refuses to overwrite an existing review database or credential
file, refuses production provisioning, and never modifies `data\techducate.sqlite`. The credential
directory must already exist outside the project; restrict its Windows NTFS ACLs before running.
Never commit, serve, or upload the credential file. Review fixtures are not seeded by normal startup.
The guardian application is pending with no verified consent; no screening, real donation receipt
or assessed learning is fabricated. The partner account does not imply a partner portal exists.

Build normally, then run a **separate** loopback-only production process using
`DATABASE_PATH=./data/review.sqlite`, a different port, the exact HTTPS review `APP_ORIGIN`,
and both `REVIEW_USERNAME` and `REVIEW_PASSWORD` loaded from the private credential file.
Partial/weak gate configuration fails startup. When configured, HTTP Basic access protects the
entire website, assets and APIs; responses are no-store/no-index and every page shows the fictional
review notice. Application login, roles, explicit permissions, origin and CSRF controls still apply
after passing this outer gate. The gate is optional and disabled by default; never expose a review
copy without it. Use HTTPS for the shared preview; do not put credentials in URLs or logs.

For an approved temporary Cloudflare Quick Tunnel, use the official verified Windows executable
to tunnel only this review port, not Vite or the ordinary database. Set the exact generated HTTPS
origin before allowing application mutations. `TRUST_PROXY=1` is appropriate only when the
loopback-bound server is reached through exactly the trusted local tunnel proxy supplying the
client-address headers. Use info-level tunnel logs, never debug-level request-header logging.
Verify unauthorized root/API/asset requests are denied, all required account journeys work through
HTTPS, and the original database is unchanged before sharing. Send the gate and selected role
credentials privately, separately from any public link.

This is not durable hosting: the link requires the computer, review process, tunnel and network to
remain running. Stop the review server and tunnel after review; a restarted Quick Tunnel may have a
different hostname, requiring an updated `APP_ORIGIN`. Remove/revoke review credentials and review
data under an approved cleanup procedure. Do not use this preview for real children's information,
financial records, safeguarding reports or production operations. No production hosting/domain,
external messaging or payment integration is established by this procedure.

## Backup, restore and rollback

The recovery command uses SQLite's online backup API (including committed WAL data), never a live main-file-only copy. It opens the source read-only without migrating it; it verifies integrity, foreign keys and known migration version before/after copying. The destination directory must be new with an existing parent: no overwrite or live database replacement is performed.

```powershell
Set-Location C:\Users\joanmoturi\techducate
# Operator-provisioned parent must have encryption, restrictive ACLs and adequate free space.
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
npm run recovery -- backup --source "C:\TechducateData\techducate.sqlite" --destination "D:\TechducateBackups\$stamp"
# Back up BEFORE migration/startup; ordinary startup also applies migrations.
npm run db:migrate
npm run recovery -- verify --source "D:\TechducateBackups\$stamp\techducate.sqlite"
# On an isolated recovery host, choose a NEW directory; restore revokes all sessions/reset links.
npm run recovery -- restore --source "D:\TechducateBackups\$stamp\techducate.sqlite" --destination "C:\TechducateRecovery\reviewed-restore"
```

**Proposed policy requiring organisational approval/configuration:** nightly backup plus before every migration/release; retain 30 daily backups and approved monthly snapshots for 12 months, subject to legal holds and privacy minimisation; 24-hour routine recovery-point objective and an operator-agreed restoration-time target. These are recommended operating targets, **not an already running backup service or legal retention rule**. Configure the host scheduler/approved backup service, protect output and alert a named operations owner on nonzero exit, missing backup, disk failure or overdue off-host copy. No host scheduler/cloud storage or automatic deletion was installed.

Backups contain the entire sensitive database. The application does not encrypt database files: use encrypted disks/destinations and approved off-host encryption/key management. POSIX file modes are requested, but **Windows administrators must configure and verify NTFS ACLs**; file mode is not a Windows access-control guarantee. A failed operation may leave a partial destination for investigation; do not label it successful or reuse it. Preserve/check the error and choose a new destination.

For production recovery: stop/isolate the affected service; preserve incident evidence and the failed database; restore into a new private location; verify version, integrity, counts, permissions and representative protected journeys with external providers disabled; set `DATABASE_PATH` to the verified restored file only after sign-off. Restoring to current code migrates a copy and revokes sessions/reset links, so everyone must sign in again. Do not connect this process to the live service until the privacy/safeguarding and operations leads approve reopening.

Migration 001 is unchanged. Additive migrations 002–003 are transactional; a failed migration rolls back its changes. Migration failure must stop deployment. For rollback, retain the matching pre-upgrade artifact and snapshot, restore them in isolation and revoke old credentials before reopening; do not improvise destructive down-migrations or remove records to make a release pass. A SQLite round-trip and version-1 upgrade are automated tests, not a substitute for a timed off-host production restore drill.

Expired consent blocks access but does not automatically delete records. Ordinary enquiry review, safeguarding case-specific disposal, financial/legal holds, learning-record requests and encrypted backup expiry are distinct processes. There is no blanket deletion job. A named privacy/retention owner must approve and document disposal, including copies and backup expiry.

## Monitoring and incidents

Monitor `/api/health`, 5xx frequency, authentication/rate-limit spikes, unexpected administrative changes, disk space, backup results and proxy certificates. Database errors are surfaced as failures, not false success messages. Unexpected API error logs intentionally omit request bodies, but operators must still protect infrastructure logs.

If exposure is suspected, restrict access, revoke affected sessions through approved account recovery/role controls, preserve evidence, involve the safeguarding/privacy lead and obtain legal guidance on reporting/notification obligations. Never send real incident emails or contact minors automatically through a newly added integration.

## Remaining work

No production deployment, domain purchase, paid change, real payment or outbound message was made. A separately approved temporary fictional review preview is not production hosting. External providers remain disabled. Legal review, operational guardian verification, policy approval, verified content, MFA/identity-provider evaluation, production infrastructure/container validation, backup drills and manual accessibility testing are launch prerequisites.

Priority-2 deferrals: individual assets/maintenance/resource-request inventory; pathways, verified individual competencies and certificates/public verification; multi-dependant identity and individual longitudinal progression; richer assessments and analytics. In-kind descriptions and aggregate evidence do not pretend to implement these.

Priority-3 deferrals: alumni directory/community, advanced AI, true offline learning, partner portals/tenant isolation, automated grant reporting/accounting integration, resource forecasting and language packs. Pages use system fonts and route-lazy staff bundles; core navigation/forms remain mobile-first. Future localisation should extract messages, currency/date formatting and translated reviewed notices without reusing consent versions across different meanings. Future offline learning should cache only authorised non-sensitive materials with explicit expiry/permission checks and a conflict-aware authenticated progress outbox; shared devices must not cache child, finance or incident records. Neither is currently implemented.

Other limits: no uploads, automatic reminder/outbox worker, self-service verified email, MFA, case-level conflict walls, immutable external audit sink or full double-entry/payroll system. Backups/monitoring/timed production recovery, independent penetration testing, manual assistive-technology testing and current Kenyan legal review remain launch tasks. External payment, messaging and AI integrations require separately approved providers, credentials, data agreements, sandbox testing and monitored delivery/reconciliation; no real integrations were enabled.
