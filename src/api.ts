import { useCallback, useEffect, useState } from 'react'

let csrf: string | null = null
export function setCsrf(value: string | null) {
  csrf = value
}
export class ApiError extends Error {
  fields: { field: string; message: string }[]
  status: number
  constructor(message: string, fields: { field: string; message: string }[] = [], status = 400) {
    super(message)
    this.fields = fields
    this.status = status
  }
}
export async function api<T>(
  url: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api${url}`, {
    method,
    signal,
    credentials: 'same-origin',
    headers: {
      ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = (await response.json()) as T & { error?: string; fields?: ApiError['fields'] }
  if (!response.ok)
    throw new ApiError(
      data.error ?? 'The request failed. Please try again.',
      data.fields,
      response.status,
    )
  return data
}
export function useResource<T>(path: string | null) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{
    path: string
    revision: number
    data: T | null
    error: Error | null
  } | null>(null)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    if (!path) return
    api<T>(path, 'GET', undefined, controller.signal)
      .then((data) => {
        setState({ path, revision, data, error: null })
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setState({
            path,
            revision,
            data: null,
            error: failure instanceof Error ? failure : new Error('Unable to load this page.'),
          })
      })
    return () => controller.abort()
  }, [path, revision])
  const current = state?.path === path && state.revision === revision ? state : null
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: !!path && !current,
    reload,
  }
}
export const field = (data: FormData, name: string) => String(data.get(name) ?? '').trim()
export const numberField = (data: FormData, name: string) => Number(field(data, name))
export const checked = (data: FormData, name: string) => data.get(name) === 'on'
export const isoField = (data: FormData, name: string) =>
  field(data, name) ? new Date(field(data, name)).toISOString() : null
export const dateInput = (value: string | null) =>
  value
    ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : ''
export const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : 'Dates to be announced'
export const money = (minor: number, currency = 'KES') =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(minor / 100)
export const label = (value: string) =>
  value
    .replaceAll('-', ' ')
    .replaceAll('_', ' ')
    .replace(/^\w/, (char) => char.toUpperCase())
