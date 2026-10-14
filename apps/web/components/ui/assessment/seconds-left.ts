"use client"

import { useEffect, useRef, useState } from "react"

/** How often the remaining time is read: 4 times a second keeps each displayed second on time. */
export const SECONDS_LEFT_STEP_MS = 250

/**
 * The whole seconds left (rounded up, never negative) of `remaining`, the milliseconds left by the
 * server's clock (the page computes them from the server's end and offset, 018 research T4). Each
 * Exam Mode component reads it on its own (exam-mode.md, "Atualizações frequentes"): the tick
 * re-renders only that component, and only when the second changes.
 */
export function useSecondsLeft(remaining: () => number): number {
  const read = useRef(remaining)
  useEffect(() => {
    read.current = remaining
  })
  const [seconds, setSeconds] = useState(() => toSeconds(remaining()))
  useEffect(() => {
    const id = setInterval(() => setSeconds(toSeconds(read.current())), SECONDS_LEFT_STEP_MS)
    return () => clearInterval(id)
  }, [])
  return seconds
}

const toSeconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000))

/**
 * The marks (in seconds) the time crossed since the component mounted: a mark already behind at the
 * first reading (an exam that starts with less time, or a reload after it) is never crossed.
 */
export function useCrossedMarks(seconds: number, marks: readonly number[]): number[] {
  const [first] = useState(seconds)
  return marks.filter((mark) => first > mark && seconds <= mark)
}
