import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ArrowUpRight, Menu, X, Sprout, ArrowRight } from 'lucide-react'
import { AuthProvider, Protected } from './auth'
import { useAuth } from './authContext'
import {
  About,
  Contact,
  Home,
  NotFound,
  Partners,
  Privacy,
  ProgrammeDetail,
  Programmes,
  Support,
  Volunteer,
} from './PublicPages'
import { AuthPage, Dashboard, Learning, ResetPassword } from './LearningPages'
import { Brand } from './ui'
import { useResource } from './api'

const Admin = lazy(() => import('./StaffPages').then((m) => ({ default: m.Admin })))
const ProgrammeEditor = lazy(() =>
  import('./StaffPages').then((m) => ({ default: m.ProgrammeEditor })),
)
const ProgrammeOperations = lazy(() =>
  import('./StaffPages').then((m) => ({ default: m.ProgrammeOperations })),
)
const OperationsPage = lazy(() =>
  import('./OperationsPages').then((m) => ({ default: m.OperationsPage })),
)
const SafetyPage = lazy(() => import('./OperationsPages').then((m) => ({ default: m.SafetyPage })))

const year = new Date().getFullYear()
function Layout() {
  const { pathname } = useLocation()
  const { user, loading } = useAuth()
  const review = useResource<{ reviewMode: boolean }>('/settings')
  const [menu, setMenu] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    const titles: Record<string, string> = {
      '/': 'A little access. A lot of possibility.',
      '/about': 'Our mission',
      '/programmes': 'Explore programmes',
      '/partners': 'Partner with us',
      '/support': 'Support our work',
      '/volunteer': 'Volunteer',
      '/contact': 'Contact',
      '/dashboard': 'My learning',
      '/admin': 'Operations',
    }
    document.title = `${titles[pathname] ?? 'Learning & community'} | Techducate Africa`
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [pathname])
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="announcement">
        <div className="container">
          <span>
            <Sprout size={13} aria-hidden="true" />
            Making room for the next generation of makers.
          </span>
          <Link to="/volunteer">
            Grow with us <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
      <header className="header">
        <div className="container header-inner">
          <Brand />
          <button
            className="menu-toggle"
            onClick={() => setMenu((value) => !value)}
            aria-label={menu ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menu}
            aria-controls="primary-navigation"
          >
            {menu ? <X /> : <Menu />}
          </button>
          <nav
            id="primary-navigation"
            className={`nav ${menu ? 'open' : ''}`}
            aria-label="Main navigation"
            onClick={() => setMenu(false)}
          >
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/about">About us</NavLink>
            <NavLink to="/programmes">Programmes</NavLink>
            <NavLink to="/partners">Partner with us</NavLink>
            <NavLink to="/volunteer">Volunteer</NavLink>
            <div className="mobile-account">
              <Link to={user ? '/dashboard' : '/login'}>
                {user ? 'My learning' : 'Sign in'} <ArrowRight size={15} />
              </Link>
              <Link to="/support">
                Support our work <ArrowUpRight size={15} />
              </Link>
            </div>
          </nav>
          <div className="header-actions">
            <Link className="sign-in" to={user ? '/dashboard' : '/login'}>
              {loading ? 'Account' : user ? 'My learning' : 'Sign in'}
              <ArrowUpRight size={14} />
            </Link>
            <Link className="button small-button" to="/support">
              Support our work
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {review.error && (
          <p className="alert error container" role="alert">
            Unable to confirm the site configuration. Reload when your connection is available.
          </p>
        )}
        {review.data?.reviewMode && (
          <p className="alert container" role="status">
            <strong>Private client review.</strong> Fictional demonstration data only. Do not enter
            real personal information, payments or safeguarding concerns. Changes affect this
            separate review copy only.
          </p>
        )}
        {!online && (
          <p className="alert error container" role="status">
            You are offline. A live connection is required to load or save changes. Keep this page
            open and reconnect before submitting; previously saved learning progress is retained.
          </p>
        )}
        <Suspense
          fallback={
            <p className="container section" role="status">
              Loading workspace…
            </p>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/programmes" element={<Programmes />} />
            <Route path="/programmes/:id" element={<ProgrammeDetail />} />
            <Route path="/scholarships" element={<Programmes category="scholarships" />} />
            <Route path="/hackathons" element={<Programmes category="hackathons" />} />
            <Route path="/partners" element={<Partners />} />
            <Route path="/support" element={<Support />} />
            <Route path="/volunteer" element={<Volunteer />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage register />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route
              path="/dashboard"
              element={
                <Protected>
                  <Dashboard />
                </Protected>
              }
            />
            <Route
              path="/learn/:id"
              element={
                <Protected>
                  <Learning />
                </Protected>
              }
            />
            <Route
              path="/safety"
              element={
                <Protected>
                  <SafetyPage />
                </Protected>
              }
            />
            <Route
              path="/operations"
              element={
                <Protected roles={['admin', 'manager', 'finance', 'instructor']}>
                  <OperationsPage />
                </Protected>
              }
            />
            <Route
              path="/admin"
              element={
                <Protected roles={['admin', 'manager', 'finance']}>
                  <Admin />
                </Protected>
              }
            />
            <Route
              path="/admin/programmes/new"
              element={
                <Protected roles={['admin', 'manager']}>
                  <ProgrammeEditor />
                </Protected>
              }
            />
            <Route
              path="/admin/programmes/:id/edit"
              element={
                <Protected roles={['admin']}>
                  <ProgrammeEditor />
                </Protected>
              }
            />
            <Route
              path="/manage/:id"
              element={
                <Protected roles={['admin', 'manager', 'instructor']}>
                  <ProgrammeOperations />
                </Protected>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="footer">
        <div className="container">
          <div className="footer-top">
            <div className="footer-brand">
              <Brand inverse />
              <p>
                A little access.
                <br />A lot of possibility.
              </p>
              <span>
                Technology education.
                <br />
                Rooted in community.
              </span>
            </div>
            <div>
              <h2>Discover</h2>
              <Link to="/about">Our mission</Link>
              <Link to="/programmes">Learning opportunities</Link>
              <Link to="/scholarships">Scholarships & support</Link>
              <Link to="/hackathons">Hackathons & challenges</Link>
            </div>
            <div>
              <h2>Get involved</h2>
              <Link to="/volunteer">Volunteer your skills</Link>
              <Link to="/support">Support our work</Link>
              <Link to="/partners">Partner with Techducate</Link>
              <Link to="/contact">Start a conversation</Link>
            </div>
            <div className="footer-cta">
              <span className="eyebrow">GOOD THINGS START SMALL.</span>
              <h2>
                What could we
                <br />
                build together?
              </h2>
              <Link className="text-link" to="/contact">
                Let’s find out <ArrowUpRight size={18} />
              </Link>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {year} Techducate Africa</span>
            <span>Learning. Creating. Belonging.</span>
            <Link to="/privacy">Privacy & safeguarding</Link>
          </div>
        </div>
      </footer>
    </>
  )
}
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout />
      </AuthProvider>
    </BrowserRouter>
  )
}
