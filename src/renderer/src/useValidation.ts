import { useEffect } from 'react'
import { compilePart } from '@core/compile'
import { validatePart } from '@core/validate'
import { useStore } from './store'

/** Debounced live validation of the current part (compiles in memory). */
export function useValidation(): void {
  const part = useStore((s) => s.part)
  const setIssues = useStore((s) => s.setIssues)
  useEffect(() => {
    if (!part) {
      setIssues([])
      return
    }
    const t = setTimeout(() => {
      try {
        setIssues(validatePart(part, compilePart(part)))
      } catch (e) {
        setIssues([{ id: 'compile-failed', severity: 'error', message: `The part could not be generated: ${(e as Error).message}` }])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [part, setIssues])
}
