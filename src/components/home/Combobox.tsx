import { useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface ComboboxOption {
  value: string
  label: string
  /** Secondary text on the right, such as "7 cities". */
  meta?: string
}

export interface ComboboxProps {
  id: string
  label: string
  icon: ReactNode
  placeholder: string
  options: readonly ComboboxOption[]
  value: string | null
  onChange: (value: string) => void
  disabled?: boolean
  error?: string | null
  emptyMessage: string
}

/**
 * Type-to-filter picker (WAI-ARIA combobox with a listbox popup). Arrow keys move, Enter picks, Escape closes.
 * Only listed options can be chosen; typing never sets a value on its own.
 */
export function Combobox({
  id,
  label,
  icon,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  error,
  emptyMessage,
}: ComboboxProps) {
  const listId = useId()
  const errorId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const blurTimer = useRef<number | null>(null)

  const selectedLabel = options.find((option) => option.value === value)?.label ?? ''
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((option) => option.label.toLowerCase().includes(q)) : [...options]
  }, [options, query])

  function openList() {
    if (disabled) return
    setQuery('')
    setActive(0)
    setOpen(true)
  }

  function pick(option: ComboboxOption) {
    onChange(option.value)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) openList()
      else setActive((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      const option = filtered[active]
      if (option) pick(option)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      setQuery('')
    }
  }

  const activeOption = open ? filtered[active] : undefined

  return (
    <div className="combo">
      <label className="tm-label" htmlFor={id}>
        {label}
      </label>
      <div className="combo__field">
        <span className="combo__icon" aria-hidden="true">
          {icon}
        </span>
        <input
          id={id}
          className={`tm-input${error ? ' tm-input--error' : ''}`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${listId}-${activeOption.value}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
          value={open ? query : selectedLabel}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={openList}
          onClick={() => !open && openList()}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Delay so a click on an option lands before the list closes.
            blurTimer.current = window.setTimeout(() => setOpen(false), 120)
          }}
        />
      </div>
      {error && (
        <p id={errorId} className="tm-error">
          {error}
        </p>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="combo__list"
          onMouseDown={(event) => event.preventDefault()}
        >
          {filtered.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${option.value}`}
              role="option"
              aria-selected={option.value === value}
              className={`combo__option${index === active ? ' combo__option--active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(option)}
            >
              <span>{option.label}</span>
              {option.meta && <span className="combo__meta">{option.meta}</span>}
            </li>
          ))}
          {filtered.length === 0 && <li className="combo__empty">{emptyMessage}</li>}
        </ul>
      )}
    </div>
  )
}
