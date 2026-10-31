import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Plus, ClipboardList, Users, BookOpen, Heart, ShieldCheck } from 'lucide-react'
import {
  programmeTypes,
  fundingModes,
  programmeStatuses,
  enquiryStatuses,
  volunteerStatuses,
  donationStatuses,
  staffRoles,
  type Programme,
  type ProgrammeInput,
  type User,
  type SiteSettings,
  type Enquiry,
  type Application,
  type Lesson,
  type ScheduledSession,
  type StaffAssignment,
} from '../shared/domain'
import {
  api,
  checked,
  dateInput,
  field,
  formatDate,
  isoField,
  label,
  money,
  numberField,
  useResource,
} from './api'
import { useAuth } from './authContext'
import {
  ActionForm,
  ArrowLink,
  Badge,
  Empty,
  Field,
  Loading,
  PageIntro,
  Panel,
  Select,
  TextArea,
} from './ui'
import { EventWorkspace } from './LearningPages'

interface Overview {
  programmes: number | null
  pendingApplications: number | null
  approvedParticipants: number | null
  enquiries: number | null
  donations: { status: string; count: number }[] | null
  money: { currency: string; status: string; amountMinor: number }[] | null
}
export function Admin() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'overview'
  const allowed =
    user?.role === 'finance'
      ? ['overview', 'donation', 'payments']
      : user?.role === 'manager'
        ? ['overview', 'programmes', 'partner', 'volunteer', 'contact']
        : [
            'overview',
            'programmes',
            'partner',
            'volunteer',
            'contact',
            'donation',
            'payments',
            'settings',
            'audit',
          ]
  return (
    <>
      <PageIntro eyebrow="TEAM OPERATIONS" title="Good work. Thoughtfully organised.">
        Recorded activity, real applications and the next decisions that need your attention.
      </PageIntro>
      <section className="container section">
        <Link to="/dashboard" className="text-link back-link">
          ← Back to My learning
        </Link>
        <p>
          <Link className="button secondary" to="/operations">
            Delivery readiness, safeguarding, funding & impact
          </Link>
        </p>
        <nav className="tab-bar" aria-label="Operations sections">
          {allowed.map((value) => (
            <button
              className={value === tab ? 'active' : ''}
              key={value}
              onClick={() => setParams({ tab: value })}
            >
              {label(
                value === 'partner'
                  ? 'partner enquiries'
                  : value === 'donation'
                    ? 'donations'
                    : value,
              )}
            </button>
          ))}
        </nav>
        {!allowed.includes(tab) ? (
          <Empty title="This area isn’t available for your role.">
            Choose one of your permitted operations sections.
          </Empty>
        ) : tab === 'overview' ? (
          <OverviewPanel />
        ) : tab === 'programmes' ? (
          <ProgrammeList />
        ) : tab === 'settings' ? (
          <SettingsPanel />
        ) : tab === 'audit' ? (
          <AuditPanel />
        ) : tab === 'payments' ? (
          <PaymentPanel />
        ) : (
          <EnquiryQueue kind={tab as Enquiry['kind']} />
        )}
      </section>
    </>
  )
}
function OverviewPanel() {
  const result = useResource<Overview>('/staff/overview')
  return (
    <>
      <Loading {...result} retry={result.reload} />
      {result.data && (
        <>
          <div className="stat-grid">
            {[
              { value: result.data.programmes, title: 'Published programmes', icon: BookOpen },
              {
                value: result.data.pendingApplications,
                title: 'Applications to review',
                icon: ClipboardList,
              },
              { value: result.data.approvedParticipants, title: 'Approved places', icon: Users },
              { value: result.data.enquiries, title: 'Open enquiries', icon: Heart },
            ]
              .filter((item) => item.value !== null)
              .map((item) => (
                <div className="stat" key={item.title}>
                  <item.icon size={22} />
                  <strong>{item.value}</strong>
                  <span>{item.title}</span>
                </div>
              ))}
          </div>
          <Panel title="A clear picture, without the guesswork">
            <p>
              All counts come from saved records. Approved places are enrolments, not unique people
              trained. Completion and attendance are available inside each programme report.
            </p>
            <p>
              Pending donation amounts are offers or pledges, not cash received. Received amounts
              await verification. Approved budgets and allocated awards are separate programme
              records.
            </p>
            {result.data.money?.map((row, i) => (
              <p key={i}>
                <Badge green={['verified', 'allocated'].includes(row.status)}>{row.status}</Badge>{' '}
                {money(row.amountMinor, row.currency)}
              </p>
            ))}
            {result.data.donations?.length === 0 && (
              <p className="muted">No donation offers have been recorded.</p>
            )}
          </Panel>
        </>
      )}
    </>
  )
}
function ProgrammeList() {
  const result = useResource<{ programmes: Programme[] }>('/staff/programmes')
  const { user } = useAuth()
  return (
    <>
      <div className="heading-row">
        <h2>Your programme catalogue</h2>
        <ArrowLink to="/admin/programmes/new">Create programme</ArrowLink>
      </div>
      <Loading {...result} retry={result.reload} />
      {result.data &&
        (result.data.programmes.length ? (
          <div className="record-list">
            {result.data.programmes.map((p) => (
              <div className="record panel" key={p.id}>
                <div>
                  <div className="badge-row">
                    <Badge green={p.status === 'open'}>{label(p.status)}</Badge>
                    <Badge>{label(p.type)}</Badge>
                  </div>
                  <h3>{p.title}</h3>
                  <p>
                    {p.enrolled} approved / {p.capacity} configured places
                  </p>
                </div>
                <div className="button-row">
                  <Link className="button secondary" to={`/manage/${p.id}`}>
                    Operations <ArrowRight size={16} />
                  </Link>
                  {user?.role === 'admin' && (
                    <Link className="text-link" to={`/admin/programmes/${p.id}/edit`}>
                      Configure
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Create the first real opportunity.">
            No programmes have been created. Start with a draft, configure capacity and eligibility,
            then publish when ready.
          </Empty>
        ))}
    </>
  )
}
function collectProgramme(data: FormData, enabled: string[]): ProgrammeInput {
  const criteria = field(data, 'criteria')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, maximum] = line.split('|')
      return { name: name.trim(), maxScore: Number(maximum?.trim()) }
    })
  return {
    title: field(data, 'title'),
    summary: field(data, 'summary'),
    description: field(data, 'description'),
    type: field(data, 'type') as ProgrammeInput['type'],
    topic: field(data, 'topic') as ProgrammeInput['topic'],
    audience: field(data, 'audience') as ProgrammeInput['audience'],
    experience: field(data, 'experience'),
    delivery: field(data, 'delivery') as ProgrammeInput['delivery'],
    location: field(data, 'location'),
    objectives: field(data, 'objectives'),
    eligibility: field(data, 'eligibility'),
    status: field(data, 'status') as ProgrammeInput['status'],
    publishAt: isoField(data, 'publishAt'),
    registrationOpens: isoField(data, 'registrationOpens'),
    registrationCloses: isoField(data, 'registrationCloses'),
    startsAt: isoField(data, 'startsAt'),
    endsAt: isoField(data, 'endsAt'),
    waitlist: checked(data, 'waitlist'),
    funding: enabled.map((mode) => ({
      mode: mode as ProgrammeInput['funding'][number]['mode'],
      capacity: numberField(data, `${mode}-capacity`),
      feeMinor: Math.round(numberField(data, `${mode}-fee`) * 100),
      currency: field(data, `${mode}-currency`) || 'KES',
      sponsor: field(data, `${mode}-sponsor`),
      committedMinor: Math.round(numberField(data, `${mode}-committed`) * 100),
      receivedMinor: Math.round(numberField(data, `${mode}-received`) * 100),
      budgetMinor: Math.round(numberField(data, `${mode}-budget`) * 100),
      awardMinor: Math.round(numberField(data, `${mode}-award`) * 100),
    })),
    event: {
      teamsEnabled: checked(data, 'teamsEnabled'),
      teamSize: numberField(data, 'teamSize') || 4,
      deadline: isoField(data, 'deadline'),
      challenge: field(data, 'challenge'),
      rules: field(data, 'rules'),
      criteria,
      resultsPublished: checked(data, 'resultsPublished'),
    },
  }
}
export function ProgrammeEditor() {
  const { id } = useParams()
  const result = useResource<{ programme: Programme }>(id ? `/staff/programmes/${id}` : null)
  const navigate = useNavigate()
  return (
    <>
      <PageIntro
        eyebrow="PROGRAMME CONFIGURATION"
        title={id ? 'Make the details work together.' : 'Create the next opportunity.'}
      >
        Start with a draft. Set clear access rules, dates and allocations before publishing.
      </PageIntro>
      <section className="container section">
        <Link to="/admin?tab=programmes" className="text-link back-link">
          ← Back to catalogue
        </Link>
        {id && <Loading {...result} retry={result.reload} />}
        {(!id || result.data) && (
          <ProgrammeForm
            key={id ?? 'new'}
            existing={result.data?.programme}
            onSave={async (input) => {
              const response = await api<{ programme: Programme }>(
                id ? `/staff/programmes/${id}` : '/staff/programmes',
                id ? 'PUT' : 'POST',
                input,
              )
              navigate(`/manage/${response.programme.id}`)
            }}
          />
        )}
      </section>
    </>
  )
}
function ProgrammeForm({
  existing: p,
  onSave,
}: {
  existing?: Programme
  onSave: (input: ProgrammeInput) => Promise<void>
}) {
  const { user } = useAuth()
  const [enabled, setEnabled] = useState<string[]>(p?.funding.map((f) => f.mode) ?? ['free'])
  const [type, setType] = useState(p?.type ?? 'course')
  const financial = user?.role === 'admin'
  return (
    <ActionForm
      submit={p ? 'Save programme configuration' : 'Create draft programme'}
      onSubmit={(data) => onSave(collectProgramme(data, enabled))}
    >
      <div className="editor-grid">
        <div>
          <Panel title="The opportunity">
            <Field
              label="Programme title"
              name="title"
              defaultValue={p?.title}
              maxLength={150}
              required
            />
            <TextArea
              label="Short summary"
              name="summary"
              defaultValue={p?.summary}
              maxLength={400}
              rows={2}
              required
            />
            <TextArea
              label="Description"
              name="description"
              defaultValue={p?.description}
              maxLength={12000}
              required
            />
            <div className="form-row">
              <Select
                label="Programme type"
                name="type"
                options={programmeTypes}
                value={type}
                onChange={(event) => setType(event.target.value as Programme['type'])}
              />
              <Select
                label="Topic"
                name="topic"
                options={['digital-literacy', 'coding', 'ai', 'robotics', 'web', 'innovation']}
                defaultValue={p?.topic}
              />
            </div>
            <div className="form-row">
              <Select
                label="Audience"
                name="audience"
                options={['all', 'children', 'youth', 'adults']}
                defaultValue={p?.audience}
              />
              <Field
                label="Prior experience"
                name="experience"
                defaultValue={p?.experience ?? 'No prior experience needed'}
                maxLength={150}
                required
              />
            </div>
            <TextArea
              label="Learning objectives (optional)"
              name="objectives"
              defaultValue={p?.objectives}
              maxLength={4000}
            />
            <TextArea
              label="Eligibility & application requirements"
              name="eligibility"
              defaultValue={p?.eligibility}
              maxLength={4000}
            />
            <div className="form-row">
              <Select
                label="Delivery"
                name="delivery"
                options={['in-person', 'virtual', 'hybrid']}
                defaultValue={p?.delivery}
              />
              <Field
                label="Public location (no private joining links)"
                name="location"
                defaultValue={p?.location}
                maxLength={200}
              />
            </div>
          </Panel>
          <Panel title="Participation & funding">
            <p className="muted small">
              Capacities are separate allocations and add up to the total capacity. Amounts below
              are in major currency units; stored as integer minor units. Scholarships and
              invitations always require staff review.
            </p>
            <div className="tag-cloud">
              {fundingModes
                .filter((mode) => financial || !['paid', 'subsidised'].includes(mode))
                .map((mode) => (
                  <label className="funding-toggle" key={mode}>
                    <input
                      type="checkbox"
                      checked={enabled.includes(mode)}
                      onChange={(event) =>
                        setEnabled((previous) =>
                          event.target.checked
                            ? [...previous, mode]
                            : previous.filter((value) => value !== mode),
                        )
                      }
                    />
                    {label(mode)}
                  </label>
                ))}
            </div>
            {enabled.map((mode) => {
              const old = p?.funding.find((f) => f.mode === mode)
              return (
                <div className="funding-editor" key={mode}>
                  <h3>{label(mode)} places</h3>
                  <div className="form-row">
                    <Field
                      label="Places"
                      name={`${mode}-capacity`}
                      type="number"
                      min={0}
                      max={10000}
                      defaultValue={old?.capacity ?? 10}
                      required
                    />
                    <Field
                      label="Currency"
                      name={`${mode}-currency`}
                      defaultValue={old?.currency ?? 'KES'}
                      pattern="[A-Z]{3}"
                      maxLength={3}
                      readOnly={!financial}
                      required
                    />
                    {['paid', 'subsidised'].includes(mode) && (
                      <Field
                        label="Participant fee"
                        name={`${mode}-fee`}
                        type="number"
                        min={0.01}
                        step="0.01"
                        max={1000000}
                        defaultValue={(old?.feeMinor ?? 0) / 100}
                        required
                      />
                    )}
                  </div>
                  {financial && (
                    <>
                      <Field
                        label="Sponsor / funding source (private, optional)"
                        name={`${mode}-sponsor`}
                        defaultValue={old?.sponsor}
                        maxLength={200}
                      />
                      <div className="form-row">
                        <Field
                          label="Amount committed / pledged"
                          type="number"
                          min={0}
                          step="0.01"
                          max={10000000}
                          name={`${mode}-committed`}
                          defaultValue={(old?.committedMinor ?? 0) / 100}
                        />
                        <Field
                          label="Actual funding received"
                          type="number"
                          min={0}
                          step="0.01"
                          max={10000000}
                          name={`${mode}-received`}
                          defaultValue={(old?.receivedMinor ?? 0) / 100}
                        />
                      </div>
                      <div className="form-row">
                        <Field
                          label="Approved award budget"
                          type="number"
                          min={0}
                          step="0.01"
                          max={10000000}
                          name={`${mode}-budget`}
                          defaultValue={(old?.budgetMinor ?? 0) / 100}
                        />
                        <Field
                          label="Award cost per approved place"
                          type="number"
                          min={0}
                          step="0.01"
                          max={1000000}
                          name={`${mode}-award`}
                          defaultValue={(old?.awardMinor ?? 0) / 100}
                        />
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </Panel>
          {['hackathon', 'competition'].includes(type) && (
            <Panel title="Innovation event configuration">
              <Field
                label="Enable teams"
                type="checkbox"
                name="teamsEnabled"
                defaultChecked={p?.event.teamsEnabled}
              />
              <Field
                label="Maximum team members"
                name="teamSize"
                type="number"
                min={1}
                max={20}
                defaultValue={p?.event.teamSize ?? 4}
                required
              />
              <Field
                label="Submission deadline (local time)"
                name="deadline"
                type="datetime-local"
                defaultValue={dateInput(p?.event.deadline ?? null)}
              />
              <TextArea
                label="Challenge statement"
                name="challenge"
                defaultValue={p?.event.challenge}
                maxLength={5000}
              />
              <TextArea
                label="Rules, milestones & prizes (only if confirmed)"
                name="rules"
                defaultValue={p?.event.rules}
                maxLength={5000}
              />
              <TextArea
                label="Judging rubric: one criterion | maximum score per line"
                name="criteria"
                defaultValue={p?.event.criteria.map((c) => `${c.name} | ${c.maxScore}`).join('\n')}
                maxLength={1500}
              />
              <Field
                type="checkbox"
                label="Release scores and winner selections to the submitting participants (not public)"
                name="resultsPublished"
                defaultChecked={p?.event.resultsPublished}
              />
            </Panel>
          )}
        </div>
        <aside>
          <Panel title="Publication & timing">
            <Select
              label="Status"
              name="status"
              options={programmeStatuses}
              defaultValue={p?.status ?? 'draft'}
            />
            <p className="muted small">
              Draft and archived records are private. Other statuses become public only at or after
              publication time. A scheduled programme accepts applications only inside its
              registration window.
            </p>
            <Field
              label="Publish at (local time, optional)"
              name="publishAt"
              type="datetime-local"
              defaultValue={dateInput(p?.publishAt ?? null)}
            />
            {[
              ['registrationOpens', 'Registration opens'],
              ['registrationCloses', 'Registration closes'],
              ['startsAt', 'Programme starts'],
              ['endsAt', 'Programme ends'],
            ].map(([key, title]) => (
              <Field
                label={`${title} (local time)`}
                name={key}
                type="datetime-local"
                key={key}
                defaultValue={dateInput(p?.[key as 'startsAt'] ?? null)}
              />
            ))}
            <Field
              label="Allow a waiting list"
              type="checkbox"
              name="waitlist"
              defaultChecked={p?.waitlist ?? true}
            />
          </Panel>
          <div className="care-note">
            <ShieldCheck size={24} />
            <h3>Publish with care.</h3>
            <p>
              No invented partners, historical claims or guaranteed outcomes. Keep private meeting
              links in scheduled sessions, not public descriptions.
            </p>
            <p>
              Guardians submit applications for children. Staff verify consent before approval.
              Amounts and sponsor details are restricted to administrators.
            </p>
          </div>
        </aside>
      </div>
    </ActionForm>
  )
}
function SettingsPanel() {
  const result = useResource<{ settings: SiteSettings }>('/settings')
  return (
    <>
      <Loading {...result} retry={result.reload} />
      {result.data && (
        <Panel title="Verified organisation settings">
          <ActionForm
            submit="Save organisation settings"
            onSubmit={async (data) => {
              await api('/settings', 'PUT', {
                contactEmail: field(data, 'contactEmail'),
                contactLocation: field(data, 'contactLocation'),
                legalName: field(data, 'legalName'),
                privacyContact: field(data, 'privacyContact'),
                donationInstructions: field(data, 'donationInstructions'),
                safeguardingInstructions: field(data, 'safeguardingInstructions'),
                retentionDays: numberField(data, 'retentionDays'),
              })
              result.reload()
            }}
          >
            <p>
              Only enter verified details authorised for public display. No online payment, AI or
              external messaging provider is connected.
            </p>
            <div className="form-row">
              <Field
                label="Public contact email"
                name="contactEmail"
                type="email"
                defaultValue={result.data.settings.contactEmail}
                maxLength={254}
              />
              <Field
                label="Privacy contact email"
                name="privacyContact"
                type="email"
                defaultValue={result.data.settings.privacyContact}
                maxLength={254}
              />
            </div>
            <div className="form-row">
              <Field
                label="Verified legal entity name (optional)"
                name="legalName"
                defaultValue={result.data.settings.legalName}
                maxLength={200}
              />
              <Field
                label="Public location (optional)"
                name="contactLocation"
                defaultValue={result.data.settings.contactLocation}
                maxLength={150}
              />
            </div>
            <TextArea
              label="Verified donation methods & instructions (public)"
              name="donationInstructions"
              defaultValue={result.data.settings.donationInstructions}
              maxLength={4000}
            />
            <TextArea
              label="Reviewed safeguarding contact & escalation instructions (public)"
              name="safeguardingInstructions"
              defaultValue={result.data.settings.safeguardingInstructions}
              maxLength={4000}
            />
            <Field
              label="Closed enquiry retention review threshold (days)"
              name="retentionDays"
              type="number"
              min={30}
              max={3650}
              defaultValue={result.data.settings.retentionDays}
              required
            />
          </ActionForm>
        </Panel>
      )}
    </>
  )
}
function EnquiryQueue({ kind }: { kind: Enquiry['kind'] }) {
  const result = useResource<{ enquiries: Enquiry[] }>(`/staff/enquiries?kind=${kind}`)
  const staff = useResource<{ users: User[] }>('/staff/users')
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const { user } = useAuth()
  const statuses =
    kind === 'donation'
      ? donationStatuses
      : kind === 'volunteer'
        ? volunteerStatuses
        : enquiryStatuses
  const enquiries = result.data?.enquiries.filter(
    (row) =>
      (!filter || row.status === filter) &&
      `${row.data.name} ${row.data.email} ${row.data.organisation}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  return (
    <>
      <div className="heading-row">
        <h2>{label(kind)} review queue</h2>
        <a className="button secondary" href={`/api/staff/export?kind=${kind}`}>
          Export private CSV <ArrowRight size={16} />
        </a>
      </div>
      <p className="small muted">
        Contains personal information. Export only when necessary and store securely. Up to the
        latest 500 records are shown; the CSV includes all records.
      </p>
      <div className="filter-bar">
        <Select
          label="Filter status"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          options={[
            { value: '', name: 'All statuses' },
            ...statuses.map((value) => ({ value, name: label(value) })),
          ]}
        />
        <Field
          label="Search name, email or organisation"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <Loading {...result} retry={result.reload} />
      {enquiries &&
        (enquiries.length ? (
          enquiries.map((enquiry) => (
            <EnquiryRecord
              key={`${enquiry.id}-${kind}`}
              enquiry={enquiry}
              users={staff.data?.users ?? (user ? [user] : [])}
              reload={result.reload}
            />
          ))
        ) : (
          <Empty title="Nothing in this queue right now.">
            Matching public submissions appear here for staff review.
          </Empty>
        ))}
    </>
  )
}
function EnquiryRecord({
  enquiry: row,
  users,
  reload,
}: {
  enquiry: Enquiry
  users: User[]
  reload: () => void
}) {
  const { user } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const history = useResource<{
    history: { status: string; note: string; name: string | null; createdAt: string }[]
  }>(expanded ? `/staff/enquiries/${row.id}/history` : null)
  const [converting, setConverting] = useState(false)
  const navigate = useNavigate()
  const statuses =
    row.kind === 'donation'
      ? donationStatuses
      : row.kind === 'volunteer'
        ? volunteerStatuses
        : enquiryStatuses
  return (
    <Panel>
      <div className="heading-row">
        <div>
          <Badge green={['accepted', 'verified', 'allocated'].includes(row.status)}>
            {label(row.status)}
          </Badge>
          <h3>{row.data.organisation || row.data.name}</h3>
          <p>
            <a href={`mailto:${row.data.email}`}>{row.data.email}</a> · {formatDate(row.createdAt)}
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? 'Close review' : 'Review submission'}
        </button>
      </div>
      {expanded && (
        <>
          <div className="submission-details">
            {Object.entries(row.data)
              .filter(
                ([key, value]) =>
                  !['consent', 'website', 'kind', 'name', 'email', 'amountMinor'].includes(key) &&
                  value !== '' &&
                  value !== 0,
              )
              .filter(
                ([key]) => row.kind === 'donation' || !['currency', 'donationType'].includes(key),
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{label(key)}</dt>
                  <dd className="preserve">{String(value)}</dd>
                </div>
              ))}
            {row.kind === 'donation' && (
              <div>
                <dt>Amount offered (not a receipt)</dt>
                <dd>{money(row.data.amountMinor, row.data.currency)}</dd>
              </div>
            )}
          </div>
          <p className="small muted">Reference: {row.id} · Privacy acknowledgement recorded.</p>
          <ActionForm
            submit="Save review & history"
            onSubmit={async (data) => {
              await api(`/staff/enquiries/${row.id}`, 'PATCH', {
                status: field(data, 'status'),
                notes: field(data, 'notes'),
                assignedTo: field(data, 'assignedTo') || null,
                ...(row.kind === 'donation'
                  ? {
                      receivedAmountMinor: Math.round(numberField(data, 'receivedAmount') * 100),
                      receiptCurrency: field(data, 'receiptCurrency'),
                      receiptReference: field(data, 'receiptReference'),
                    }
                  : {}),
              })
              reload()
            }}
          >
            <div className="form-row">
              <Select
                label="Review status"
                name="status"
                options={statuses}
                defaultValue={row.status}
              />
              <Select
                label="Responsible team member"
                name="assignedTo"
                defaultValue={row.assignedTo ?? ''}
                options={[
                  { value: '', name: 'Unassigned' },
                  ...users
                    .filter((u) =>
                      (row.kind === 'donation'
                        ? ['admin', 'finance']
                        : ['admin', 'manager']
                      ).includes(u.role),
                    )
                    .map((u) => ({ value: u.id, name: u.name })),
                ]}
              />
            </div>
            {row.kind === 'donation' && (
              <>
                <div className="form-row">
                  <Field
                    label="Actual monetary amount received (not pledged)"
                    name="receivedAmount"
                    type="number"
                    step="0.01"
                    min={0}
                    max={10000000}
                    defaultValue={(row.receivedAmountMinor ?? 0) / 100}
                  />
                  <Field
                    label="Receipt currency"
                    name="receiptCurrency"
                    pattern="[A-Z]{3}"
                    maxLength={3}
                    defaultValue={row.receiptCurrency ?? row.data.currency}
                    required
                  />
                </div>
                <Field
                  label="Actual receipt / equipment receipt reference"
                  name="receiptReference"
                  maxLength={300}
                  defaultValue={row.receiptReference}
                  hint="Required before recording receipt, verification or allocation. Do not copy card details."
                />
              </>
            )}
            <TextArea
              label="Internal notes (never emailed)"
              name="notes"
              defaultValue={row.notes}
              maxLength={5000}
            />
          </ActionForm>
          <h3>Status history</h3>
          <Loading {...history} retry={history.reload} />
          {history.data?.history.map((event, i) => (
            <p className="small" key={i}>
              <strong>{label(event.status)}</strong> · {event.name ?? 'Deleted staff account'} ·{' '}
              {formatDate(event.createdAt)}
              <br />
              {event.note}
            </p>
          ))}
          {row.kind === 'partner' && row.status === 'accepted' && !row.programmeId && (
            <>
              <button className="button secondary" onClick={() => setConverting((value) => !value)}>
                Prepare programme from enquiry <Plus size={16} />
              </button>
              {converting && (
                <div className="conversion-form">
                  <h3>Configure the agreed programme</h3>
                  <p>
                    The new programme stays a private draft until an administrator publishes it.
                  </p>
                  <ProgrammeForm
                    existing={enquiryDraft(row)}
                    onSave={async (input) => {
                      const result = await api<{ programme: Programme }>(
                        `/staff/enquiries/${row.id}/convert`,
                        'POST',
                        input,
                      )
                      navigate(`/manage/${result.programme.id}`)
                    }}
                  />
                </div>
              )}
            </>
          )}
          {row.programmeId && (
            <Link className="text-link" to={`/manage/${row.programmeId}`}>
              Open linked programme <ArrowRight size={16} />
            </Link>
          )}
          {user?.role === 'admin' && (
            <details className="help-details">
              <summary>Privacy & retention: delete this submission</summary>
              <ActionForm
                submit="Permanently delete submission"
                onSubmit={async () => {
                  await api(`/staff/enquiries/${row.id}`, 'DELETE', {})
                  reload()
                }}
              >
                <p>
                  Check retention obligations and financial/legal holds first. This also deletes its
                  review history; a minimal administrative audit event is retained.
                </p>
                <Field
                  type="checkbox"
                  label="I have reviewed retention requirements and authorise permanent deletion."
                  name="confirm"
                  required
                />
              </ActionForm>
            </details>
          )}
        </>
      )}
    </Panel>
  )
}
function enquiryDraft(row: Enquiry): Programme {
  return {
    id: '',
    title: `${row.data.organisation}: ${label(row.data.service)}`,
    summary: row.data.participants,
    description: row.data.message,
    type: row.data.service === 'hackathon' ? 'hackathon' : 'workshop',
    topic: 'innovation',
    audience: 'all',
    experience: 'To be agreed with the organisation',
    delivery: ['in-person', 'virtual', 'hybrid'].includes(row.data.delivery)
      ? (row.data.delivery as Programme['delivery'])
      : 'hybrid',
    location: row.data.location,
    objectives: '',
    eligibility: '',
    status: 'draft',
    publishAt: null,
    registrationOpens: null,
    registrationCloses: null,
    startsAt: null,
    endsAt: null,
    waitlist: true,
    enrolled: 0,
    capacity: 10,
    funding: [
      {
        mode: 'partner',
        capacity: 10,
        feeMinor: 0,
        currency: 'KES',
        sponsor: '',
        committedMinor: 0,
        receivedMinor: 0,
        budgetMinor: 0,
        awardMinor: 0,
      },
    ],
    event: {
      teamsEnabled: false,
      teamSize: 4,
      deadline: null,
      challenge: '',
      rules: '',
      criteria: [],
      resultsPublished: false,
    },
  }
}
function PaymentPanel() {
  const result = useResource<{
    applications: {
      id: string
      title: string
      participantName: string
      paymentStatus: string
      paymentReference: string
      feeMinor: number
      currency: string
    }[]
  }>('/finance/applications')
  return (
    <Panel title="Manual programme payment verification">
      <p>
        This platform does not process payments. Verify against an actual receipt or an approved
        offline reconciliation process. A verified payment still requires a separate application
        approval.
      </p>
      <Loading {...result} retry={result.reload} />
      {result.data?.applications.map((a) => (
        <div className="funding-editor" key={a.id}>
          <h3>
            {a.title} · {a.participantName}
          </h3>
          <p>
            {money(a.feeMinor, a.currency)} · Current status: {label(a.paymentStatus)}
          </p>
          <ActionForm
            submit="Record payment review"
            onSubmit={async (data) => {
              await api(`/finance/applications/${a.id}`, 'PATCH', {
                paymentStatus: field(data, 'paymentStatus'),
                reference: field(data, 'reference'),
              })
              result.reload()
            }}
          >
            <div className="form-row">
              <Select
                label="Payment status"
                name="paymentStatus"
                options={['pending', 'verified', 'failed', 'refunded']}
                defaultValue={a.paymentStatus}
              />
              <Field
                label="Verified receipt / review reference"
                name="reference"
                defaultValue={a.paymentReference}
                maxLength={300}
                required
              />
            </div>
          </ActionForm>
        </div>
      ))}
      {result.data?.applications.length === 0 && (
        <Empty title="No paid applications to review.">
          Paid and subsidised programme applications appear here.
        </Empty>
      )}
    </Panel>
  )
}
function AuditPanel() {
  const result = useResource<{
    events: {
      id: string
      action: string
      resourceId: string
      name: string | null
      createdAt: string
    }[]
  }>('/staff/audit')
  return (
    <Panel title="Administrative audit trail">
      <p>
        Latest 200 events. Notes, passwords, contact form content and payment credentials are not
        copied into this log.
      </p>
      <Loading {...result} retry={result.reload} />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Actor</th>
              <th>Resource</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {result.data?.events.map((event) => (
              <tr key={event.id}>
                <td>{event.action}</td>
                <td>{event.name ?? 'CLI / system / removed account'}</td>
                <td>
                  <code>{event.resourceId}</code>
                </td>
                <td>{formatDate(event.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export function ProgrammeOperations() {
  const { id } = useParams()
  const { user } = useAuth()
  const programme = useResource<{ programme: Programme; assignment?: string }>(
    `/staff/programmes/${id}`,
  )
  const [tab, setTab] = useState('applications')
  const manager = ['admin', 'manager'].includes(user?.role ?? '')
  const judge = programme.data?.assignment === 'judge'
  const available = manager
    ? ['applications', 'lessons', 'schedule', 'attendance', 'projects', 'assignments', 'report']
    : judge
      ? ['projects']
      : ['lessons', 'schedule', 'attendance', 'projects', 'report']
  const active = available.includes(tab) ? tab : available[0]
  const isEvent =
    programme.data && ['hackathon', 'competition'].includes(programme.data.programme.type)
  return (
    <>
      <PageIntro
        eyebrow="PROGRAMME OPERATIONS"
        title={programme.data?.programme.title ?? 'Your assigned programme'}
      >
        Manage the work, keep access scoped and follow the progress that’s actually recorded.
      </PageIntro>
      <section className="container section">
        {!judge && (
          <p>
            <Link className="button secondary" to={`/operations?tab=delivery&programme=${id}`}>
              Readiness, impact evidence & announcements
            </Link>
          </p>
        )}
        <div className="dashboard-toolbar">
          <Link className="text-link" to={manager ? '/admin?tab=programmes' : '/dashboard'}>
            ← Back to {manager ? 'catalogue' : 'My learning'}
          </Link>
          {user?.role === 'admin' && (
            <Link className="button secondary" to={`/admin/programmes/${id}/edit`}>
              Configure programme
            </Link>
          )}
        </div>
        <Loading {...programme} retry={programme.reload} />
        {programme.data && (
          <>
            <nav className="tab-bar" aria-label="Programme operations">
              {available
                .filter((value) => value !== 'projects' || isEvent)
                .map((value) => (
                  <button
                    key={value}
                    className={active === value ? 'active' : ''}
                    onClick={() => setTab(value)}
                  >
                    {label(value)}
                  </button>
                ))}
            </nav>
            {active === 'applications' ? (
              <ApplicationQueue id={id!} />
            ) : active === 'lessons' ? (
              <LessonEditor id={id!} />
            ) : active === 'schedule' ? (
              <ScheduleEditor id={id!} />
            ) : active === 'attendance' ? (
              <AttendanceEditor id={id!} />
            ) : active === 'assignments' ? (
              <Assignments id={id!} />
            ) : active === 'report' ? (
              <ProgrammeReport id={id!} />
            ) : (
              isEvent && (
                <EventWorkspace
                  programme={programme.data.programme}
                  staff
                  canJudge={judge || manager}
                />
              )
            )}
          </>
        )}
      </section>
    </>
  )
}
function ApplicationQueue({ id }: { id: string }) {
  const result = useResource<{ applications: Application[] }>(
    `/staff/programmes/${id}/applications`,
  )
  const [filter, setFilter] = useState('pending')
  const records = result.data?.applications.filter((a) => !filter || a.status === filter)
  return (
    <Panel title="Application review">
      <p>
        Verify eligibility and guardian consent through the organisation’s approved process.
        Approving a scholarship or sponsored application allocates that place and its configured
        award cost.
      </p>
      <Select
        label="Filter status"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        options={[
          { value: '', name: 'All statuses' },
          ...['pending', 'approved', 'waitlisted', 'declined', 'withdrawn'].map((value) => ({
            value,
            name: label(value),
          })),
        ]}
      />
      <Loading {...result} retry={result.reload} />
      {records?.map((a) => (
        <div className="application-record" key={a.id}>
          <div className="badge-row">
            <Badge>{label(a.status)}</Badge>
            <Badge green>{label(a.mode)}</Badge>
          </div>
          <h3>
            {a.participantName} · {a.ageBand}
          </h3>
          <p>Account contact: {a.email}</p>
          <p className="preserve">{a.motivation || 'No motivation note provided.'}</p>
          {a.ageBand !== '18+' && (
            <p>
              Guardian: {a.guardianName} · {a.guardianEmail} · Declaration{' '}
              {a.guardianConsent ? 'provided' : 'missing'}
            </p>
          )}
          {['paid', 'subsidised'].includes(a.mode) && (
            <p>
              Payment status: <strong>{label(a.paymentStatus)}</strong>
            </p>
          )}
          <ActionForm
            submit="Record application decision"
            onSubmit={async (data) => {
              await api(`/staff/applications/${a.id}`, 'PATCH', {
                status: field(data, 'status'),
                consentVerified: a.consentVerified,
                notes: field(data, 'notes'),
              })
              result.reload()
            }}
          >
            <Select
              label="Decision"
              name="status"
              options={['pending', 'approved', 'waitlisted', 'declined', 'withdrawn']}
              defaultValue={a.status}
            />
            {a.ageBand !== '18+' && (
              <p>
                Guardian participation permission:{' '}
                {a.consentVerified
                  ? 'currently verified'
                  : 'not yet verified / expired or withdrawn'}
                .{' '}
                <Link to="/operations?tab=safeguarding">
                  An authorised safeguarding officer must review the evidence separately.
                </Link>{' '}
                An application decision cannot establish guardian consent.
              </p>
            )}
            <TextArea
              label="Internal review notes (do not enter identity documents)"
              name="notes"
              defaultValue={a.notes}
              maxLength={4000}
            />
          </ActionForm>
        </div>
      ))}
      {records?.length === 0 && (
        <Empty title="No applications matching this status.">
          New applications will be available here for review.
        </Empty>
      )}
    </Panel>
  )
}
function LessonEditor({ id }: { id: string }) {
  const result = useResource<{ lessons: Lesson[] }>(`/programmes/${id}/lessons`)
  const [editing, setEditing] = useState<Lesson | null>(null)
  return (
    <Panel title="Modules & lessons">
      <Loading {...result} retry={result.reload} />
      <div className="record-list">
        {result.data?.lessons.map((lesson) => (
          <div className="record" key={lesson.id}>
            <div>
              <Badge green={lesson.published}>{lesson.published ? 'Published' : 'Draft'}</Badge>
              <h3>{lesson.title}</h3>
              <p>
                {lesson.module} · Order {lesson.position}
              </p>
            </div>
            <button className="text-button" onClick={() => setEditing(lesson)}>
              Edit lesson
            </button>
          </div>
        ))}
      </div>
      <h3>{editing ? 'Edit lesson' : 'Create a lesson'}</h3>
      {editing && (
        <button className="text-button" onClick={() => setEditing(null)}>
          Cancel editing
        </button>
      )}
      <ActionForm
        key={editing?.id ?? 'new'}
        submit={editing ? 'Save lesson' : 'Add lesson'}
        onSubmit={async (data) => {
          await api(
            `/staff/programmes/${id}/lessons${editing ? `/${editing.id}` : ''}`,
            editing ? 'PUT' : 'POST',
            {
              title: field(data, 'title'),
              module: field(data, 'module'),
              body: field(data, 'body'),
              position: numberField(data, 'position'),
              published: checked(data, 'published'),
            },
          )
          setEditing(null)
          result.reload()
        }}
      >
        <div className="form-row">
          <Field
            label="Lesson title"
            name="title"
            defaultValue={editing?.title}
            maxLength={200}
            required
          />
          <Field
            label="Module title"
            name="module"
            defaultValue={editing?.module}
            maxLength={150}
            required
          />
          <Field
            label="Order"
            name="position"
            type="number"
            min={0}
            max={1000}
            defaultValue={editing?.position ?? result.data?.lessons.length ?? 0}
            required
          />
        </div>
        <TextArea
          label="Learning content (plain text; no HTML)"
          name="body"
          defaultValue={editing?.body}
          maxLength={30000}
          rows={10}
          required
        />
        <Field
          type="checkbox"
          label="Publish this lesson to approved participants"
          name="published"
          defaultChecked={editing?.published ?? false}
        />
      </ActionForm>
    </Panel>
  )
}
function ScheduleEditor({ id }: { id: string }) {
  const result = useResource<{ sessions: ScheduledSession[] }>(`/programmes/${id}/schedule`)
  const [editing, setEditing] = useState<ScheduledSession | null>(null)
  return (
    <Panel title="Programme schedule">
      <Loading {...result} retry={result.reload} />
      {result.data?.sessions.map((session) => (
        <div className="record" key={session.id}>
          <div>
            <h3>{session.title}</h3>
            <p>
              {formatDate(session.startsAt)} – {formatDate(session.endsAt)}
            </p>
            <p>{session.location}</p>
          </div>
          <button className="text-button" onClick={() => setEditing(session)}>
            Edit session
          </button>
        </div>
      ))}
      <h3>{editing ? 'Edit session' : 'Schedule a session'}</h3>
      {editing && (
        <button className="text-button" onClick={() => setEditing(null)}>
          Cancel editing
        </button>
      )}
      <ActionForm
        key={editing?.id ?? 'new'}
        submit={editing ? 'Save session changes' : 'Schedule session'}
        onSubmit={async (data) => {
          await api(
            `/staff/programmes/${id}/schedule${editing ? `/${editing.id}` : ''}`,
            editing ? 'PUT' : 'POST',
            {
              title: field(data, 'title'),
              startsAt: isoField(data, 'startsAt'),
              endsAt: isoField(data, 'endsAt'),
              location: field(data, 'location'),
              joiningUrl: field(data, 'joiningUrl'),
            },
          )
          setEditing(null)
          result.reload()
        }}
      >
        <Field
          label="Session title"
          name="title"
          defaultValue={editing?.title}
          maxLength={150}
          required
        />
        <div className="form-row">
          <Field
            label="Starts (local time)"
            type="datetime-local"
            name="startsAt"
            defaultValue={dateInput(editing?.startsAt ?? null)}
            required
          />
          <Field
            label="Ends (local time)"
            type="datetime-local"
            name="endsAt"
            defaultValue={dateInput(editing?.endsAt ?? null)}
            required
          />
        </div>
        <Field
          label="Location or room"
          name="location"
          defaultValue={editing?.location}
          maxLength={300}
        />
        <Field
          label="Private joining link (HTTPS, optional)"
          name="joiningUrl"
          type="url"
          pattern="https://.*"
          defaultValue={editing?.joiningUrl}
          maxLength={2000}
        />
        <p className="small muted">
          Schedule changes appear in the same live record for staff and approved participants.
          Conflicting sessions are rejected.
        </p>
      </ActionForm>
    </Panel>
  )
}
function AttendanceEditor({ id }: { id: string }) {
  const people = useResource<{
    participants: { userId: string; name: string }[]
    attendance: { sessionId: string; userId: string; status: string }[]
  }>(`/staff/programmes/${id}/attendance`)
  const schedule = useResource<{ sessions: ScheduledSession[] }>(`/programmes/${id}/schedule`)
  const [selected, setSelected] = useState('')
  const sessionId = selected || schedule.data?.sessions[0]?.id || ''
  return (
    <Panel title="Attendance">
      <Loading {...people} retry={people.reload} />
      <Loading {...schedule} retry={schedule.reload} />
      {people.data && schedule.data && (
        <>
          {schedule.data.sessions.length ? (
            <>
              <Select
                label="Session"
                value={sessionId}
                onChange={(event) => setSelected(event.target.value)}
                options={schedule.data.sessions.map((s) => ({
                  value: s.id,
                  name: `${s.title} · ${formatDate(s.startsAt)}`,
                }))}
              />
              {people.data.participants.map((participant) => (
                <div className="record" key={`${participant.userId}-${sessionId}`}>
                  <h3>{participant.name}</h3>
                  <ActionForm
                    submit="Save attendance"
                    onSubmit={async (data) => {
                      await api(`/staff/programmes/${id}/attendance`, 'POST', {
                        sessionId,
                        userId: participant.userId,
                        status: field(data, 'status'),
                      })
                      people.reload()
                    }}
                  >
                    <Select
                      label="Attendance status"
                      name="status"
                      options={['present', 'absent', 'excused']}
                      defaultValue={
                        people.data?.attendance.find(
                          (a) => a.sessionId === sessionId && a.userId === participant.userId,
                        )?.status ?? 'absent'
                      }
                    />
                  </ActionForm>
                </div>
              ))}
            </>
          ) : (
            <Empty title="Schedule a session first.">
              Attendance is recorded against a session and an approved participant.
            </Empty>
          )}
          {people.data.participants.length === 0 && <p>No approved participants yet.</p>}
        </>
      )}
    </Panel>
  )
}
function Assignments({ id }: { id: string }) {
  const result = useResource<{ assignments: StaffAssignment[] }>(
    `/staff/programmes/${id}/assignments`,
  )
  const users = useResource<{ users: User[] }>('/staff/users')
  return (
    <Panel title="Assigned providers & event staff">
      <p>
        Instructors, mentors and facilitators can access learning and attendance for assigned
        programmes. Judges can only view private submissions and record scores. Create or promote
        staff accounts with the staff CLI.
      </p>
      <Loading {...result} retry={result.reload} />
      <Loading {...users} retry={users.reload} />
      {result.data?.assignments.map((a) => (
        <div className="record" key={a.userId}>
          <div>
            <h3>{a.name}</h3>
            <p>{label(a.role)}</p>
          </div>
          <ActionForm
            submit="Remove assignment"
            onSubmit={async () => {
              await api(`/staff/programmes/${id}/assignments/${a.userId}`, 'DELETE', {})
              result.reload()
            }}
          >
            <span className="sr-only">Remove {a.name}</span>
          </ActionForm>
        </div>
      ))}
      {users.data && (
        <ActionForm
          submit="Assign provider"
          onSubmit={async (data) => {
            await api(`/staff/programmes/${id}/assignments`, 'POST', {
              userId: field(data, 'userId'),
              role: field(data, 'role'),
            })
            result.reload()
          }}
        >
          <div className="form-row">
            <Select
              label="Provider account"
              name="userId"
              required
              options={users.data.users
                .filter((u) => ['admin', 'manager', 'instructor'].includes(u.role))
                .map((u) => ({ value: u.id, name: `${u.name} · ${u.email}` }))}
            />
            <Select label="Programme responsibility" name="role" options={staffRoles} />
          </div>
        </ActionForm>
      )}
    </Panel>
  )
}
interface Report {
  title: string
  applications: number
  approved: number
  completed: number
  attended: number
  projects: number
  funding: { mode: string; capacity: number; approved: number }[]
  financials?: Programme['funding']
  note: string
}
function ProgrammeReport({ id }: { id: string }) {
  const result = useResource<Report>(`/staff/programmes/${id}/report`)
  return (
    <Panel title="Recorded programme outcomes">
      <Loading {...result} retry={result.reload} />
      {result.data && (
        <>
          <div className="stat-grid">
            {[
              [result.data.applications, 'Applications'],
              [result.data.approved, 'Approved places'],
              [result.data.completed, 'Lesson completions'],
              [result.data.attended, 'Present participant-sessions'],
              [result.data.projects, 'Projects submitted'],
            ].map(([value, name]) => (
              <div className="stat" key={String(name)}>
                <strong>{value}</strong>
                <span>{name}</span>
              </div>
            ))}
          </div>
          <p className="small muted">{result.data.note}</p>
          <h3>Participation allocations</h3>
          {result.data.funding.map((f) => (
            <p key={f.mode}>
              <Badge green>{label(f.mode)}</Badge> {f.approved} awarded / {f.capacity} configured ·{' '}
              {f.capacity - f.approved} remaining
            </p>
          ))}
          {result.data.financials && (
            <>
              <h3>Restricted funding records</h3>
              {result.data.financials.map((f) => (
                <div className="funding-editor" key={f.mode}>
                  <h4>
                    {label(f.mode)} · {f.sponsor || 'No funding source recorded'}
                  </h4>
                  <p>
                    Committed: {money(f.committedMinor, f.currency)} · Received:{' '}
                    {money(f.receivedMinor, f.currency)}
                  </p>
                  <p>
                    Approved award budget: {money(f.budgetMinor, f.currency)} · Allocated awards:{' '}
                    {money(f.allocatedMinor ?? 0, f.currency)}
                  </p>
                </div>
              ))}
            </>
          )}
          <div className="alert">
            <ShieldCheck size={19} />
            No partner portal is enabled. Export or share only authorised aggregate reporting after
            an organisational privacy review.
          </div>
        </>
      )}
    </Panel>
  )
}
