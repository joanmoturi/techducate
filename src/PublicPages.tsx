import { useState } from 'react'
import { Link, useSearchParams, useParams } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Code2,
  Cpu,
  Globe2,
  Heart,
  Lightbulb,
  MapPin,
  Monitor,
  ShieldCheck,
  Sparkles,
  Users,
  BookOpen,
  Handshake,
  Sprout,
  CalendarDays,
  Wifi,
} from 'lucide-react'
import type { Programme, SiteSettings, PublicSubmission } from '../shared/domain'
import { api, useResource, field, checked, money, formatDate, label } from './api'
import { useAuth } from './authContext'
import {
  ActionForm,
  ArrowLink,
  Badge,
  Empty,
  Field,
  Loading,
  PageIntro,
  SectionTitle,
  Select,
  TextArea,
} from './ui'

const pathways = [
  {
    title: 'Digital first steps',
    topic: 'digital-literacy',
    icon: Monitor,
    description: 'Build confidence with computers, the internet and staying safe online.',
    className: 'mint',
  },
  {
    title: 'Code something new',
    topic: 'coding',
    icon: Code2,
    description: 'Turn a little curiosity into websites, games and creative projects.',
    className: 'sand',
  },
  {
    title: 'Explore what comes next',
    topic: 'ai',
    icon: Sparkles,
    description: 'Get hands-on with AI, robotics and the ideas shaping our world.',
    className: 'lilac',
  },
]
export function Home() {
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <span className="pill">
            <span />
            Small sparks. Brighter futures.
          </span>
          <h1>
            Big dreams.
            <br />
            Meet{' '}
            <span className="highlight">
              real
              <br className="desktop-break" /> possibilities.
            </span>
          </h1>
          <p>
            Technology can open a world of opportunity.
            <br className="wide-only" /> We help young people find their way in — through
            <br className="wide-only" /> learning, creating and a community that cares.
          </p>
          <div className="button-row">
            <ArrowLink to="/programmes">Find your next opportunity</ArrowLink>
            <Link className="text-link" to="/about">
              Get to know us <ArrowRight size={17} />
            </Link>
          </div>
          <div className="hero-note">
            <span className="note-icon">
              <Sprout size={17} />
            </span>
            <span>Rooted in community. Growing through technology.</span>
          </div>
        </div>
        <div
          className="hero-art"
          role="img"
          aria-label="Illustrated creative learning lab with a code editor, connected ideas and a growing plant"
        >
          <div className="art-grid" />
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="floating-label">
            <span className="status-dot" />A space to discover your potential
          </div>
          <div className="code-window">
            <div className="window-bar">
              <span />
              <span />
              <span />
              <small>your-next-big-idea.ts</small>
              <Code2 size={15} />
            </div>
            <div className="code-content">
              <span className="code-line">
                <b>01</b>
                <em>const</em> future = {'{'}
              </span>
              <span className="code-line">
                <b>02</b>&nbsp; curiosity: <i>"unlimited"</i>,
              </span>
              <span className="code-line">
                <b>03</b>&nbsp; potential: <i>"yours"</i>,
              </span>
              <span className="code-line">
                <b>04</b>&nbsp; community: <i>true</i>
              </span>
              <span className="code-line">
                <b>05</b>
                {'};'}
              </span>
              <span className="code-line">
                <b>06</b>
              </span>
              <span className="code-line">
                <b>07</b>
                <strong>let’s build something.</strong>
                <span className="cursor" />
              </span>
            </div>
            <div className="window-bottom">
              <span>● Ready to make a difference</span>
              <span>UTF-8</span>
            </div>
          </div>
          <div className="idea-card">
            <Lightbulb size={26} strokeWidth={1.6} />
            <span>
              Your ideas
              <br />
              <strong>belong here.</strong>
            </span>
            <ArrowUpRight size={22} />
          </div>
          <div className="art-tile tile-code">
            <Code2 size={34} strokeWidth={1.6} />
          </div>
          <div className="art-tile tile-spark">
            <Sparkles size={32} strokeWidth={1.5} />
          </div>
          <div className="growth-card">
            <svg viewBox="0 0 170 130" aria-hidden="true">
              <path
                d="M83 112V44M83 80C35 80 36 42 36 42c47 0 47 38 47 38M84 60c0-40 44-40 44-40 0 40-44 40-44 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path d="M55 114h58" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
              <circle cx="142" cy="85" r="4" fill="currentColor" />
              <path d="M20 17v16M12 25h16" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>
              learn. build. <b>belong.</b>
            </span>
          </div>
          <span className="art-caption">
            <span />
            Made for the next generation of makers.
          </span>
        </div>
      </section>
      <section className="mission-strip">
        <div className="container">
          <span>OPPORTUNITY STARTS WITH ACCESS.</span>
          <p>
            A little support. A new skill. <strong>A whole new direction.</strong>
          </p>
          <Link to="/support">
            Be part of the change <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <section className="section container">
        <div className="heading-row">
          <SectionTitle eyebrow="A WORLD TO DISCOVER" title="Start curious. Go anywhere.">
            There’s more than one way into technology. Find a starting point that feels like you.
          </SectionTitle>
          <Link className="text-link" to="/programmes">
            Explore all programmes <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="pathway-grid">
          {pathways.map((pathway) => (
            <Link
              className={`pathway ${pathway.className}`}
              to={`/programmes?topic=${pathway.topic}`}
              key={pathway.title}
            >
              <div className="pathway-top">
                <span className="pathway-icon">
                  <pathway.icon size={27} strokeWidth={1.6} />
                </span>
                <ArrowUpRight size={22} />
              </div>
              <div>
                <h3>{pathway.title}</h3>
                <p>{pathway.description}</p>
              </div>
              <span className="card-link">
                Find a programme <ArrowRight size={17} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="impact-section">
        <div className="container impact-grid">
          <div className="impact-art" aria-hidden="true">
            <div className="impact-word">
              A little
              <br />
              access.
              <br />
              <span>
                A lot of
                <br />
                possibility.
              </span>
            </div>
            <div className="impact-symbol">
              <Globe2 size={80} strokeWidth={1} />
            </div>
            <div className="impact-tag">
              <Heart size={16} />
              People first. Always.
            </div>
          </div>
          <div className="impact-copy">
            <SectionTitle
              eyebrow="WHY WE’RE HERE"
              title="Talent is everywhere. Opportunity should be, too."
            >
              A child’s postcode or circumstances shouldn’t decide what they can become.
            </SectionTitle>
            <p>
              Techducate Africa brings technology education closer to children and communities that
              are too often left out. We focus on practical skills, creative confidence and safe
              spaces to learn.
            </p>
            <div className="principle">
              <span>
                <Users size={20} />
              </span>
              <div>
                <h3>Community at the centre</h3>
                <p>Learning that starts with people and the possibilities around them.</p>
              </div>
            </div>
            <div className="principle">
              <span>
                <Code2 size={20} />
              </span>
              <div>
                <h3>Less watching. More making.</h3>
                <p>Hands-on experiences that turn “what if” into “I made this.”</p>
              </div>
            </div>
            <ArrowLink to="/about" secondary>
              Our mission & approach
            </ArrowLink>
          </div>
        </div>
      </section>
      <section className="section container">
        <div className="heading-row">
          <SectionTitle eyebrow="MORE WAYS TO GROW" title="Find your place in the community.">
            Learn something. Share something. Help someone take their next step.
          </SectionTitle>
        </div>
        <div className="community-grid">
          <Link to="/scholarships" className="community-card">
            <BookOpen size={25} />
            <h3>Access, not obstacles.</h3>
            <p>
              Explore sponsored learning and scholarship opportunities. Eligibility and availability
              vary by programme.
            </p>
            <span>
              Explore supported learning <ArrowUpRight size={18} />
            </span>
          </Link>
          <Link to="/hackathons" className="community-card">
            <Cpu size={25} />
            <h3>Ideas into action.</h3>
            <p>Meet a challenge, build with others and put your problem-solving skills to work.</p>
            <span>
              Discover innovation events <ArrowUpRight size={18} />
            </span>
          </Link>
          <Link to="/volunteer" className="community-card">
            <Heart size={25} />
            <h3>Your skills. Shared.</h3>
            <p>
              Teach, mentor, organise or lend a hand behind the scenes. There’s more than one way to
              contribute.
            </p>
            <span>
              Become a volunteer <ArrowUpRight size={18} />
            </span>
          </Link>
        </div>
      </section>
      <section className="partner-band container">
        <div>
          <span className="eyebrow">LET’S BUILD SOMETHING MEANINGFUL</span>
          <h2>
            Big impact starts
            <br />
            with a conversation.
          </h2>
          <p>
            Sponsor a cohort. Bring a workshop to your community.
            <br className="wide-only" /> Create a challenge that gets people thinking. Let’s work
            together.
          </p>
          <ArrowLink to="/partners">Partner with Techducate</ArrowLink>
        </div>
        <div className="partner-art" aria-hidden="true">
          <span>
            <Handshake size={65} strokeWidth={1.2} />
          </span>
          <div className="partner-orbit" />
          <small>GOOD IDEAS. SHARED PURPOSE.</small>
        </div>
      </section>
      <section className="closing container">
        <Sprout size={23} />
        <p>A brighter future isn’t built alone.</p>
        <Link to="/support">
          Help open a door <ArrowRight size={19} />
        </Link>
      </section>
    </>
  )
}

export function About() {
  return (
    <>
      <PageIntro
        eyebrow="PEOPLE. POTENTIAL. POSSIBILITY."
        title="Technology is the tool. People are the point."
      >
        We’re building a community where young people can discover technology, develop confidence
        and imagine more for their future.
      </PageIntro>
      <section className="section container two-column">
        <div>
          <SectionTitle eyebrow="OUR PURPOSE" title="Opening doors through education." />
          <p className="lead">
            Techducate Africa is a nonprofit-led technology education and community outreach
            initiative focused on children, especially those from marginalised communities.
          </p>
          <p>
            Our approach connects practical learning with creativity and care. From computer
            literacy and digital safety to coding, AI and robotics, we help learners understand, use
            and create technology.
          </p>
          <p>
            Community education can serve children aged 6–18. Individual programme pages set out
            their age groups, requirements and delivery arrangements. Other programmes may serve
            students, adults and organisations.
          </p>
          <ArrowLink to="/programmes">Explore learning opportunities</ArrowLink>
        </div>
        <div className="values-grid">
          {[
            [
              Monitor,
              'Access comes first',
              'Free, sponsored and scholarship-based opportunities sit alongside paid programmes.',
            ],
            [
              ShieldCheck,
              'Learning with care',
              'Children’s participation requires guardian involvement and staff review.',
            ],
            [
              Lightbulb,
              'Make, test, discover',
              'Projects and hands-on practice help turn new skills into confidence.',
            ],
            [
              Handshake,
              'Stronger together',
              'Donors, volunteers and commissioning organisations can all help create access.',
            ],
          ].map(([Icon, title, copy]) => {
            const Symbol = Icon as typeof Monitor
            return (
              <div className="value-card" key={String(title)}>
                <Symbol size={24} />
                <h3>{String(title)}</h3>
                <p>{String(copy)}</p>
              </div>
            )
          })}
        </div>
      </section>
      <section className="container bottom-cta">
        <h2>Everyone has something to contribute.</h2>
        <div className="button-row">
          <ArrowLink to="/volunteer">Volunteer your skills</ArrowLink>
          <ArrowLink secondary to="/partners">
            Talk about a programme
          </ArrowLink>
        </div>
      </section>
    </>
  )
}

export function ProgrammeCard({ programme: p }: { programme: Programme }) {
  const Icon =
    p.type === 'hackathon'
      ? Cpu
      : p.topic === 'ai'
        ? Sparkles
        : p.topic === 'digital-literacy'
          ? Monitor
          : Code2
  const available = p.funding.filter((f) => f.capacity > 0)
  return (
    <Link className="programme-card" to={`/programmes/${p.id}`}>
      <div
        className={`programme-art ${p.topic === 'ai' ? 'lilac' : p.type === 'hackathon' ? 'dark' : 'mint'}`}
      >
        <span>{label(p.topic)}</span>
        <Icon size={64} strokeWidth={1} />
        <ArrowUpRight size={20} />
      </div>
      <div className="programme-card-content">
        <div className="badge-row">
          <Badge>{label(p.type)}</Badge>
          <Badge green>{label(p.delivery)}</Badge>
        </div>
        <h3>{p.title}</h3>
        <p>{p.summary}</p>
        <div className="programme-meta">
          <span>
            <Users size={15} />
            {label(p.audience)}
          </span>
          <span>
            <CalendarDays size={15} />
            {p.startsAt
              ? new Date(p.startsAt).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })
              : 'Dates coming soon'}
          </span>
        </div>
        <div className="programme-bottom">
          <span>
            {available
              .map((f) =>
                ['paid', 'subsidised'].includes(f.mode)
                  ? `${label(f.mode)} · ${money(f.feeMinor, f.currency)}`
                  : label(f.mode),
              )
              .join(' / ')}
          </span>
          <ArrowRight size={18} />
        </div>
      </div>
    </Link>
  )
}
export function Programmes({ category }: { category?: 'scholarships' | 'hackathons' }) {
  const result = useResource<{ programmes: Programme[] }>('/programmes')
  const [params, setParams] = useSearchParams()
  const topic = params.get('topic') ?? ''
  const query = params.get('q') ?? ''
  const type = params.get('type') ?? ''
  const [funding, setFunding] = useState('')
  const update = (key: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  const programmes = result.data?.programmes.filter(
    (p) =>
      (!topic || p.topic === topic) &&
      (!type || p.type === type) &&
      (!query || `${p.title} ${p.summary}`.toLowerCase().includes(query.toLowerCase())) &&
      (!funding || p.funding.some((f) => f.mode === funding && f.capacity > 0)) &&
      (category !== 'hackathons' || ['hackathon', 'competition'].includes(p.type)) &&
      (category !== 'scholarships' ||
        p.funding.some(
          (f) =>
            ['scholarship', 'sponsored', 'subsidised', 'partner'].includes(f.mode) &&
            f.capacity > 0,
        )),
  )
  return (
    <>
      <PageIntro
        eyebrow={
          category === 'hackathons'
            ? 'BUILD. COLLABORATE. REIMAGINE.'
            : category === 'scholarships'
              ? 'ACCESS TO POSSIBILITY'
              : 'YOUR NEXT CHAPTER'
        }
        title={
          category === 'hackathons'
            ? 'Small teams. Big ideas.'
            : category === 'scholarships'
              ? 'Potential shouldn’t have a price tag.'
              : 'A starting point for something bigger.'
        }
      >
        {category === 'scholarships'
          ? 'Find opportunities with scholarships, sponsored places or partial support. Each programme has its own eligibility criteria. Applications are reviewed by the team; funding is never guaranteed.'
          : category === 'hackathons'
            ? 'Discover hackathons, competitions and innovation challenges. Explore a problem worth solving, create something new and learn along the way.'
            : 'Explore courses, bootcamps, workshops and community programmes. Free, paid and supported learning — all in one place.'}
      </PageIntro>
      <section className="container section">
        <div className="filter-bar">
          <Field
            label="Search opportunities"
            type="search"
            value={query}
            onChange={(event) => update('q', event.target.value)}
            placeholder="What would you like to learn?"
          />
          <Select
            label="Topic"
            value={topic}
            onChange={(event) => update('topic', event.target.value)}
            options={[
              { value: '', name: 'All topics' },
              ...['digital-literacy', 'coding', 'ai', 'robotics', 'web', 'innovation'].map(
                (value) => ({ value, name: label(value) }),
              ),
            ]}
          />
          <Select
            label="Participation"
            value={funding}
            onChange={(event) => setFunding(event.target.value)}
            options={[
              { value: '', name: 'All options' },
              ...[
                'free',
                'paid',
                'scholarship',
                'sponsored',
                'subsidised',
                'partner',
                'invitation',
                'application',
              ].map((value) => ({ value, name: label(value) })),
            ]}
          />
        </div>
        <Loading {...result} retry={result.reload} />
        {programmes && (
          <>
            <p className="result-count">
              {programmes.length} {programmes.length === 1 ? 'opportunity' : 'opportunities'}{' '}
              {type && `· ${label(type)}`}
            </p>
            {programmes.length ? (
              <div className="programme-grid">
                {programmes.map((p) => (
                  <ProgrammeCard programme={p} key={p.id} />
                ))}
              </div>
            ) : (
              <Empty title="The next opportunity is still taking shape.">
                No published programmes match these filters.{' '}
                <Link to="/contact">Contact the team</Link> about future opportunities or{' '}
                <Link to="/partners">help make one happen</Link>.
              </Empty>
            )}
          </>
        )}
      </section>
    </>
  )
}
export function ProgrammeDetail() {
  const { id } = useParams()
  const result = useResource<{ programme: Programme }>(`/programmes/${id}`)
  const { user } = useAuth()
  const [now] = useState(Date.now)
  if (!result.data)
    return (
      <div className="container section">
        <Loading {...result} retry={result.reload} />
      </div>
    )
  const p = result.data.programme
  const isEvent = ['hackathon', 'competition'].includes(p.type)
  const registrationOpen =
    ['open', 'scheduled', 'full'].includes(p.status) &&
    (!p.registrationOpens || Date.parse(p.registrationOpens) <= now) &&
    (!p.registrationCloses || Date.parse(p.registrationCloses) >= now)
  return (
    <>
      <PageIntro eyebrow={`${label(p.type)} · ${label(p.topic)}`} title={p.title}>
        {p.summary}
      </PageIntro>
      <div className="container section detail-grid">
        <div>
          <div className="badge-row">
            <Badge green>{label(p.status)}</Badge>
            <Badge>{label(p.audience)}</Badge>
            <Badge>{label(p.delivery)}</Badge>
          </div>
          <h2>Make room for something new.</h2>
          <p className="preserve">{p.description}</p>
          {p.objectives && (
            <>
              <h3>What you’ll explore</h3>
              <p className="preserve">{p.objectives}</p>
            </>
          )}
          {p.eligibility && (
            <>
              <h3>Who can take part</h3>
              <p className="preserve">{p.eligibility}</p>
            </>
          )}
          <p>
            <strong>Experience:</strong> {p.experience}
          </p>
          <p>
            <strong>Starts:</strong> {formatDate(p.startsAt)}
          </p>
          <p>
            <strong>Ends:</strong> {formatDate(p.endsAt)}
          </p>
          <p>
            <MapPin size={16} /> {p.location || label(p.delivery)}
          </p>
          <p>
            <strong>Registration:</strong>{' '}
            {p.registrationOpens
              ? formatDate(p.registrationOpens)
              : 'Open according to programme status'}{' '}
            – {p.registrationCloses ? formatDate(p.registrationCloses) : 'Until closed by the team'}
          </p>
          {isEvent && (
            <div className="panel">
              <h2>The challenge</h2>
              <p className="preserve">
                {p.event.challenge || 'The organisers will share the challenge with participants.'}
              </p>
              {p.event.rules && (
                <>
                  <h3>Rules & eligibility</h3>
                  <p className="preserve">{p.event.rules}</p>
                </>
              )}
              <p>
                {p.event.teamsEnabled
                  ? `Team-based event. Up to ${p.event.teamSize} members per team.`
                  : 'Individual participation.'}
              </p>
              <p>
                <strong>Project deadline:</strong> {formatDate(p.event.deadline)}
              </p>
              {p.event.criteria.length > 0 && (
                <>
                  <h3>Judging criteria</h3>
                  {p.event.criteria.map((c) => (
                    <p key={c.name}>
                      {c.name} · up to {c.maxScore} points
                    </p>
                  ))}
                </>
              )}
            </div>
          )}
          <div className="alert">
            <ShieldCheck size={20} />
            <span>
              For learners under 18, a parent or guardian must manage the application. Staff verify
              consent before granting access. Use a first name only for a child.
            </span>
          </div>
        </div>
        <aside className="panel application-panel">
          <h2>Your next step starts here.</h2>
          <p>
            Apply for a place. Staff review eligibility, consent and availability before confirming
            participation.
          </p>
          <div className="funding-options">
            {p.funding
              .filter((f) => f.capacity > 0)
              .map((f) => (
                <div key={f.mode}>
                  <span>
                    <Badge green>{label(f.mode)}</Badge>
                    {f.feeMinor > 0 && <strong>{money(f.feeMinor, f.currency)}</strong>}
                  </span>
                  <small>
                    {Math.max(0, f.capacity - (f.approved ?? 0))} places remaining
                    {p.waitlist ? ' · waiting list available' : ''}
                  </small>
                </div>
              ))}
          </div>
          {!registrationOpen ? (
            <p className="alert">Applications are not open at this time.</p>
          ) : !user ? (
            <>
              <ArrowLink to="/login">Sign in to apply</ArrowLink>
              <p className="muted small">
                New here? <Link to="/register">Create an adult or guardian account</Link>.
              </p>
            </>
          ) : (
            <ApplicationForm programme={p} />
          )}
        </aside>
      </div>
    </>
  )
}
function ApplicationForm({ programme }: { programme: Programme }) {
  const [age, setAge] = useState('18+')
  const { user } = useAuth()
  return (
    <ActionForm
      submit="Submit application"
      onSubmit={async (data) => {
        await api(`/programmes/${programme.id}/apply`, 'POST', {
          mode: field(data, 'mode'),
          participantName: field(data, 'participantName'),
          ageBand: age,
          motivation: field(data, 'motivation'),
          guardianName: field(data, 'guardianName'),
          guardianEmail: field(data, 'guardianEmail'),
          guardianConsent: checked(data, 'guardianConsent'),
        })
        return 'Application saved for review. This is not a confirmed place, payment or scholarship award. For a child, open Guardian permissions from My learning to record your relationship and purpose-specific permissions for independent verification.'
      }}
    >
      <Select
        label="Participation option"
        name="mode"
        required
        options={programme.funding
          .filter((f) => f.capacity > 0)
          .map((f) => ({ value: f.mode, name: label(f.mode) }))}
      />
      <Field label="Participant’s first name" name="participantName" maxLength={80} required />
      <Select
        label="Participant age group"
        name="ageBand"
        value={age}
        onChange={(event) => setAge(event.target.value)}
        options={['18+', '13-17', '6-12']}
      />
      {age !== '18+' && (
        <>
          <Field
            label="Guardian’s full name"
            name="guardianName"
            defaultValue={user?.name}
            maxLength={100}
            required
          />
          <Field
            label="Guardian email"
            name="guardianEmail"
            type="email"
            defaultValue={user?.email}
            maxLength={254}
            required
          />
          <Field
            type="checkbox"
            name="guardianConsent"
            label="I am the guardian and consent to staff contacting me to verify this application."
            required
          />
          <p className="small">
            This checkbox authorises application follow-up only, not participation, publicity or
            general communications. Record those choices separately in{' '}
            <Link to="/safety">Guardian permissions</Link> after submitting.
          </p>
        </>
      )}
      <TextArea
        label="Why would you like to take part? (optional)"
        name="motivation"
        maxLength={2000}
      />
    </ActionForm>
  )
}

const serviceCards = [
  {
    icon: Monitor,
    title: 'Digital skills & outreach',
    copy: 'Bring computer literacy, digital safety and hands-on technology learning closer to a community.',
  },
  {
    icon: Code2,
    title: 'Workshops & training',
    copy: 'Explore coding, AI or other agreed subjects with young learners, students, teams or professionals.',
  },
  {
    icon: Cpu,
    title: 'Hackathons & challenges',
    copy: 'Collaborate on challenge design, event coordination, mentoring and programme delivery.',
  },
  {
    icon: Heart,
    title: 'Sponsored learning',
    copy: 'Support a cohort, fund eligible places or help reduce barriers to technology education.',
  },
]
export function Partners() {
  return (
    <>
      <PageIntro
        eyebrow="SHARED PURPOSE. PRACTICAL POSSIBILITIES."
        title="Your vision. Our shared next step."
      >
        Have a programme in mind? Let’s explore how Techducate can help design, coordinate or
        deliver it with you.
      </PageIntro>
      <section className="container section">
        <div className="service-grid">
          {serviceCards.map((s) => (
            <div className="value-card" key={s.title}>
              <s.icon size={26} />
              <h3>{s.title}</h3>
              <p>{s.copy}</p>
            </div>
          ))}
        </div>
        <p className="muted small">
          Scope, delivery, safeguarding, costs and reporting are agreed for each programme.
          Enquiring does not create a partnership or guarantee delivery.
        </p>
      </section>
      <section className="form-section">
        <div className="container two-column">
          <div>
            <SectionTitle eyebrow="LET’S TALK" title="Good things start with a conversation." />
            <p>
              Tell us what you’re thinking. A community outreach initiative, a sponsored cohort or
              an innovation challenge — we’ll review your enquiry and explore what’s possible.
            </p>
            <div className="steps">
              <p>
                <b>01</b>Share the idea and who it’s for.
              </p>
              <p>
                <b>02</b>The team reviews your requirements.
              </p>
              <p>
                <b>03</b>Agree scope and next steps together.
              </p>
            </div>
          </div>
          <div className="panel">
            <h2>Start a programme conversation</h2>
            <PublicForm kind="partner" />
          </div>
        </div>
      </section>
    </>
  )
}
export function Support() {
  const result = useResource<{ settings: SiteSettings }>('/settings')
  return (
    <>
      <PageIntro eyebrow="SUPPORT A LITTLE POSSIBILITY" title="Help open the next door.">
        A laptop, your time, a contribution — support can take many forms. Help make technology
        education more accessible.
      </PageIntro>
      <section className="container section two-column">
        <div>
          <SectionTitle
            eyebrow="GIVE IN A WAY THAT WORKS FOR YOU"
            title="Every kind of support matters."
          />
          <div className="support-options">
            {[
              {
                icon: Heart,
                title: 'Monetary support',
                copy: 'Offer a contribution towards outreach, learning opportunities or general support.',
              },
              {
                icon: Monitor,
                title: 'Equipment & resources',
                copy: 'Offer laptops, computers, learning materials or other useful technology resources.',
              },
              {
                icon: Wifi,
                title: 'Connectivity & access',
                copy: 'Help communities connect to the tools and resources that make learning possible.',
              },
            ].map((item) => (
              <div className="principle" key={item.title}>
                <span>
                  <item.icon size={22} />
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </div>
              </div>
            ))}
          </div>
          <Loading {...result} retry={result.reload} />
          {result.data && (
            <div className="panel">
              <h3>How to complete a contribution</h3>
              <p className="preserve">
                {result.data.settings.donationInstructions ||
                  'Verified donation instructions have not been configured. Submit an offer below and the team will follow up. Do not send funds to unverified recipient details.'}
              </p>
            </div>
          )}
          <div className="alert">
            <ShieldCheck size={20} />
            <span>
              This site does not process payments. Submitting an offer does not confirm a donation
              or automatically award a sponsored place.
            </span>
          </div>
        </div>
        <div className="panel">
          <h2>Offer your support</h2>
          <PublicForm kind="donation" />
        </div>
      </section>
    </>
  )
}
export function Volunteer() {
  return (
    <>
      <PageIntro eyebrow="YOUR SKILLS CAN OPEN DOORS" title="Be someone’s next spark.">
        You don’t have to be a teacher to make a difference. Share your skills, your perspective and
        a little of your time.
      </PageIntro>
      <section className="container section two-column">
        <div>
          <SectionTitle
            eyebrow="THERE’S MORE THAN ONE WAY TO HELP"
            title="Find your way to contribute."
          />
          <div className="tag-cloud">
            {[
              'Teaching & mentoring',
              'Curriculum & content',
              'Technical support',
              'Event support',
              'Operations',
              'Fundraising',
              'Partnerships',
              'Communications',
            ].map((t) => (
              <span className="badge" key={t}>
                {t}
              </span>
            ))}
          </div>
          <p>
            Tell us what you enjoy doing and when you’re available. The team will review your
            application and discuss suitable opportunities.
          </p>
          <div className="panel">
            <ShieldCheck size={25} />
            <h3>Care comes before everything.</h3>
            <p>
              Roles involving children require appropriate safeguarding review before any
              assignment. Applying does not grant access to learners or their records.
            </p>
          </div>
        </div>
        <div className="panel">
          <h2>Let’s get to know you</h2>
          <PublicForm kind="volunteer" />
        </div>
      </section>
    </>
  )
}
export function Contact() {
  const result = useResource<{ settings: SiteSettings }>('/settings')
  return (
    <>
      <PageIntro eyebrow="SAY HELLO" title="Let’s find a way forward.">
        A question about learning, volunteering or something else? Leave a message for the
        Techducate team.
      </PageIntro>
      <section className="container section two-column">
        <div>
          <SectionTitle
            eyebrow="WE’RE GLAD YOU’RE HERE"
            title="A conversation can change what comes next."
          />
          <p>
            For organisations exploring a commissioned or sponsored programme, our{' '}
            <Link to="/partners">partner enquiry form</Link> helps capture what you need.
          </p>
          <Loading {...result} retry={result.reload} />
          {result.data?.settings.contactEmail && (
            <p>
              <a href={`mailto:${result.data.settings.contactEmail}`}>
                {result.data.settings.contactEmail}
              </a>
            </p>
          )}
          {result.data?.settings.contactLocation && (
            <p>
              <MapPin size={18} /> {result.data.settings.contactLocation}
            </p>
          )}
          <p className="muted">
            Please don’t include children’s private information, identity documents, passwords or
            sensitive financial details.
          </p>
        </div>
        <div className="panel">
          <h2>Send a message</h2>
          <PublicForm kind="contact" />
        </div>
      </section>
    </>
  )
}
function PublicForm({ kind }: { kind: PublicSubmission['kind'] }) {
  return (
    <ActionForm
      submit={
        kind === 'donation'
          ? 'Submit offer of support'
          : kind === 'volunteer'
            ? 'Submit application'
            : 'Send enquiry'
      }
      onSubmit={async (data) => {
        const amount = field(data, 'amount')
        const body = {
          kind,
          name: field(data, 'name'),
          email: field(data, 'email'),
          message: field(data, 'message'),
          consent: checked(data, 'consent'),
          website: field(data, 'website'),
          ...Object.fromEntries(
            [
              'organisation',
              'organisationType',
              'service',
              'participants',
              'delivery',
              'location',
              'timeframe',
              'budget',
              'collaboration',
              'skills',
              'interests',
              'availability',
              'experience',
              'purpose',
              'reference',
            ].map((key) => [key, field(data, key)]),
          ),
          donationType: field(data, 'donationType') || 'money',
          amountMinor: amount ? Math.round(Number(amount) * 100) : 0,
          currency: field(data, 'currency') || 'KES',
        }
        const result = await api<{ id: string; message: string }>('/enquiries', 'POST', body)
        return `${result.message} Reference: ${result.id}`
      }}
    >
      <div className="form-row">
        <Field label="Your full name" name="name" autoComplete="name" maxLength={100} required />
        <Field
          label={kind === 'partner' ? 'Professional email' : 'Your email'}
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
        />
      </div>
      <div className="honeypot" aria-hidden="true">
        <Field label="Leave this blank" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {kind === 'partner' && (
        <>
          <Field label="Organisation name" name="organisation" maxLength={200} required />
          <div className="form-row">
            <Select
              label="Organisation type"
              name="organisationType"
              options={[
                'company',
                'foundation',
                'ngo',
                'educational-institution',
                'international-organisation',
                'other',
              ]}
            />
            <Select
              label="How would you like to work together?"
              name="collaboration"
              options={[
                'commission-a-programme',
                'sponsor-participants',
                'fund-outreach',
                'explore-collaboration',
              ]}
            />
          </div>
          <Select
            label="Programme or service"
            name="service"
            options={[
              'digital-literacy',
              'children-technology-education',
              'ai-coding-workshop',
              'professional-training',
              'hackathon',
              'sponsored-cohort',
              'community-outreach',
              'other',
            ]}
            required
          />
          <Field
            label="Who is it for, and approximately how many people?"
            name="participants"
            maxLength={300}
            required
          />
          <div className="form-row">
            <Select
              label="Delivery preference"
              name="delivery"
              options={['in-person', 'virtual', 'hybrid', 'to-discuss']}
            />
            <Field label="Location (optional)" name="location" maxLength={200} />
          </div>
          <div className="form-row">
            <Field label="Desired timeframe (optional)" name="timeframe" maxLength={200} />
            <Field label="Indicative budget & currency (optional)" name="budget" maxLength={200} />
          </div>
        </>
      )}
      {kind === 'volunteer' && (
        <>
          <Field
            label="Contribution interests"
            name="interests"
            placeholder="Teaching, events, design, operations..."
            maxLength={1500}
            required
          />
          <TextArea label="Skills you’d like to share" name="skills" maxLength={1500} required />
          <TextArea label="Relevant experience (optional)" name="experience" maxLength={2000} />
          <Field
            label="Your availability"
            name="availability"
            maxLength={500}
            placeholder="For example: weekends, 2 hours a month"
            required
          />
        </>
      )}
      {kind === 'donation' && (
        <>
          <Select
            label="Type of support"
            name="donationType"
            options={['money', 'equipment', 'connectivity', 'materials', 'other']}
          />
          <div className="form-row">
            <Field
              label="Amount, if monetary (optional)"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              max="10000000"
            />
            <Field
              label="Currency"
              name="currency"
              defaultValue="KES"
              pattern="[A-Z]{3}"
              maxLength={3}
              required
            />
          </div>
          <Field
            label="Intended purpose (optional)"
            name="purpose"
            maxLength={300}
            placeholder="General support, outreach, a programme..."
          />
          <Field
            label="Transaction reference, if already sent (optional)"
            name="reference"
            maxLength={200}
            hint="Do not include card details, passwords or account credentials."
          />
        </>
      )}
      <TextArea
        label={
          kind === 'donation'
            ? 'Tell us about your contribution'
            : kind === 'volunteer'
              ? 'What motivates you to volunteer?'
              : 'What would you like us to know?'
        }
        name="message"
        required
      />
      <Field
        type="checkbox"
        label="I have read the privacy notice and agree that the team may use these details to respond to this submission."
        name="consent"
        required
      />
      <p className="small muted">
        <Link to="/privacy">Privacy notice</Link> · This form is for adults. Please don’t include
        children’s personal or sensitive information.
      </p>
    </ActionForm>
  )
}
export function Privacy() {
  const result = useResource<{ settings: SiteSettings }>('/settings')
  return (
    <>
      <PageIntro eyebrow="TRUST & CARE" title="Your information deserves care.">
        A practical explanation of what this platform collects, who can see it and the choices
        available to you.
      </PageIntro>
      <article className="container section prose">
        <div className="alert">
          <ShieldCheck size={20} />
          <p>
            This operational notice must be reviewed and approved by Techducate’s authorised team
            before public launch. It is not a claim of legal compliance.
          </p>
        </div>
        <h2>Information collected</h2>
        <p>
          Adult account details, programme applications, guardian consent declarations, learning
          progress, attendance and project links are saved to operate programmes. Contact,
          volunteer, partner and donation forms store the details you submit for staff follow-up. We
          also store purpose-specific guardian choices and evidence references, programme-required
          emergency contacts, restricted safeguarding concerns, contributor screening/training
          decisions, private donor/grant records and administrative change histories. Do not submit
          unnecessary identity, home-address, medical or background-check documents. We do not
          collect card data or process online payments.
        </p>
        <h2>Children and guardians</h2>
        <p>
          Accounts are for adults. A guardian must manage an application for a learner under 18. Use
          a first name and an age group, not a birth date or identity document. Staff must verify
          guardian authority and purpose-specific consent through an approved offline process before
          granting access. A checkbox is a declaration, not proof. In{' '}
          <Link to="/safety">Guardian permissions</Link> you can record or withdraw participation,
          communications and media choices separately. Withdrawal or expiry of participation
          permission blocks access without automatically erasing records. Children’s records,
          project links and photographs are not published by this platform.
        </p>
        <h2>Access and communication</h2>
        <p>
          Authorised staff access information according to their responsibilities. Assigned
          instructors access programme learning and attendance information; financial information is
          restricted. No third-party analytics, advertising, external AI or email service is
          connected. Screening evidence and safeguarding narratives require an explicit safeguarding
          permission, not an ordinary admin or instructor role. In-app updates are account-private;
          optional programme broadcasts respect preferences and verified guardian communications
          choices. There is no adult-to-child private messaging.
        </p>
        <h2>Retention and your choices</h2>
        <Loading {...result} retry={result.reload} />
        <p>
          Closed enquiries are flagged for staff review after{' '}
          {result.data?.settings.retentionDays ?? 365} days; removal is not automatic and legal or
          financial retention obligations must be reviewed first. You can delete a learner account
          and its linked learning records from My learning after confirming your password. Public
          enquiries, incidents, financial/service-agreement records and legal holds require a
          separate officer-led review. Safeguarding records have case-specific retention dates and
          preservation holds. Protected backups have separately approved retention; deletion is not
          an immediate purge of all backup copies.
        </p>
        <p>
          For access, correction, deletion, consent withdrawal or a privacy concern,{' '}
          {result.data?.settings.privacyContact ? (
            <a href={`mailto:${result.data.settings.privacyContact}`}>contact the privacy team</a>
          ) : (
            <Link to="/contact">contact the team using the contact form</Link>
          )}
          . Do not send identity documents through public forms.
        </p>
        <h2>Essential cookies</h2>
        <p>
          A secure, HTTP-only session cookie is used when you sign in. It expires after 12 hours. No
          optional tracking cookies are used.
        </p>
        <h2>Safeguarding concerns</h2>
        <p className="preserve">
          {result.data?.settings.safeguardingInstructions ||
            'Before launch, the organisation must configure an approved safeguarding contact, monitoring and urgent escalation process. This website is not an emergency service and submitting a report does not send an external alert. Use appropriate local emergency or child-protection services if someone is at immediate risk.'}
        </p>
        <p>
          <Link to="/safety">Sign in to submit a restricted safeguarding concern</Link>. Do not put
          concern narratives in the ordinary contact form. Reports are identified to authorised
          officers; use the approved independent escalation channel for concerns about an officer.
        </p>
      </article>
    </>
  )
}
export function NotFound() {
  return (
    <section className="container section">
      <Empty title="This path doesn’t lead anywhere yet.">
        The page may have moved or the programme may not be published.
      </Empty>
      <ArrowLink to="/">Back to a brighter starting point</ArrowLink>
    </section>
  )
}
