import { useEffect, useRef, useState, type ReactNode } from 'react'

interface TextFieldProps {
  label?: string
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  list?: string
  autoFocusToken?: number
  multiline?: boolean
  disabled?: boolean
  title?: string
  mono?: boolean
}

/** Text input that commits on blur or Enter so every keystroke is not an undo step. */
export function TextField({ label, value, onCommit, placeholder, list, autoFocusToken, multiline, disabled, title, mono }: TextFieldProps): ReactNode {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => setV(value), [value])
  useEffect(() => {
    if (autoFocusToken) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [autoFocusToken])
  const commit = (): void => {
    if (v !== value) onCommit(v)
  }
  const common = {
    ref,
    value: v,
    placeholder,
    disabled,
    title,
    className: mono ? 'mono' : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !multiline) {
        commit()
        ;(e.target as HTMLElement).blur()
      }
      if (e.key === 'Escape') {
        setV(value)
        ;(e.target as HTMLElement).blur()
      }
      e.stopPropagation()
    }
  }
  const input = multiline ? <textarea {...common} /> : <input type="text" list={list} {...common} />
  if (!label) return input
  return (
    <label className="field">
      <span>{label}</span>
      {input}
    </label>
  )
}

interface NumberFieldProps {
  label?: string
  value: number | null
  onCommit: (v: number | null) => void
  min?: number
  max?: number
  step?: number
  decimals?: number
  unit?: string
  allowEmpty?: boolean
  disabled?: boolean
  placeholder?: string
}

export function NumberField({ label, value, onCommit, min, max, step, decimals = 2, unit, allowEmpty, disabled, placeholder }: NumberFieldProps): ReactNode {
  const fmtv = (n: number | null): string => (n === null || !Number.isFinite(n) ? '' : String(Math.round(n * 10 ** decimals) / 10 ** decimals))
  const [v, setV] = useState(fmtv(value))
  useEffect(() => setV(fmtv(value)), [value, decimals]) // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (): void => {
    if (v.trim() === '') {
      if (allowEmpty) onCommit(null)
      else setV(fmtv(value))
      return
    }
    let n = parseFloat(v)
    if (!Number.isFinite(n)) return setV(fmtv(value))
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    if (n !== value) onCommit(n)
    else setV(fmtv(value))
  }
  const input = (
    <div className="row">
      <input
        type="number"
        value={v}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            ;(e.target as HTMLElement).blur()
          }
          if (e.key === 'Escape') {
            setV(fmtv(value))
            ;(e.target as HTMLElement).blur()
          }
          e.stopPropagation()
        }}
      />
      {unit && <span className="dim">{unit}</span>}
    </div>
  )
  if (!label) return input
  return (
    <label className="field">
      <span>{label}</span>
      {input}
    </label>
  )
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled
}: {
  label?: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  disabled?: boolean
}): ReactNode {
  const sel = (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)} onKeyDown={(e) => e.stopPropagation()}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
  if (!label) return sel
  return (
    <label className="field">
      <span>{label}</span>
      {sel}
    </label>
  )
}

export function Check({ label, checked, onChange, disabled, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string }): ReactNode {
  return (
    <label className="row" style={{ marginBottom: 6, cursor: 'pointer' }} title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
