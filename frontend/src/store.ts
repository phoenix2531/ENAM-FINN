import { useEffect, useState } from 'react'
import type { AlertRules } from './types'

// Per-viewer state (cleared cards, alert thresholds, calls logged). Lives in
// this browser only; in production it would sync to the investor's account.
function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`finn:${key}`)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(`finn:${key}`, JSON.stringify(v))
  } catch {
    /* private mode: fine, state just won't persist */
  }
}

export function usePersisted<T>(key: string, fallback: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => read(key, fallback))
  useEffect(() => write(key, v), [key, v])
  return [v, setV]
}

export type Prefs = { done: string[]; rules: AlertRules | null; called: Record<string, string> }
