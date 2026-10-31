import {
  useId,
  useState,
  createContext,
  useContext,
  type ReactNode,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ArrowRight, LoaderCircle, AlertCircle, CheckCircle2 } from 'lucide-react'
import { ApiError, label } from './api'

const FormErrors = createContext<ApiError['fields']>([])

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      className={`brand ${inverse ? 'inverse' : ''}`}
      to="/"
      aria-label="Techducate Africa home"
    >
      <span className="brand-icon" aria-hidden="true">
        <span /> <span />
      </span>
      <span>
        techducate<span className="brand-dot">.</span>
        <small>AFRICA</small>
      </span>
    </Link>
  )
}
export function ArrowLink({
  to,
  children,
  secondary = false,
  className = '',
}: {
  to: string
  children: ReactNode
  secondary?: boolean
  className?: string
}) {
  return (
    <Link className={`button ${secondary ? 'secondary' : ''} ${className}`} to={to}>
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  )
}
export function SectionTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="section-heading">
      <span className="eyebrow">
        <span />
        {eyebrow}
      </span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  )
}
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="page-intro">
      <div className="container">
        <span className="eyebrow">
          <span />
          {eyebrow}
        </span>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </section>
  )
}
export function Badge({ children, green = false }: { children: ReactNode; green?: boolean }) {
  return <span className={`badge ${green ? 'green' : ''}`}>{children}</span>
}
export function Field({
  label: caption,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const generated = useId()
  const id = props.id ?? generated
  const error = useContext(FormErrors).find((issue) => issue.field === props.name)
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ')
  return (
    <div className={`field ${props.type === 'checkbox' ? 'checkbox' : ''}`}>
      <label htmlFor={id}>
        {caption}
        {props.required && props.type !== 'checkbox' && (
          <span className="required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy || undefined}
      />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <small className="field-error" id={`${id}-error`}>
          {error.message}
        </small>
      )}
    </div>
  )
}
export function Select({
  label: caption,
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  options: readonly string[] | { value: string; name: string }[]
}) {
  const generated = useId()
  const id = props.id ?? generated
  const error = useContext(FormErrors).find((issue) => issue.field === props.name)
  return (
    <div className="field">
      <label htmlFor={id}>
        {caption}
        {props.required && (
          <span className="required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <select
        {...props}
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {options.map((option) =>
          typeof option === 'string' ? (
            <option key={option} value={option}>
              {label(option)}
            </option>
          ) : (
            <option key={option.value} value={option.value}>
              {option.name}
            </option>
          ),
        )}
      </select>
      {error && (
        <small className="field-error" id={`${id}-error`}>
          {error.message}
        </small>
      )}
    </div>
  )
}
export function TextArea({
  label: caption,
  name,
  defaultValue,
  required,
  maxLength = 5000,
  rows = 4,
}: {
  label: string
  name: string
  defaultValue?: string
  required?: boolean
  maxLength?: number
  rows?: number
}) {
  const id = useId()
  const error = useContext(FormErrors).find((issue) => issue.field === name)
  return (
    <div className="field">
      <label htmlFor={id}>
        {caption}
        {required && (
          <span className="required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <textarea
        id={id}
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        rows={rows}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <small className="field-error" id={`${id}-error`}>
          {error.message}
        </small>
      )}
    </div>
  )
}
export function ErrorNotice({ error }: { error: Error }) {
  return (
    <div className="alert error" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <div>
        {error.message}
        {error instanceof ApiError && error.fields.length > 0 && (
          <ul>
            {error.fields.map((issue, i) => (
              <li key={i}>
                <strong>{label(issue.field || 'Form')}:</strong> {issue.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
export function ActionForm({
  children,
  onSubmit,
  submit = 'Save changes',
  className = '',
  successMessage = 'Changes saved.',
}: {
  children: ReactNode
  onSubmit: (data: FormData) => Promise<string | void>
  submit?: string
  className?: string
  successMessage?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [message, setMessage] = useState('')
  return (
    <form
      className={`form ${className}`}
      onSubmit={async (event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        setBusy(true)
        setError(null)
        setMessage('')
        try {
          setMessage((await onSubmit(data)) || successMessage)
        } catch (failure) {
          setError(
            failure instanceof Error ? failure : new Error('Unable to save. Please try again.'),
          )
        } finally {
          setBusy(false)
        }
      }}
    >
      <FormErrors.Provider value={error instanceof ApiError ? error.fields : []}>
        <fieldset disabled={busy}>{children}</fieldset>
      </FormErrors.Provider>
      {error && <ErrorNotice error={error} />}
      {message && (
        <div className="alert success" role="status">
          <CheckCircle2 size={20} aria-hidden="true" />
          <span>{message}</span>
        </div>
      )}
      <button className="button" disabled={busy} type="submit">
        {busy ? (
          <>
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
            Saving...
          </>
        ) : (
          <>
            {submit}
            <ArrowRight size={17} aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  )
}
export function Loading({
  error,
  loading,
  retry,
}: {
  error: Error | null
  loading: boolean
  retry?: () => void
}) {
  if (error)
    return (
      <div>
        <ErrorNotice error={error} />
        {retry && (
          <button className="button secondary" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    )
  if (loading)
    return (
      <div className="loading" role="status">
        <LoaderCircle className="spin" size={22} />
        Loading...
      </div>
    )
  return null
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        +
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}
export function Panel({
  title,
  children,
  className = '',
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  )
}
