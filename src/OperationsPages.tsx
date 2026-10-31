import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  consentPurposes,
  concernStatuses,
  operationsSchema,
  providerStages,
  type ConsentCase,
  type Concern,
  type FinancialAction,
  type FundingAward,
  type ImpactRow,
  type Indicator,
  type Location,
  type Provider,
  type Operations,
} from '../shared/operations'
import type { Enquiry, SiteSettings } from '../shared/domain'
import {
  api,
  checked,
  dateInput,
  field,
  isoField,
  label,
  money,
  numberField,
  useResource,
} from './api'
import { useAuth } from './authContext'
import { ActionForm, Badge, Empty, Field, Loading, PageIntro, Panel, Select, TextArea } from './ui'
import './operations.css'

interface Directory {
  users: { id: string; name: string; role: string; safeguarding: boolean }[]
  programmes: { id: string; title: string }[]
}
const defaultExpiry = () => dateInput(new Date(Date.now() + 180 * 86400000).toISOString())
const options = (records: { id: string; title?: string; name?: string }[]) =>
  records.map((r) => ({ value: r.id, name: r.title ?? r.name ?? r.id }))
const none = { value: '', name: 'None / not applicable' }

function HistoryRecords({ kind, resource }: { kind: string; resource: string }) {
  const [expanded, setExpanded] = useState(false)
  const result = useResource<{
    history: {
      previous_data: string | null
      next_data: string
      changed_by: string
      created_at: string
    }[]
  }>(expanded ? `/operations/history/${kind}/${resource}` : null)
  return (
    <details onToggle={(e) => setExpanded(e.currentTarget.open)}>
      <summary>Restricted change history</summary>
      <Loading {...result} retry={result.reload} />
      {result.data?.history.map((h, i) => (
        <div key={i}>
          <p>
            {h.created_at} · Actor {h.changed_by}
          </p>
          <pre className="history-data">
            {JSON.stringify(
              {
                before: h.previous_data ? JSON.parse(h.previous_data) : null,
                after: JSON.parse(h.next_data),
              },
              null,
              2,
            )}
          </pre>
        </div>
      ))}
    </details>
  )
}
export function OperationsPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const manager = ['admin', 'manager'].includes(user?.role ?? '')
  const financial = ['admin', 'finance'].includes(user?.role ?? '')
  const safeguarding =
    !!user?.permissions?.includes('safeguarding') &&
    ['admin', 'manager', 'instructor'].includes(user.role)
  const tabs = [
    ...(manager ? ['delivery', 'impact', 'locations'] : []),
    ...(manager || financial || safeguarding ? ['providers'] : []),
    ...(financial ? ['funding'] : []),
    ...(safeguarding ? ['safeguarding'] : []),
    ...(user?.role === 'instructor' ? ['delivery'] : []),
    ...(['admin', 'manager', 'instructor'].includes(user?.role ?? '') ? ['contributions'] : []),
  ]
  const active = params.get('tab') ?? tabs[0]
  return (
    <>
      <div className="no-print">
        <PageIntro eyebrow="OPERATIONAL DELIVERY" title="Ready to deliver. Able to demonstrate.">
          Safeguarding, resources, funding and evidence belong in the everyday work, not a separate
          spreadsheet.
        </PageIntro>
      </div>
      <section className="container section operations-workspace">
        <div className="no-print">
          <div className="dashboard-toolbar">
            <Link className="text-link" to="/dashboard">
              Back to My learning
            </Link>
            <Link className="text-link" to="/safety">
              My guardian permissions & report a concern
            </Link>
          </div>
          <p className="small muted">
            A live connection is required. Saved records persist after interruptions; unsent forms
            do not. This workspace is not an emergency service.
          </p>
          <nav className="tab-bar" aria-label="Operational modules">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={active === tab ? 'active' : ''}
                onClick={() =>
                  setParams({
                    tab,
                    ...(params.get('programme') ? { programme: params.get('programme')! } : {}),
                  })
                }
              >
                {label(tab)}
              </button>
            ))}
          </nav>
        </div>
        {!tabs.includes(active) ? (
          <Empty title="This module is restricted.">
            Choose an available module for your current permissions.
          </Empty>
        ) : active === 'safeguarding' ? (
          <SafeguardingPanel />
        ) : active === 'locations' ? (
          <LocationsPanel />
        ) : active === 'delivery' ? (
          <DeliveryPanel initialId={params.get('programme') ?? ''} manager={manager} />
        ) : active === 'providers' ? (
          <ProvidersPanel manager={manager} financial={financial} safeguarding={safeguarding} />
        ) : active === 'funding' ? (
          <FundingPanel />
        ) : active === 'impact' ? (
          <ImpactPanel />
        ) : (
          <ContributionsPanel manager={manager} />
        )}
      </section>
    </>
  )
}

export function SafetyPage() {
  const cases = useResource<{ cases: ConsentCase[] }>('/my/consents')
  const prefs = useResource<{ programmeUpdates: boolean; futureOpportunities: boolean }>(
    '/my/preferences',
  )
  const settings = useResource<{ settings: SiteSettings }>('/settings')
  return (
    <>
      <PageIntro eyebrow="SAFE PARTICIPATION" title="Your permissions. Your choices.">
        Adults manage these accounts. A declaration is not verified consent; staff must check
        guardian authority and the evidence separately.
      </PageIntro>
      <section className="container section">
        <Link to="/dashboard" className="text-link">
          Back to My learning
        </Link>
        <Loading {...cases} retry={cases.reload} />
        {cases.data?.cases.length === 0 && (
          <Empty title="No child applications on this account.">
            Guardian controls appear here after applying for a child. No child profiles are publicly
            searchable.
          </Empty>
        )}
        {cases.data?.cases.map((c) => (
          <Panel key={c.applicationId} title={`${c.participantName} · ${c.title}`}>
            <Badge green={c.participationReady}>
              {c.participationReady
                ? 'Current participation permission verified'
                : 'Participation permission needs review'}
            </Badge>
            <p>
              Guardian contact declared on application: {c.guardianName} · {c.guardianEmail}.
              Contact the team to correct an application. Do not send identity documents or medical
              information here.
            </p>
            <ActionForm
              submit="Save guardian relationship"
              onSubmit={async (data) => {
                await api(`/my/applications/${c.applicationId}/guardian`, 'PUT', {
                  relationship: field(data, 'relationship'),
                  emergencyName: field(data, 'emergencyName'),
                  emergencyPhone: field(data, 'emergencyPhone'),
                })
                cases.reload()
              }}
            >
              <Select
                label="Relationship to learner"
                name="relationship"
                defaultValue={c.guardian?.relationship ?? 'parent'}
                options={['parent', 'legal-guardian']}
              />
              {c.policy.emergencyRequired && (
                <div className="form-row">
                  <Field
                    label="Emergency contact name"
                    name="emergencyName"
                    defaultValue={c.guardian?.emergencyName}
                    maxLength={120}
                    required
                  />
                  <Field
                    label="Emergency contact telephone"
                    name="emergencyPhone"
                    type="tel"
                    defaultValue={c.guardian?.emergencyPhone}
                    maxLength={40}
                    required
                  />
                </div>
              )}
              <p className="small muted">
                Changing this relationship or emergency details requires staff to reverify any
                previously granted permissions. Emergency contacts are collected only when the
                programme requires them.
              </p>
            </ActionForm>
            {consentPurposes.map((purpose) => {
              const current = c.consents.find((r) => r.purpose === purpose)
              return (
                <div className="funding-editor" key={purpose}>
                  <h3>
                    {label(purpose)} permission {purpose !== 'participation' && '(optional)'}
                  </h3>
                  <p className="preserve">{c.policy[`${purpose}Notice`]}</p>
                  <p className="small">
                    Notice: {c.policy.noticeVersion}. Current:{' '}
                    {!current
                      ? 'not declared'
                      : !current.granted
                        ? 'withdrawn'
                        : current.verified_at &&
                            current.notice_version === c.policy.noticeVersion &&
                            Date.parse(current.valid_until ?? '') > Date.now()
                          ? `verified until ${current.valid_until?.slice(0, 10)}`
                          : 'declaration only / review required'}
                    .
                  </p>
                  <ActionForm
                    submit={`Record ${purpose} choice`}
                    onSubmit={async (data) => {
                      const response = await api<{ message: string }>(
                        `/my/applications/${c.applicationId}/consents`,
                        'POST',
                        {
                          purpose,
                          granted: field(data, 'choice') === 'grant',
                          noticeVersion: c.policy.noticeVersion,
                        },
                      )
                      cases.reload()
                      return response.message
                    }}
                  >
                    <Select
                      label={`${label(purpose)} choice`}
                      name="choice"
                      options={[
                        { value: 'withdraw', name: 'Do not grant / withdraw permission' },
                        { value: 'grant', name: 'Declare informed permission for this purpose' },
                      ]}
                    />
                    <Field
                      type="checkbox"
                      name="acknowledge"
                      label="I have read this purpose-specific notice and have authority to make this choice."
                      required
                    />
                  </ActionForm>
                </div>
              )
            })}
          </Panel>
        ))}
        <Panel title="Notification choices">
          <Loading {...prefs} retry={prefs.reload} />
          {prefs.data && (
            <ActionForm
              onSubmit={async (data) => {
                await api('/my/preferences', 'PUT', {
                  programmeUpdates: checked(data, 'programmeUpdates'),
                  futureOpportunities: checked(data, 'futureOpportunities'),
                })
                prefs.reload()
              }}
            >
              <Field
                type="checkbox"
                name="programmeUpdates"
                label="Receive optional programme announcements in this adult account."
                defaultChecked={prefs.data.programmeUpdates}
              />
              <Field
                type="checkbox"
                name="futureOpportunities"
                label="I may be considered for future opportunity communications when that service is introduced."
                defaultChecked={prefs.data.futureOpportunities}
              />
              <p className="small muted">
                Essential application, consent and payment status updates remain available in-app.
                Children’s programme announcements also require current, verified guardian
                communications permission. Email, SMS and WhatsApp are not connected.
              </p>
            </ActionForm>
          )}
        </Panel>
        <Panel title="Report a safeguarding concern">
          <Loading {...settings} retry={settings.reload} />
          <p className="preserve">
            {settings.data?.settings.safeguardingInstructions ||
              'The organisation must publish an approved safeguarding contact and urgent escalation procedure before real-world use. If someone is in immediate danger, contact appropriate local emergency or child-protection services rather than waiting for this inbox.'}
          </p>
          <p>
            Only explicitly authorised safeguarding officers can read reports and follow-up notes.
            Reports are not anonymous to those officers. Do not include unnecessary sensitive
            details. No external alert is sent automatically.
          </p>
          <ActionForm
            submit="Submit restricted concern"
            onSubmit={async (data) => {
              const response = await api<{ id: string; message: string }>(
                '/safeguarding/concerns',
                'POST',
                {
                  subject: field(data, 'subject'),
                  detail: field(data, 'detail'),
                  priority: field(data, 'priority'),
                },
              )
              return `${response.message} Reference: ${response.id}`
            }}
          >
            <Field label="Concern subject" name="subject" maxLength={160} required />
            <Select label="Urgency" name="priority" options={['normal', 'urgent']} />
            <TextArea
              label="Necessary facts and how the officer can follow up"
              name="detail"
              maxLength={8000}
              required
            />
            <Field
              type="checkbox"
              name="understand"
              label="I understand this inbox is not an emergency service."
              required
            />
          </ActionForm>
        </Panel>
      </section>
    </>
  )
}

function SafeguardingPanel() {
  const [asOf] = useState(Date.now)
  const cases = useResource<{ cases: ConsentCase[] }>('/operations/consents')
  const concerns = useResource<{ concerns: Concern[] }>('/operations/concerns')
  const directory = useResource<Directory>('/operations/directory')
  const officers = directory.data?.users.filter((u) => u.safeguarding) ?? []
  return (
    <>
      <Panel title="Restricted safeguarding desk">
        <p>
          Access is audited. Do not copy narratives into ordinary programme notes, exports or
          messages. Record only a reference to securely held evidence, never identity-document scans
          or background-check contents. Recheck authority, child identity, purpose, notice and
          expiry using the approved offline procedure.
        </p>
        <Loading {...directory} retry={directory.reload} />
      </Panel>
      <Loading {...cases} retry={cases.reload} />
      {cases.data?.cases.map((c) => (
        <Panel key={c.applicationId} title={`${c.participantName} · ${c.title}`}>
          <p>
            Guardian: {c.guardianName} · {c.guardianEmail}. Claimed relationship:{' '}
            {label(c.guardian?.relationship ?? 'not recorded')}.
          </p>
          {c.policy.emergencyRequired && (
            <p>
              Emergency contact: {c.guardian?.emergencyName || 'missing'} ·{' '}
              {c.guardian?.emergencyPhone || 'missing'}.
            </p>
          )}
          <p>
            <Badge green={c.participationReady}>
              {c.participationReady ? 'Participation ready' : 'Review required'}
            </Badge>{' '}
            Notice {c.policy.noticeVersion}
          </p>
          <details>
            <summary>Read current purpose-specific notices</summary>
            {consentPurposes.map((purpose) => (
              <p key={purpose}>
                <strong>{label(purpose)}: </strong>
                {c.policy[`${purpose}Notice`]}
              </p>
            ))}
          </details>
          {!c.consents.length && (
            <p>
              The guardian must record their relationship and purpose-specific declarations from
              their own account first.
            </p>
          )}
          {c.consents.map((r) => (
            <div key={r.id} className="funding-editor">
              <h3>
                {label(r.purpose)}: {r.granted ? 'declared' : 'withdrawn'}
              </h3>
              <p>
                Notice {r.notice_version} ·{' '}
                {r.verified_at ? `Reviewed; expiry ${r.valid_until?.slice(0, 10)}` : 'Not verified'}
              </p>
              {!!r.granted && !r.verified_at && r.notice_version === c.policy.noticeVersion && (
                <ActionForm
                  submit={`Verify ${r.purpose} evidence`}
                  onSubmit={async (data) => {
                    await api(`/operations/consents/${r.id}/verify`, 'POST', {
                      evidenceReference: field(data, 'evidenceReference'),
                      validUntil: isoField(data, 'validUntil'),
                      authorityConfirmed: checked(data, 'authorityConfirmed'),
                    })
                    cases.reload()
                  }}
                >
                  <Field
                    label="Secure evidence / verification record reference"
                    name="evidenceReference"
                    maxLength={300}
                    required
                  />
                  <Field
                    label="Permission review expiry"
                    type="datetime-local"
                    name="validUntil"
                    defaultValue={defaultExpiry()}
                    required
                  />
                  <Field
                    type="checkbox"
                    name="authorityConfirmed"
                    label="I independently verified guardian authority, participant identity, informed permission and this exact purpose and notice version."
                    required
                  />
                </ActionForm>
              )}
            </div>
          ))}
          <HistoryRecords kind="consent" resource={c.applicationId} />
        </Panel>
      ))}
      <h2>Concerns & follow-up</h2>
      <Loading {...concerns} retry={concerns.reload} />
      {concerns.data?.concerns.length === 0 && (
        <Empty title="No concerns recorded.">
          This is an inbox, not evidence that no safeguarding concerns exist. An officer must
          monitor it.
        </Empty>
      )}
      {concerns.data?.concerns.map((c) => (
        <Panel key={c.id} title={c.subject}>
          <Badge>
            {label(c.priority)} · {label(c.status)}
          </Badge>
          <p className="preserve">{c.detail}</p>
          <p className="small">
            Reference {c.id} · Reported {c.created_at}
          </p>
          {c.actions.map((a, i) => (
            <blockquote key={i}>
              <strong>
                {label(a.status)} · {a.created_at}
              </strong>
              <p className="preserve">{a.note}</p>
            </blockquote>
          ))}
          <ActionForm
            submit="Record restricted follow-up"
            onSubmit={async (data) => {
              await api(`/operations/concerns/${c.id}/actions`, 'POST', {
                status: field(data, 'status'),
                note: field(data, 'note'),
                assignedTo: field(data, 'assignedTo') || null,
                reviewDue: isoField(data, 'reviewDue'),
                retainUntil: isoField(data, 'retainUntil'),
                legalHold: checked(data, 'legalHold'),
              })
              concerns.reload()
            }}
          >
            <div className="form-row">
              <Select
                label="Case status"
                name="status"
                defaultValue={c.status}
                options={concernStatuses}
              />
              <Select
                label="Accountable officer"
                name="assignedTo"
                defaultValue={c.assigned_to ?? ''}
                options={[none, ...options(officers)]}
              />
            </div>
            <div className="form-row">
              <Field
                label="Next review due"
                name="reviewDue"
                type="datetime-local"
                defaultValue={dateInput(c.review_due)}
              />
              <Field
                label="Approved retention review / disposal date"
                name="retainUntil"
                type="datetime-local"
                defaultValue={dateInput(c.retain_until)}
                required
              />
            </div>
            <Field
              type="checkbox"
              label="Legal or safeguarding preservation hold"
              name="legalHold"
              defaultChecked={!!c.legal_hold}
            />
            <TextArea
              label="Action taken, referral or closure rationale"
              name="note"
              maxLength={5000}
              required
            />
          </ActionForm>
          {c.status === 'closed' && !c.legal_hold && Date.parse(c.retain_until) <= asOf && (
            <ActionForm
              submit="Dispose of closed record under approved retention policy"
              onSubmit={async () => {
                await api(`/operations/concerns/${c.id}`, 'DELETE', {
                  reason: 'approved-retention-disposal',
                })
                concerns.reload()
              }}
            >
              <Field
                type="checkbox"
                label="I have organisational authorisation to dispose of this closed record; this cannot be undone."
                required
              />
            </ActionForm>
          )}
        </Panel>
      ))}
    </>
  )
}

function LocationsPanel() {
  const result = useResource<{ locations: Location[] }>('/operations/locations')
  const fields = (location?: Location) => (
    <>
      <div className="form-row">
        <Field
          label="Location name"
          name="name"
          defaultValue={location?.name}
          maxLength={160}
          required
        />
        <Select
          label="Location type"
          name="kind"
          defaultValue={location?.kind ?? 'school'}
          options={['school', 'community-centre', 'partner', 'venue', 'outreach', 'virtual']}
        />
      </div>
      <Field
        label="Community / general area (not a child’s home address)"
        name="area"
        defaultValue={location?.area}
        maxLength={160}
      />
      <Field
        type="checkbox"
        label="Active delivery location"
        name="active"
        defaultChecked={location?.active ?? true}
      />
    </>
  )
  const save = async (data: FormData, locationId?: string) => {
    await api(
      `/operations/locations${locationId ? `/${locationId}` : ''}`,
      locationId ? 'PUT' : 'POST',
      {
        name: field(data, 'name'),
        kind: field(data, 'kind'),
        area: field(data, 'area'),
        active: checked(data, 'active'),
      },
    )
    result.reload()
  }
  return (
    <>
      <Panel title="Add a programme delivery location">
        <ActionForm submit="Create location" onSubmit={(data) => save(data)}>
          {fields()}
        </ActionForm>
      </Panel>
      <Loading {...result} retry={result.reload} />
      {result.data?.locations.map((l) => (
        <Panel key={l.id} title={l.name}>
          <ActionForm onSubmit={(data) => save(data, l.id)}>{fields(l)}</ActionForm>
        </Panel>
      ))}
    </>
  )
}

function DeliveryPanel({ initialId, manager }: { initialId: string; manager: boolean }) {
  const directory = useResource<Directory>(manager ? '/operations/directory' : null)
  const [programmeId, setProgrammeId] = useState(initialId)
  const result = useResource<{ policy: Operations }>(
    programmeId ? `/operations/programmes/${programmeId}` : null,
  )
  const locations = useResource<{ locations: Location[] }>(manager ? '/operations/locations' : null)
  const [draft, setDraft] = useState<Operations | null>(null)
  const current = draft ?? result.data?.policy
  const edit = (value: Partial<Operations>) => current && setDraft({ ...current, ...value })
  return (
    <>
      <Panel title="Programme delivery & readiness">
        <p>
          Mandatory items block publication/opening or delivery status changes, applications and
          learner access until completed. Physical checks are optional for online courses. Checklist
          completion is a staff attestation with an evidence reference, not automated inspection.
        </p>
        <Loading {...directory} retry={directory.reload} />
        {manager ? (
          <Select
            label="Programme to operate"
            value={programmeId}
            onChange={(e) => {
              setProgrammeId(e.target.value)
              setDraft(null)
            }}
            options={[none, ...options(directory.data?.programmes ?? [])]}
          />
        ) : (
          <Field
            label="Assigned programme identifier"
            value={programmeId}
            onChange={(e) => {
              setProgrammeId(e.target.value)
              setDraft(null)
            }}
            hint="Use the Operations link from your assigned programme."
          />
        )}
      </Panel>
      <Loading {...result} retry={result.reload} />
      {current && manager && (
        <Panel title="Delivery policy, objectives & checklist">
          <Loading {...locations} retry={locations.reload} />
          <ActionForm
            submit="Save programme operating policy"
            onSubmit={async (data) => {
              await api(
                `/operations/programmes/${programmeId}`,
                'PUT',
                operationsSchema.parse({
                  ...current,
                  noticeVersion: field(data, 'noticeVersion'),
                  participationNotice: field(data, 'participationNotice'),
                  communicationsNotice: field(data, 'communicationsNotice'),
                  mediaNotice: field(data, 'mediaNotice'),
                  emergencyRequired: checked(data, 'emergencyRequired'),
                  screeningRequired: checked(data, 'screeningRequired'),
                  locationId: field(data, 'locationId') || null,
                  participantTarget: numberField(data, 'participantTarget'),
                  beneficiaryGroup: field(data, 'beneficiaryGroup'),
                  objectives: field(data, 'objectives'),
                  challenges: field(data, 'challenges'),
                  nextSteps: field(data, 'nextSteps'),
                }),
              )
              setDraft(null)
              result.reload()
            }}
          >
            <div className="form-row">
              <Select
                label="Managed location"
                name="locationId"
                defaultValue={current.locationId ?? ''}
                options={[
                  none,
                  ...options(locations.data?.locations.filter((l) => l.active) ?? []),
                ]}
              />
              <Field
                label="Planned participant places"
                type="number"
                name="participantTarget"
                min={0}
                max={1000000}
                defaultValue={current.participantTarget}
              />
            </div>
            <Field
              label="Target beneficiary group (aggregate description only)"
              name="beneficiaryGroup"
              defaultValue={current.beneficiaryGroup}
              maxLength={200}
            />
            <TextArea
              label="Programme impact objectives"
              name="objectives"
              defaultValue={current.objectives}
              maxLength={3000}
            />
            <TextArea
              label="Challenges and lessons learned (report-safe, no personal data)"
              name="challenges"
              defaultValue={current.challenges}
              maxLength={3000}
            />
            <TextArea
              label="Next steps (report-safe)"
              name="nextSteps"
              defaultValue={current.nextSteps}
              maxLength={3000}
            />
            <Field
              type="checkbox"
              label="Require emergency contact for this programme"
              name="emergencyRequired"
              defaultChecked={current.emergencyRequired}
            />
            <Field
              type="checkbox"
              label="Require current provider screening for all participants (always enforced for child/youth programmes and approved child participants)"
              name="screeningRequired"
              defaultChecked={current.screeningRequired}
            />
            <Field
              label="Unique consent notice version"
              name="noticeVersion"
              defaultValue={current.noticeVersion}
              maxLength={60}
              required
            />
            <p className="small muted">
              Changing notice wording requires a new version. Prior child permissions no longer
              authorise participation after a version change; guardians must redeclare and officers
              must reverify. Media and communications permission remain optional.
            </p>
            {consentPurposes.map((purpose) => (
              <TextArea
                key={purpose}
                label={`${label(purpose)} notice`}
                name={`${purpose}Notice`}
                defaultValue={current[`${purpose}Notice`]}
                maxLength={purpose === 'participation' ? 3000 : 1500}
                required
              />
            ))}
            <h3>Programme readiness items</h3>
            {current.readiness.map((r, i) => (
              <div className="funding-editor" key={r.key}>
                <Field
                  label={`Checklist item ${i + 1}`}
                  value={r.title}
                  maxLength={160}
                  onChange={(e) =>
                    edit({
                      readiness: current.readiness.map((item, index) =>
                        index === i ? { ...item, title: e.target.value } : item,
                      ),
                    })
                  }
                  required
                />
                <Select
                  label={`Mandatory stage for item ${i + 1}`}
                  value={r.requiredBefore}
                  options={[
                    { value: 'none', name: 'Advisory only' },
                    { value: 'open', name: 'Before opening / scheduled delivery' },
                    { value: 'running', name: 'Before running / completion' },
                  ]}
                  onChange={(e) =>
                    edit({
                      readiness: current.readiness.map((item, index) =>
                        index === i
                          ? {
                              ...item,
                              requiredBefore: e.target.value as 'none' | 'open' | 'running',
                            }
                          : item,
                      ),
                    })
                  }
                />
                <Field
                  label={`Evidence for item ${i + 1}`}
                  value={r.evidence}
                  maxLength={500}
                  onChange={(e) =>
                    edit({
                      readiness: current.readiness.map((item, index) =>
                        index === i ? { ...item, evidence: e.target.value } : item,
                      ),
                    })
                  }
                />
                <Field
                  type="checkbox"
                  label={`Item ${i + 1} checked and complete`}
                  checked={r.complete}
                  onChange={(e) =>
                    edit({
                      readiness: current.readiness.map((item, index) =>
                        index === i ? { ...item, complete: e.target.checked } : item,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    edit({ readiness: current.readiness.filter((_, index) => index !== i) })
                  }
                >
                  Remove this checklist item
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                edit({
                  readiness: [
                    ...current.readiness,
                    {
                      key: crypto.randomUUID(),
                      title: '',
                      requiredBefore: 'none',
                      complete: false,
                      evidence: '',
                    },
                  ],
                })
              }
            >
              Add readiness item
            </button>
          </ActionForm>
          <HistoryRecords kind="policy" resource={programmeId} />
        </Panel>
      )}
      {current && !manager && (
        <Panel title="Assigned programme readiness">
          {current.readiness.map((r) => (
            <p key={r.key}>
              <Badge green={r.complete}>{r.complete ? 'Checked' : 'Incomplete'}</Badge> {r.title} ·{' '}
              {r.requiredBefore}
            </p>
          ))}
        </Panel>
      )}
      {programmeId && current && (
        <>
          <IndicatorsPanel programmeId={programmeId} manager={manager} />
          <AnnouncementsPanel programmeId={programmeId} />
        </>
      )}
    </>
  )
}

function IndicatorsPanel({ programmeId, manager }: { programmeId: string; manager: boolean }) {
  const [asOf] = useState(() => new Date().toISOString().slice(0, 10))
  const result = useResource<{ indicators: Indicator[] }>(
    `/operations/programmes/${programmeId}/indicators`,
  )
  return (
    <>
      {manager && (
        <Panel title="Define an output or outcome indicator">
          <p>
            Use an output for an activity delivered; use an outcome for demonstrated change.
            Observations are snapshots, not automatically summed. A different manager must review
            evidence before a value appears in donor reports. Keep report titles free of personal
            data.
          </p>
          <ActionForm
            submit="Create indicator"
            onSubmit={async (data) => {
              await api(`/operations/programmes/${programmeId}/indicators`, 'POST', {
                name: field(data, 'name'),
                kind: field(data, 'kind'),
                unit: field(data, 'unit'),
                target: numberField(data, 'target'),
                evidenceRequirement: field(data, 'evidenceRequirement'),
              })
              result.reload()
            }}
          >
            <Field label="Report-safe indicator name" name="name" maxLength={160} required />
            <div className="form-row">
              <Select label="Indicator type" name="kind" options={['output', 'outcome']} />
              <Field label="Measurement unit" name="unit" maxLength={80} required />
              <Field
                label="Indicator target"
                name="target"
                type="number"
                min={0}
                max={1000000000}
                step="any"
                required
              />
            </div>
            <TextArea
              label="Required evidence / assessment method"
              name="evidenceRequirement"
              maxLength={500}
              required
            />
          </ActionForm>
        </Panel>
      )}
      <Loading {...result} retry={result.reload} />
      {result.data?.indicators.map((i) => (
        <Panel key={i.id} title={i.name}>
          <p>
            <Badge>{label(i.kind)}</Badge> Target {i.target} {i.unit}. Evidence:{' '}
            {i.evidenceRequirement}
          </p>
          <ActionForm
            submit="Record evidence-backed observation"
            onSubmit={async (data) => {
              await api(`/operations/indicators/${i.id}/observations`, 'POST', {
                value: numberField(data, 'value'),
                observedAt: field(data, 'observedAt'),
                evidenceReference: field(data, 'evidenceReference'),
                note: field(data, 'note'),
              })
              result.reload()
            }}
          >
            <div className="form-row">
              <Field
                label="Observed value"
                name="value"
                type="number"
                min={0}
                max={1000000000}
                step="any"
                required
              />
              <Field label="Observation date" name="observedAt" type="date" max={asOf} required />
            </div>
            <Field
              label="Secure supporting evidence reference"
              name="evidenceReference"
              maxLength={300}
              required
            />
            <TextArea
              label="Internal evidence / limitations note (no child names)"
              name="note"
              maxLength={1500}
            />
          </ActionForm>
          {i.observations.map((o) => (
            <div key={o.id} className="funding-editor">
              <p>
                {o.observedAt}: {o.value} {i.unit} ·{' '}
                {o.verified ? 'Reviewed' : 'Pending independent review'}
              </p>
              <p className="small">
                {o.evidenceReference} · {o.note}
              </p>
              {!o.verified && manager && (
                <ActionForm
                  submit="Verify evidence as a different manager"
                  onSubmit={async () => {
                    await api(`/operations/observations/${o.id}/verify`, 'POST')
                    result.reload()
                  }}
                >
                  <Field
                    type="checkbox"
                    label="I reviewed the evidence and its limitations; this is not a causal claim."
                    required
                  />
                </ActionForm>
              )}
            </div>
          ))}
        </Panel>
      ))}
    </>
  )
}

function AnnouncementsPanel({ programmeId }: { programmeId: string }) {
  const result = useResource<{
    announcements: { id: string; message: string; recipients: number; created_at: string }[]
  }>(`/operations/programmes/${programmeId}/announcements`)
  return (
    <Panel title="Permission-aware programme announcements">
      <p>
        In-app broadcasts to approved adult or guardian accounts only. No individual adult-to-child
        messaging. Optional notification preferences and verified guardian communications permission
        are respected.
      </p>
      <ActionForm
        submit="Send in-app announcement"
        onSubmit={async (data) => {
          const response = await api<{ message: string }>(
            `/operations/programmes/${programmeId}/announcements`,
            'POST',
            { message: field(data, 'message') },
          )
          result.reload()
          return response.message
        }}
      >
        <TextArea
          label="Announcement (no private participant information)"
          name="message"
          maxLength={1500}
          required
        />
      </ActionForm>
      <Loading {...result} retry={result.reload} />
      {result.data?.announcements.map((a) => (
        <p key={a.id}>
          <strong>
            {a.created_at} · {a.recipients} permitted accounts:
          </strong>{' '}
          {a.message}
        </p>
      ))}
    </Panel>
  )
}

function ProvidersPanel({
  manager,
  financial,
  safeguarding,
}: {
  manager: boolean
  financial: boolean
  safeguarding: boolean
}) {
  const result = useResource<{ providers: Provider[] }>('/operations/providers')
  const [selected, setSelected] = useState('')
  const provider = result.data?.providers.find((p) => p.id === selected)
  return (
    <>
      <Panel title="Volunteer & instructor lifecycle">
        <p>
          A volunteer enquiry never grants an account, programme assignment or clearance. Create or
          promote a verified adult account using the existing staff controls, then link the enquiry
          reference and record the lifecycle here. Screening evidence and compensation have separate
          permissions.
        </p>
        <Loading {...result} retry={result.reload} />
        <Select
          label="Contributor to manage"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          options={[none, ...options(result.data?.providers ?? [])]}
        />
      </Panel>
      {provider && (
        <div key={provider.id}>
          <Panel title={provider.name}>
            <Badge green={provider.eligible}>
              {provider.eligible
                ? 'Current child-facing eligibility confirmed'
                : 'Not cleared for child-facing assignment'}
            </Badge>
          </Panel>
          {manager && (
            <Panel title="Engagement, skills & orientation">
              <ActionForm
                submit="Save contributor lifecycle"
                onSubmit={async (data) => {
                  await api(`/operations/providers/${provider.id}/profile`, 'PUT', {
                    stage: field(data, 'stage'),
                    engagement: field(data, 'engagement'),
                    applicationId: field(data, 'applicationId') || null,
                    skills: field(data, 'skills'),
                    interests: field(data, 'interests'),
                    availability: field(data, 'availability'),
                    orientationComplete: checked(data, 'orientationComplete'),
                    feedback: field(data, 'feedback'),
                  })
                  result.reload()
                }}
              >
                <div className="form-row">
                  <Select
                    label="Lifecycle stage"
                    name="stage"
                    defaultValue={provider.profile?.stage ?? 'applied'}
                    options={providerStages}
                  />
                  <Select
                    label="Engagement type"
                    name="engagement"
                    defaultValue={provider.profile?.engagement ?? 'volunteer'}
                    options={['volunteer', 'paid', 'part-time', 'contractor']}
                  />
                </div>
                <Field
                  label="Existing volunteer enquiry reference (optional)"
                  name="applicationId"
                  defaultValue={provider.profile?.applicationId ?? ''}
                />
                <TextArea
                  label="Contributor skills"
                  name="skills"
                  defaultValue={provider.profile?.skills}
                  maxLength={1500}
                />
                <TextArea
                  label="Interests / preferred contributions"
                  name="interests"
                  defaultValue={provider.profile?.interests}
                  maxLength={1500}
                />
                <Field
                  label="Availability"
                  name="availability"
                  defaultValue={provider.profile?.availability}
                  maxLength={500}
                />
                <Field
                  type="checkbox"
                  label="Orientation completed"
                  name="orientationComplete"
                  defaultChecked={provider.profile?.orientationComplete}
                />
                <TextArea
                  label="Operational feedback (no screening or compensation details)"
                  name="feedback"
                  defaultValue={provider.profile?.feedback}
                  maxLength={1500}
                />
              </ActionForm>
              <HistoryRecords kind="profile" resource={provider.id} />
            </Panel>
          )}
          {safeguarding && (
            <Panel title="Restricted screening & safeguarding training">
              <ActionForm
                submit="Record independently checked safeguarding clearance"
                onSubmit={async (data) => {
                  await api(`/operations/providers/${provider.id}/screening`, 'PUT', {
                    status: field(data, 'status'),
                    validUntil: isoField(data, 'validUntil'),
                    trainingDate: field(data, 'trainingDate') || null,
                    acknowledgementVersion: field(data, 'acknowledgementVersion'),
                    evidenceReference: field(data, 'evidenceReference'),
                  })
                  result.reload()
                }}
              >
                <Select
                  label="Screening decision"
                  name="status"
                  options={['pending', 'cleared', 'failed', 'expired']}
                  defaultValue={provider.screening?.status ?? 'pending'}
                />
                <div className="form-row">
                  <Field
                    label="Screening review expiry (required for clearance)"
                    name="validUntil"
                    type="datetime-local"
                    defaultValue={
                      provider.screening?.validUntil ? dateInput(provider.screening.validUntil) : ''
                    }
                  />
                  <Field
                    label="Safeguarding training completion date (leave blank if not completed)"
                    name="trainingDate"
                    type="date"
                    defaultValue={provider.screening?.trainingDate ?? ''}
                  />
                </div>
                <Field
                  label="Acknowledged safeguarding code version (required for clearance)"
                  name="acknowledgementVersion"
                  defaultValue={provider.screening?.acknowledgementVersion}
                  maxLength={80}
                />
                <Field
                  label="Screening and training verification reference (not background-check contents)"
                  name="evidenceReference"
                  defaultValue={provider.screening?.evidenceReference}
                  maxLength={300}
                  required
                />
              </ActionForm>
              <HistoryRecords kind="screening" resource={provider.id} />
            </Panel>
          )}
          {financial && (
            <Panel title="Restricted compensation / service arrangement">
              <ActionForm
                submit="Record service arrangement"
                onSubmit={async (data) => {
                  await api(`/operations/providers/${provider.id}/agreement`, 'PUT', {
                    arrangement: field(data, 'arrangement'),
                    amountMinor: numberField(data, 'amountMinor'),
                    currency: field(data, 'currency'),
                  })
                  result.reload()
                }}
              >
                <TextArea
                  label="Agreed service arrangement (not payroll or an employment determination)"
                  name="arrangement"
                  defaultValue={provider.agreement?.arrangement}
                  maxLength={2000}
                  required
                />
                <div className="form-row">
                  <Field
                    label="Agreed amount in minor currency units"
                    name="amountMinor"
                    type="number"
                    min={0}
                    max={1000000000}
                    defaultValue={provider.agreement?.amountMinor ?? 0}
                    required
                  />
                  <Field
                    label="Arrangement currency"
                    name="currency"
                    defaultValue={provider.agreement?.currency ?? 'KES'}
                    pattern="[A-Z]{3}"
                    required
                  />
                </div>
              </ActionForm>
              <HistoryRecords kind="agreement" resource={provider.id} />
            </Panel>
          )}
        </div>
      )}
    </>
  )
}

function ContributionsPanel({ manager }: { manager: boolean }) {
  const [asOf] = useState(() => new Date().toISOString().slice(0, 10))
  const { user } = useAuth()
  const directory = useResource<Directory>(manager ? '/operations/directory' : null)
  const result = useResource<{
    contributions: {
      id: string
      userId: string
      name: string
      title: string
      date: string
      minutes: number
      activity: string
      verified: boolean
    }[]
  }>('/operations/contributions')
  return (
    <>
      <Panel title="Record an assigned contributor’s work">
        <Loading {...directory} retry={directory.reload} />
        <ActionForm
          submit="Record contribution for review"
          onSubmit={async (data) => {
            await api('/operations/contributions', 'POST', {
              programmeId: field(data, 'programmeId'),
              userId: manager ? field(data, 'userId') : user?.id,
              date: field(data, 'date'),
              minutes: numberField(data, 'minutes'),
              activity: field(data, 'activity'),
            })
            result.reload()
          }}
        >
          {manager ? (
            <>
              <Select
                label="Contribution programme"
                name="programmeId"
                options={options(directory.data?.programmes ?? [])}
                required
              />
              <Select
                label="Assigned contributor"
                name="userId"
                options={options(directory.data?.users.filter((u) => u.role !== 'finance') ?? [])}
                required
              />
            </>
          ) : (
            <Field label="Assigned programme identifier" name="programmeId" required />
          )}
          <div className="form-row">
            <Field label="Contribution date" name="date" type="date" max={asOf} required />
            <Field
              label="Minutes contributed"
              name="minutes"
              type="number"
              min={1}
              max={1440}
              required
            />
          </div>
          <TextArea
            label="Activity delivered (no participant names)"
            name="activity"
            maxLength={1000}
            required
          />
        </ActionForm>
      </Panel>
      <Loading {...result} retry={result.reload} />
      {result.data?.contributions.map((c) => (
        <Panel key={c.id} title={`${c.name} · ${c.title}`}>
          <p>
            {c.date} · {c.minutes} minutes ·{' '}
            {c.verified ? 'Verified' : 'Self/staff reported, not yet verified'}
          </p>
          <p>{c.activity}</p>
          {manager && !c.verified && (
            <ActionForm
              submit="Verify contribution as a different manager"
              onSubmit={async () => {
                await api(`/operations/contributions/${c.id}/verify`, 'POST')
                result.reload()
              }}
            >
              <Field
                type="checkbox"
                label="I checked this contribution and am neither its recorder nor its beneficiary."
                required
              />
            </ActionForm>
          )}
        </Panel>
      ))}
    </>
  )
}

interface FundingData {
  sources: { id: string; name: string; kind: string; contact: string }[]
  awards: FundingAward[]
  actions: FinancialAction[]
}
function FundingPanel() {
  const { user } = useAuth()
  const result = useResource<FundingData>('/operations/funding')
  const directory = useResource<Directory>('/operations/directory')
  const donations = useResource<{ enquiries: Enquiry[] }>('/staff/enquiries?kind=donation')
  const [awardId, setAwardId] = useState('')
  const selected = result.data?.awards.find((a) => a.id === awardId)
  return (
    <>
      <Panel title="Funding register, not an accounting system">
        <p>
          Amounts are in minor currency units (100 KES cents = KES 1). Pledges are not cash.
          Restricted allocations, expenditure and receipt adjustments require a different explicitly
          authorised approver. Link existing verified donations; do not record them twice. Programme
          seat-award budgets remain separately approved in programme configuration and must be
          reconciled to this cash register manually.
        </p>
        <a className="button secondary" href="/api/operations/funding/export">
          Download reconciliation CSV
        </a>
        <Loading {...result} retry={result.reload} />
        <Loading {...directory} retry={directory.reload} />
        <Loading {...donations} retry={donations.reload} />
      </Panel>
      <Panel title="Register a donor or funding source">
        <ActionForm
          submit="Create funding source"
          onSubmit={async (data) => {
            await api('/operations/funding/sources', 'POST', {
              name: field(data, 'name'),
              kind: field(data, 'kind'),
              contact: field(data, 'contact'),
            })
            result.reload()
          }}
        >
          <Field label="Source / donor name (restricted)" name="name" maxLength={160} required />
          <Select
            label="Source type"
            name="kind"
            options={[
              'individual',
              'corporate',
              'institutional',
              'foundation',
              'grant-provider',
              'in-kind',
            ]}
          />
          <Field label="Necessary donor contact (optional)" name="contact" maxLength={300} />
        </ActionForm>
      </Panel>
      <Panel title="Register a donation, grant or in-kind contribution">
        <ActionForm
          submit="Create funding award"
          onSubmit={async (data) => {
            await api('/operations/funding/awards', 'POST', {
              sourceId: field(data, 'sourceId'),
              donationId: field(data, 'donationId') || null,
              reference: field(data, 'reference'),
              title: field(data, 'title'),
              kind: field(data, 'kind'),
              currency: field(data, 'currency'),
              pledgedMinor: numberField(data, 'pledgedMinor'),
              restrictedProgrammes: data.getAll('restrictedProgrammes').map(String),
              applicationStatus: field(data, 'applicationStatus'),
              awardDate: field(data, 'awardDate') || null,
              reportingDue: field(data, 'reportingDue') || null,
              conditions: field(data, 'conditions'),
              inKindDescription: field(data, 'inKindDescription'),
            })
            result.reload()
          }}
        >
          <Select
            label="Funding source"
            name="sourceId"
            options={options(result.data?.sources ?? [])}
            required
          />
          <Field label="Unique grant / award reference" name="reference" maxLength={160} required />
          <Field label="Funding award title" name="title" maxLength={200} required />
          <div className="form-row">
            <Select
              label="Contribution kind"
              name="kind"
              options={['donation', 'grant', 'in-kind']}
            />
            <Select
              label="Existing verified donation receipt (required for monetary donations)"
              name="donationId"
              options={[
                none,
                ...(donations.data?.enquiries
                  .filter((d) => ['verified', 'allocated'].includes(d.status))
                  .map((d) => ({
                    value: d.id,
                    name: `${d.receiptReference} · ${d.data.organisation || d.data.name}`,
                  })) ?? []),
              ]}
            />
          </div>
          <div className="form-row">
            <Field
              label="Pledged amount in minor units (not cash)"
              name="pledgedMinor"
              type="number"
              defaultValue={0}
              min={0}
              max={1000000000}
              required
            />
            <Field
              label="Funding currency"
              name="currency"
              defaultValue="KES"
              pattern="[A-Z]{3}"
              required
            />
          </div>
          <Select
            label="Restricted to programmes (leave unselected for unrestricted funding)"
            name="restrictedProgrammes"
            multiple
            options={options(directory.data?.programmes ?? [])}
          />
          <Select
            label="Grant application status"
            name="applicationStatus"
            options={['not-applicable', 'preparing', 'submitted', 'awarded', 'declined']}
          />
          <div className="form-row">
            <Field label="Grant award date" name="awardDate" type="date" />
            <Field label="Grant report deadline" name="reportingDue" type="date" />
          </div>
          <TextArea label="Grant conditions / restrictions" name="conditions" maxLength={3000} />
          <TextArea
            label="In-kind items or services received (no cash balance)"
            name="inKindDescription"
            maxLength={2000}
          />
        </ActionForm>
      </Panel>
      <Panel title="Review a funding award">
        <Select
          label="Funding award to manage"
          value={awardId}
          onChange={(e) => setAwardId(e.target.value)}
          options={[none, ...options(result.data?.awards ?? [])]}
        />
        {selected && (
          <div key={selected.id}>
            <p>
              <strong>{selected.title}</strong> ·{' '}
              {selected.restrictedProgrammes.length
                ? 'Restricted to selected programmes'
                : 'Unrestricted'}{' '}
              · {label(selected.applicationStatus)}
            </p>
            <p>
              Pledged: {money(selected.pledgedMinor, selected.currency)}. Verified cash:{' '}
              {money(selected.receivedMinor, selected.currency)}. Allocated:{' '}
              {money(selected.allocatedMinor, selected.currency)}. Spent:{' '}
              {money(selected.spentMinor, selected.currency)}.
            </p>
            {selected.inKindDescription && <p>In-kind: {selected.inKindDescription}</p>}
            <ActionForm
              submit="Update grant administration (audited)"
              onSubmit={async (data) => {
                await api(`/operations/funding/awards/${selected.id}`, 'PATCH', {
                  applicationStatus: field(data, 'applicationStatus'),
                  awardDate: field(data, 'awardDate') || null,
                  reportingDue: field(data, 'reportingDue') || null,
                  conditions: field(data, 'conditions'),
                })
                result.reload()
              }}
            >
              <Select
                label="Updated grant status"
                name="applicationStatus"
                defaultValue={selected.applicationStatus}
                options={['not-applicable', 'preparing', 'submitted', 'awarded', 'declined']}
              />
              <div className="form-row">
                <Field
                  label="Confirmed grant award date"
                  type="date"
                  name="awardDate"
                  defaultValue={selected.awardDate ?? ''}
                />
                <Field
                  label="Next grant reporting deadline"
                  type="date"
                  name="reportingDue"
                  defaultValue={selected.reportingDue ?? ''}
                />
              </div>
              <TextArea
                label="Grant administrative conditions (programme restrictions and currency are immutable)"
                name="conditions"
                defaultValue={selected.conditions}
                maxLength={3000}
              />
            </ActionForm>
            <HistoryRecords kind="award" resource={selected.id} />
            {selected.kind !== 'in-kind' && (
              <ActionForm
                submit="Propose financial action for independent approval"
                onSubmit={async (data) => {
                  await api('/operations/funding/actions', 'POST', {
                    awardId: selected.id,
                    programmeId: field(data, 'programmeId') || null,
                    kind: field(data, 'kind'),
                    amountMinor: numberField(data, 'amountMinor'),
                    reference: field(data, 'reference'),
                    reason: field(data, 'reason'),
                  })
                  result.reload()
                }}
              >
                <Select
                  label="Financial action type"
                  name="kind"
                  options={['receipt', 'allocate', 'release', 'expenditure']}
                />
                <Select
                  label="Programme (none for receipt or receipt correction)"
                  name="programmeId"
                  options={[none, ...options(directory.data?.programmes ?? [])]}
                />
                <Field
                  label="Action amount in minor units (negative only for receipt corrections)"
                  name="amountMinor"
                  type="number"
                  min={-1000000000}
                  max={1000000000}
                  required
                />
                <Field
                  label="Unique bank / transaction / adjustment reference"
                  name="reference"
                  maxLength={160}
                  required
                />
                <TextArea
                  label="Verified evidence and reason (no payment credentials)"
                  name="reason"
                  maxLength={1000}
                  required
                />
              </ActionForm>
            )}
          </div>
        )}
      </Panel>
      <Panel title="Financial action history & pending approvals">
        {result.data?.actions.map((a) => (
          <div key={a.id} className="funding-editor">
            <h3>
              {label(a.kind)} · {a.reference} · {label(a.status)}
            </h3>
            <p>
              {result.data?.awards.find((award) => award.id === a.awardId)?.title} ·{' '}
              {money(
                a.amountMinor,
                result.data?.awards.find((award) => award.id === a.awardId)?.currency ?? 'KES',
              )}{' '}
              ·{' '}
              {directory.data?.programmes.find((p) => p.id === a.programmeId)?.title ??
                'Award receipt'}
            </p>
            <p>{a.reason}</p>
            <p className="small">
              Proposed {a.created_at} by{' '}
              {directory.data?.users.find((u) => u.id === a.proposed_by)?.name ?? a.proposed_by}.{' '}
              {a.reviewed_at &&
                `Reviewed ${a.reviewed_at} by ${directory.data?.users.find((u) => u.id === a.reviewed_by)?.name ?? a.reviewed_by}.`}
            </p>
            {a.status === 'pending' &&
              (a.proposed_by === user?.id ? (
                <p>A different authorised approver must review your proposal.</p>
              ) : user?.permissions?.includes('finance-approver') ? (
                <div className="form-row">
                  <ActionForm
                    submit="Approve immutable financial proposal"
                    onSubmit={async () => {
                      await api(`/operations/funding/actions/${a.id}/review`, 'POST', {
                        approve: true,
                      })
                      result.reload()
                    }}
                  >
                    <Field
                      type="checkbox"
                      label="I checked the underlying evidence, currency, restrictions and amount."
                      required
                    />
                  </ActionForm>
                  <ActionForm
                    submit="Reject financial proposal"
                    onSubmit={async () => {
                      await api(`/operations/funding/actions/${a.id}/review`, 'POST', {
                        approve: false,
                      })
                      result.reload()
                    }}
                  >
                    <Field
                      type="checkbox"
                      label="Reject this proposal without moving funds."
                      required
                    />
                  </ActionForm>
                </div>
              ) : (
                <p>Explicit finance-approver permission is required for review.</p>
              ))}
          </div>
        ))}
        {result.data?.actions.length === 0 && <p>No financial movements recorded.</p>}
      </Panel>
    </>
  )
}

function ImpactPanel() {
  const [generatedDate] = useState(() => new Date().toLocaleDateString())
  const { user } = useAuth()
  const financial = user?.role === 'admin'
  const directory = useResource<Directory>('/operations/directory')
  const locations = useResource<{ locations: Location[] }>('/operations/locations')
  const sources = useResource<FundingData>(financial ? '/operations/funding' : null)
  const [query, setQuery] = useState('')
  const result = useResource<{ records: ImpactRow[]; note: string }>(`/operations/impact${query}`)
  return (
    <>
      <Panel title="Generate an aggregate programme impact report" className="no-print">
        <p>
          Date filters select overlapping programme delivery periods, not individual attendance
          dates. Metrics cover each selected programme’s lifetime. Group filters apply to
          participation metrics only and omit whole-programme custom indicators. Sponsor/partner
          filters use authorised funding-source associations. Review all narrative for private
          information before sharing.
        </p>
        <Loading {...directory} retry={directory.reload} />
        <Loading {...locations} retry={locations.reload} />
        <Loading {...sources} retry={sources.reload} />
        <ActionForm
          submit="Generate impact report"
          onSubmit={async (data) => {
            const search = new URLSearchParams()
            for (const [k, v] of data) if (typeof v === 'string' && v) search.set(k, v)
            setQuery(search.size ? `?${search}` : '')
            result.reload()
          }}
        >
          <div className="form-row">
            <Field label="Programme period from" name="from" type="date" />
            <Field label="Programme period to" name="to" type="date" />
          </div>
          <div className="form-row">
            <Select
              label="Report programme"
              name="programme"
              options={[
                { value: '', name: 'All programmes' },
                ...options(directory.data?.programmes ?? []),
              ]}
            />
            <Select
              label="Report location"
              name="location"
              options={[
                { value: '', name: 'All locations' },
                ...options(locations.data?.locations ?? []),
              ]}
            />
          </div>
          <div className="form-row">
            <Select
              label="Programme category"
              name="category"
              options={[
                '',
                'course',
                'bootcamp',
                'workshop',
                'outreach',
                'hackathon',
                'competition',
              ]}
            />
            <Select
              label="Participant age group"
              name="group"
              options={[
                { value: '', name: 'All age groups' },
                { value: '6-12', name: 'Ages 6–12' },
                { value: '13-17', name: 'Ages 13–17' },
                { value: '18+', name: 'Adults' },
              ]}
            />
            {financial && (
              <Select
                label="Funding source / authorised sponsor"
                name="source"
                options={[
                  { value: '', name: 'All sources' },
                  ...options(sources.data?.sources ?? []),
                ]}
              />
            )}
          </div>
        </ActionForm>
        <div className="dashboard-toolbar">
          <a className="button secondary" href={`/api/operations/impact/export${query}`}>
            Download aggregate CSV
          </a>
          <button
            className="button secondary"
            onClick={() => window.print()}
            disabled={!result.data}
          >
            Print / Save report as PDF
          </button>
        </div>
      </Panel>
      <Loading {...result} retry={result.reload} />
      {result.data && (
        <article className="impact-report">
          <h2>Techducate Africa · Programme impact report</h2>
          <p>
            Generated {generatedDate} · Filters:{' '}
            {query ? new URLSearchParams(query).toString() : 'All programmes'}
          </p>
          <p className="small">{result.data.note}</p>
          {result.data.records.length === 0 && (
            <p>No programmes match these filters. No impact is claimed.</p>
          )}
          {result.data.records.map((r) => (
            <Panel title={r.title} key={r.programmeId}>
              <p>{r.overview}</p>
              <p>
                {r.location} · {label(r.category)} · {r.period}
              </p>
              <p>
                <strong>Objectives:</strong> {r.objectives || 'Not yet recorded'}
              </p>
              <p>
                <strong>Target beneficiaries:</strong> {r.beneficiaryGroup || 'Not yet recorded'}.
                Planned places: {r.planned}.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Recorded output / activity</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Applications', r.applications],
                      ['Approved places (not unique learners)', r.approvedPlaces],
                      ['Places with at least one recorded attendance', r.attendedPlaces],
                      ['All published lessons self-recorded complete', r.lessonCompletions],
                      ['Project submissions (not assessed success)', r.projects],
                      ['Approved scholarship places', r.scholarships],
                    ].map(([title, value]) => (
                      <tr key={title}>
                        <td>{title}</td>
                        <td>{value ?? '— suppressed'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>Separately evidenced outputs & outcomes</h3>
              {r.indicators.length ? (
                r.indicators.map((i, index) => (
                  <p key={index}>
                    <strong>
                      {label(i.kind)}: {i.name}
                    </strong>{' '}
                    · Reviewed snapshot: {i.value ?? '— unreviewed / suppressed'} {i.unit}; target{' '}
                    {i.target}.
                  </p>
                ))
              ) : (
                <p>
                  No reviewed custom evidence is included. Attendance does not establish learning or
                  a long-term outcome.
                </p>
              )}
              {r.funding?.map((f) => (
                <p key={f.currency}>
                  <strong>Operational funding ({f.currency}):</strong> Linked awards’ total cash
                  received {money(f.receivedMinor, f.currency)} (may support multiple programmes; do
                  not sum this across programme reports). Programme cash allocated{' '}
                  {money(f.allocatedMinor, f.currency)}; approved expenditure{' '}
                  {money(f.spentMinor, f.currency)}. Separately configured programme seat-award
                  budget {money(f.approvedBudgetMinor, f.currency)}. These are not accounting
                  balances or proof of donor-caused outcomes.
                </p>
              ))}
              <p>
                <strong>Challenges & lessons:</strong> {r.challenges || 'Not yet recorded'}
              </p>
              <p>
                <strong>Next steps:</strong> {r.nextSteps || 'Not yet recorded'}
              </p>
              <p className="small">
                No child photographs, identities, private evidence or contact details are included.
                Narrative requires an authorised human privacy check before external sharing.
              </p>
            </Panel>
          ))}
        </article>
      )}
    </>
  )
}
