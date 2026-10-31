import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  CalendarDays,
  CheckCircle2,
  BookOpen,
  Bell,
  ArrowRight,
  ShieldCheck,
  Users,
  Trophy,
} from 'lucide-react'
import type {
  Application,
  Programme,
  ScheduledSession,
  Notification,
  Lesson,
  Team,
  Project,
  User,
} from '../shared/domain'
import { api, checked, field, formatDate, label, useResource } from './api'
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

export function AuthPage({ register = false }: { register?: boolean }) {
  const { accept, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { from?: string } | null
  const from =
    state?.from?.startsWith('/') && !state.from.startsWith('//') ? state.from : '/dashboard'
  return (
    <section className="container section auth-layout">
      <div>
        <span className="eyebrow">
          <span />
          {register ? 'YOUR NEXT CHAPTER' : 'GOOD TO SEE YOU'}
        </span>
        <h1>
          {register
            ? 'A world of possibility.\nOne place to start.'
            : 'Welcome back,\ncurious mind.'}
        </h1>
        <p>
          {register
            ? 'Create an adult or guardian account to apply for programmes, follow your progress and keep up with your learning community.'
            : 'Sign in to see applications, learning materials, schedules and the next step on your journey.'}
        </p>
        <div className="auth-illustration" aria-hidden="true">
          <BookOpen size={65} strokeWidth={1} />
          <span>learn. build. belong.</span>
        </div>
      </div>
      <Panel title={register ? 'Create your account' : 'Sign in to your account'}>
        {user ? (
          <>
            <p>You’re already signed in as {user.name}.</p>
            <ArrowLink to="/dashboard">Go to My learning</ArrowLink>
          </>
        ) : (
          <ActionForm
            key={register ? 'register' : 'login'}
            submit={register ? 'Create account' : 'Sign in'}
            onSubmit={async (data) => {
              const body = {
                email: field(data, 'email'),
                password: field(data, 'password'),
                ...(register ? { name: field(data, 'name'), adult: checked(data, 'adult') } : {}),
              }
              const result = await api<{ user: User; csrf: string }>(
                `/auth/${register ? 'register' : 'login'}`,
                'POST',
                body,
              )
              accept(result)
              navigate(from, { replace: true })
            }}
          >
            {register && (
              <Field
                label="Your full name (adult)"
                name="name"
                autoComplete="name"
                maxLength={80}
                required
              />
            )}
            <Field
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={register ? 12 : 1}
              maxLength={128}
              required
              hint={
                register
                  ? 'Use at least 12 characters. Never reuse a password from another site.'
                  : undefined
              }
            />
            {register && (
              <>
                <Field
                  type="checkbox"
                  name="adult"
                  label="I am 18 or older. I will manage this account and any application for a child in my care."
                  required
                />
                <p className="small muted">
                  By creating an account, you acknowledge our{' '}
                  <Link to="/privacy">privacy & safeguarding notice</Link>.
                </p>
              </>
            )}
          </ActionForm>
        )}
        <div className="auth-switch">
          {register ? (
            <>
              Already part of the community?{' '}
              <Link to="/login" state={state}>
                Sign in <ArrowRight size={14} />
              </Link>
            </>
          ) : (
            <>
              New to Techducate?{' '}
              <Link to="/register" state={state}>
                Create an account <ArrowRight size={14} />
              </Link>
            </>
          )}
        </div>
        {!register && (
          <details className="help-details">
            <summary>Forgot your password?</summary>
            <p>
              Automatic recovery emails are not enabled. <Link to="/contact">Contact the team</Link>{' '}
              to verify account ownership and request a secure, time-limited recovery link. Never
              send your password.
            </p>
          </details>
        )}
      </Panel>
    </section>
  )
}
export function ResetPassword() {
  const [token] = useState(() => {
    const value = window.location.hash.slice(1)
    window.history.replaceState(null, '', window.location.pathname)
    return value
  })
  return (
    <section className="container section narrow">
      <Panel title="A fresh start for your account">
        {token ? (
          <ActionForm
            submit="Change password"
            onSubmit={async (data) => {
              const result = await api<{ message: string }>('/auth/reset', 'POST', {
                token,
                password: field(data, 'password'),
              })
              return result.message
            }}
          >
            <Field
              type="password"
              label="New password"
              name="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </ActionForm>
        ) : (
          <p>
            A valid recovery link is required. <Link to="/contact">Contact the team</Link> to
            request one.
          </p>
        )}
        <Link className="text-link" to="/login">
          Back to sign in <ArrowRight size={16} />
        </Link>
      </Panel>
    </section>
  )
}
interface DashboardData {
  applications: Application[]
  assigned: Programme[]
  schedule: ScheduledSession[]
  notifications: Notification[]
}
export function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const result = useResource<DashboardData>('/dashboard')
  const [accountTools, setAccountTools] = useState(false)
  return (
    <>
      <PageIntro eyebrow="YOUR LEARNING COMMUNITY" title={`Hello, ${user?.name.split(' ')[0]}.`}>
        A little progress today. A little more possibility tomorrow.
      </PageIntro>
      <section className="container section">
        <div className="dashboard-toolbar">
          <Link className="button secondary" to="/safety">
            Guardian permissions & safeguarding
          </Link>
          {['admin', 'manager', 'finance', 'instructor'].includes(user?.role ?? '') && (
            <Link className="button secondary" to="/operations">
              Delivery, funding & impact
            </Link>
          )}
          <Link className="button secondary" to="/programmes">
            Explore opportunities <ArrowRight size={17} />
          </Link>
          {['admin', 'manager', 'finance'].includes(user?.role ?? '') && (
            <Link className="button" to="/admin">
              Team operations <ArrowRight size={17} />
            </Link>
          )}
          <button className="text-button" onClick={() => setAccountTools((value) => !value)}>
            Account & sign out
          </button>
        </div>
        {accountTools && (
          <Panel title="Your account">
            <p>
              {user?.email} · {label(user?.role ?? '')}
            </p>
            <ActionForm
              submit="Sign out"
              onSubmit={async () => {
                await logout()
                navigate('/')
              }}
            >
              <p>Your session will end on this browser.</p>
            </ActionForm>
            <details className="help-details">
              <summary>Delete this account and linked learning records</summary>
              <ActionForm
                submit="Permanently delete my account"
                onSubmit={async (data) => {
                  await api('/account', 'DELETE', { password: field(data, 'password') })
                  await logout()
                  navigate('/')
                }}
              >
                <p>
                  Deletion removes applications, learning progress, attendance, teams you lead and
                  project records. Public enquiries and financial retention must be reviewed
                  separately by the team. This cannot be undone.
                </p>
                <Field
                  label="Confirm your password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                />
                <Field
                  name="confirm"
                  type="checkbox"
                  label="I understand this permanently deletes my linked learning records."
                  required
                />
              </ActionForm>
            </details>
          </Panel>
        )}
        <Loading {...result} retry={result.reload} />
        {result.data && (
          <div className="dashboard-grid">
            <div>
              {result.data.assigned.length > 0 && (
                <Panel title="Programmes you support">
                  <div className="record-list">
                    {result.data.assigned.map((p) => (
                      <div className="record" key={p.id}>
                        <div>
                          <Badge>{label(p.type)}</Badge>
                          <h3>{p.title}</h3>
                        </div>
                        <Link className="text-link" to={`/manage/${p.id}`}>
                          Manage programme <ArrowUpRightIcon />
                        </Link>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
              <Panel title="Your applications & learning">
                {result.data.applications.length ? (
                  <div className="record-list">
                    {result.data.applications.map((a) => (
                      <div className="record" key={a.id}>
                        <div>
                          <div className="badge-row">
                            <Badge green={a.status === 'approved'}>{label(a.status)}</Badge>
                            <Badge>{label(a.mode)}</Badge>
                          </div>
                          <h3>
                            <Link to={`/programmes/${a.programmeId}`}>{a.title}</Link>
                          </h3>
                          <p>
                            {a.participantName} · {a.ageBand}
                            {a.ageBand !== '18+' &&
                              ` · Guardian consent ${a.consentVerified ? 'reviewed' : 'awaiting verification'}`}
                          </p>
                          {['paid', 'subsidised'].includes(a.mode) && (
                            <small>
                              Payment: {label(a.paymentStatus)} · Payments are reviewed by staff,
                              not processed here.
                            </small>
                          )}
                        </div>
                        {a.status === 'approved' &&
                        (a.ageBand === '18+' || a.consentVerified) &&
                        (!['paid', 'subsidised'].includes(a.mode) ||
                          a.paymentStatus === 'verified') ? (
                          <Link className="button secondary" to={`/learn/${a.programmeId}`}>
                            Open learning <BookOpen size={16} />
                          </Link>
                        ) : (
                          <span className="small muted">Staff review required</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty title="Your next chapter is waiting.">
                    Discover a programme and apply. Your application status and learning will appear
                    here.
                  </Empty>
                )}
              </Panel>
              <Panel title="Your schedule">
                <ScheduleList sessions={result.data.schedule} />
              </Panel>
            </div>
            <aside>
              <Panel title="Your updates">
                {result.data.notifications.length ? (
                  result.data.notifications.map((n) => (
                    <div className={`notification ${n.readAt ? 'read' : ''}`} key={n.id}>
                      <Bell size={16} />
                      <div>
                        <p>{n.message}</p>
                        <small>{formatDate(n.createdAt)}</small>
                        {!n.readAt && (
                          <ActionForm
                            submit="Mark as read"
                            onSubmit={async () => {
                              await api(`/notifications/${n.id}/read`, 'POST', {})
                              result.reload()
                            }}
                          >
                            <span className="sr-only">Mark this notification as read</span>
                          </ActionForm>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    Application and schedule updates will appear here. No email, SMS or WhatsApp
                    messages are sent.
                  </p>
                )}
              </Panel>
              <div className="care-note">
                <ShieldCheck size={25} />
                <h3>Your space. Kept private.</h3>
                <p>
                  Learning records and project links aren’t public. Guardians manage access for
                  children in their care.
                </p>
                <Link to="/privacy">
                  Privacy & safeguarding <ArrowRight size={15} />
                </Link>
              </div>
            </aside>
          </div>
        )}
      </section>
    </>
  )
}
function ArrowUpRightIcon() {
  return <ArrowRight size={16} />
}
export function ScheduleList({ sessions }: { sessions: ScheduledSession[] }) {
  return sessions.length ? (
    <div className="schedule-list">
      {sessions.map((session) => (
        <div className="schedule-item" key={session.id}>
          <span className="schedule-icon">
            <CalendarDays size={21} />
          </span>
          <div>
            <h3>{session.title}</h3>
            {session.programmeTitle && <p>{session.programmeTitle}</p>}
            <p>
              {formatDate(session.startsAt)} – {formatDate(session.endsAt)}
            </p>
            <p>{session.location}</p>
            {session.joiningUrl && (
              <a
                className="text-link"
                href={session.joiningUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open session link <ArrowRight size={15} />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="muted">
      No sessions have been scheduled. New sessions and changes will appear here.
    </p>
  )
}
export function Learning() {
  const { id } = useParams()
  const programme = useResource<{ programme: Programme }>(`/programmes/${id}`)
  const lessons = useResource<{ lessons: Lesson[] }>(`/programmes/${id}/lessons`)
  const schedule = useResource<{ sessions: ScheduledSession[] }>(`/programmes/${id}/schedule`)
  const [selected, setSelected] = useState<string | null>(null)
  const active =
    lessons.data?.lessons.find((lesson) => lesson.id === selected) ?? lessons.data?.lessons[0]
  const total = lessons.data?.lessons.length ?? 0
  const complete = lessons.data?.lessons.filter((lesson) => lesson.done).length ?? 0
  return (
    <>
      <PageIntro
        eyebrow="YOUR LEARNING SPACE"
        title={programme.data?.programme.title ?? 'Make a little progress.'}
      >
        One step at a time. Your progress is saved to your account.
      </PageIntro>
      <section className="container section">
        <Link className="text-link back-link" to="/dashboard">
          ← Back to My learning
        </Link>
        <Loading {...lessons} retry={lessons.reload} />
        <Loading {...programme} retry={programme.reload} />
        {lessons.data && (
          <div className="learning-grid">
            <aside className="panel">
              <h2>Learning pathway</h2>
              <label className="progress-label">
                {complete} of {total} lessons completed
                <progress max={total || 1} value={complete} />
              </label>
              {lessons.data.lessons.map((lesson) => (
                <button
                  className={`lesson-choice ${lesson.id === active?.id ? 'selected' : ''}`}
                  key={lesson.id}
                  onClick={() => setSelected(lesson.id)}
                >
                  {lesson.done ? <CheckCircle2 size={18} /> : <BookOpen size={18} />}
                  <span>
                    <small>{lesson.module}</small>
                    {lesson.title}
                  </span>
                </button>
              ))}
            </aside>
            <div>
              {active ? (
                <Panel>
                  <Badge>{active.module}</Badge>
                  <h2>{active.title}</h2>
                  <div className="lesson-body preserve">{active.body}</div>
                  {active.done ? (
                    <div className="alert success">
                      <CheckCircle2 size={19} />
                      Lesson complete. Keep going!
                    </div>
                  ) : (
                    <ActionForm
                      submit="Mark lesson complete"
                      onSubmit={async () => {
                        await api(`/programmes/${id}/lessons/${active.id}/complete`, 'POST', {})
                        lessons.reload()
                      }}
                    >
                      <p className="muted small">
                        When you’re ready, record that you’ve worked through this lesson.
                      </p>
                    </ActionForm>
                  )}
                </Panel>
              ) : (
                <Empty title="Learning content is on its way.">
                  Your facilitator hasn’t published lessons for this programme yet. Check your
                  schedule for live sessions.
                </Empty>
              )}
              {total > 0 && total === complete && (
                <Panel title="How was the learning?">
                  <ActionForm
                    submit="Save course rating"
                    onSubmit={async (data) => {
                      await api(`/programmes/${id}/rating`, 'POST', {
                        rating: Number(field(data, 'rating')),
                      })
                      return 'Your rating has been saved.'
                    }}
                  >
                    <Select label="Your rating" name="rating" options={['5', '4', '3', '2', '1']} />
                  </ActionForm>
                </Panel>
              )}
            </div>
          </div>
        )}
        {schedule.data && (
          <Panel title="Programme schedule">
            <ScheduleList sessions={schedule.data.sessions} />
          </Panel>
        )}
        <Loading {...schedule} retry={schedule.reload} />
        {lessons.data &&
          programme.data &&
          ['hackathon', 'competition'].includes(programme.data.programme.type) && (
            <EventWorkspace programme={programme.data.programme} />
          )}
      </section>
    </>
  )
}
export function EventWorkspace({
  programme,
  staff = false,
  canJudge = false,
}: {
  programme: Programme
  staff?: boolean
  canJudge?: boolean
}) {
  const { user } = useAuth()
  const projects = useResource<{ projects: Project[] }>(`/programmes/${programme.id}/projects`)
  const team = useResource<{ team: Team | null }>(
    !staff && programme.event.teamsEnabled ? `/programmes/${programme.id}/team` : null,
  )
  const ownProject = projects.data?.projects[0]
  return (
    <Panel title={staff ? 'Private project submissions & judging' : 'Your innovation space'}>
      <p>
        {programme.event.teamsEnabled
          ? `Teams of up to ${programme.event.teamSize}. `
          : 'Individual submissions. '}
        Deadline: {formatDate(programme.event.deadline)}. Links remain private; unpublished scores
        are restricted.
      </p>
      {!staff && programme.event.teamsEnabled && (
        <>
          <Loading {...team} retry={team.reload} />
          {team.data &&
            (team.data.team ? (
              <div className="team-card">
                <Users size={24} />
                <h3>{team.data.team.name}</h3>
                <p>{team.data.team.members.map((member) => member.name).join(', ')}</p>
                {team.data.team.joinCode && (
                  <p className="small">
                    Private invite code: <code>{team.data.team.joinCode}</code>
                    <br />
                    Only share this with approved participants you intend to invite.
                  </p>
                )}
              </div>
            ) : (
              <div className="form-row">
                <ActionForm
                  submit="Create team"
                  onSubmit={async (data) => {
                    await api(`/programmes/${programme.id}/team`, 'POST', {
                      name: field(data, 'name'),
                    })
                    team.reload()
                  }}
                >
                  <Field label="Team name" name="name" maxLength={100} required />
                </ActionForm>
                <ActionForm
                  submit="Join team"
                  onSubmit={async (data) => {
                    await api(`/programmes/${programme.id}/team`, 'POST', {
                      joinCode: field(data, 'joinCode'),
                    })
                    team.reload()
                  }}
                >
                  <Field label="Private invite code" name="joinCode" maxLength={100} required />
                </ActionForm>
              </div>
            ))}
        </>
      )}
      <Loading {...projects} retry={projects.reload} />
      {!staff &&
        projects.data &&
        (!programme.event.teamsEnabled || team.data?.team?.leaderId === user?.id) && (
          <ActionForm
            key={ownProject?.id ?? 'new'}
            submit={ownProject ? 'Update project submission' : 'Submit your project'}
            onSubmit={async (data) => {
              await api(`/programmes/${programme.id}/projects`, 'POST', {
                title: field(data, 'title'),
                description: field(data, 'description'),
                url: field(data, 'url'),
              })
              projects.reload()
            }}
          >
            <Field
              label="Project title"
              name="title"
              defaultValue={ownProject?.title}
              maxLength={200}
              required
            />
            <TextArea
              label="Project description"
              name="description"
              defaultValue={ownProject?.description}
              maxLength={10000}
              required
            />
            <Field
              label="Private project link (HTTPS)"
              name="url"
              type="url"
              defaultValue={ownProject?.url}
              maxLength={2000}
              pattern="https://.*"
              required
              hint="Do not include secrets or children’s identifying details. File uploads are not supported."
            />
          </ActionForm>
        )}
      {projects.data?.projects.map((project) => (
        <div className="project-card" key={project.id}>
          <div className="badge-row">
            {project.winner && (
              <Badge green>
                <Trophy size={14} />
                Selected winner
              </Badge>
            )}
          </div>
          <h3>{project.title}</h3>
          <p className="preserve">{project.description}</p>
          <a className="text-link" href={project.url} target="_blank" rel="noopener noreferrer">
            View submitted project <ArrowRight size={15} />
          </a>
          {project.scores?.map((score) => (
            <div
              className="score"
              key={score.judgeId || `${score.values.join('-')}-${score.feedback}`}
            >
              <strong>Score: {score.values.reduce((sum, value) => sum + value, 0)}</strong>
              <p>{score.feedback}</p>
            </div>
          ))}
          {staff && (
            <>
              {canJudge &&
                (programme.event.criteria.length ? (
                  <ActionForm
                    submit="Save judging scores"
                    onSubmit={async (data) => {
                      await api(
                        `/staff/programmes/${programme.id}/projects/${project.id}/score`,
                        'POST',
                        {
                          values: programme.event.criteria.map((_, i) =>
                            Number(field(data, `score-${i}`)),
                          ),
                          feedback: field(data, 'feedback'),
                        },
                      )
                      projects.reload()
                    }}
                  >
                    <div className="form-row">
                      {programme.event.criteria.map((criterion, i) => (
                        <Field
                          label={`${criterion.name} (max ${criterion.maxScore})`}
                          type="number"
                          step="0.5"
                          name={`score-${i}`}
                          min={0}
                          max={criterion.maxScore}
                          defaultValue={
                            project.scores?.find((score) => score.judgeId === user?.id)?.values[i]
                          }
                          required
                          key={i}
                        />
                      ))}
                    </div>
                    <TextArea
                      label="Feedback for the participant (visible after release)"
                      name="feedback"
                      defaultValue={
                        project.scores?.find((score) => score.judgeId === user?.id)?.feedback
                      }
                      maxLength={4000}
                      required
                    />
                  </ActionForm>
                ) : (
                  <p className="muted">
                    Configure a judging rubric in programme settings to enable scoring.
                  </p>
                ))}
              {['admin', 'manager'].includes(user?.role ?? '') && (
                <ActionForm
                  submit={project.winner ? 'Remove winner selection' : 'Select as winner'}
                  onSubmit={async () => {
                    await api(
                      `/staff/programmes/${programme.id}/projects/${project.id}/winner`,
                      'PATCH',
                      { winner: !project.winner },
                    )
                    projects.reload()
                  }}
                >
                  <p className="small muted">
                    Winner selections are visible to participants only after results are released in
                    programme settings.
                  </p>
                </ActionForm>
              )}
            </>
          )}
        </div>
      ))}
      {staff && projects.data?.projects.length === 0 && (
        <Empty title="No projects submitted yet.">
          Approved participants can submit private project links before the deadline.
        </Empty>
      )}
    </Panel>
  )
}
