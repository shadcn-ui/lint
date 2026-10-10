// The synchronous face of the Tailwind oracle. Failures are kept apart: a
// theme that cannot be built is unavailable on its own and retried, so
// other projects in the same editor session keep their answers, while a
// worker that dies or stalls is restarted once and only a second
// transport failure turns the oracle off for the process.

import * as fs from "node:fs"
import {
  MessageChannel,
  receiveMessageOnPort,
  Worker,
  type MessagePort,
} from "node:worker_threads"

import { warnOnce } from "../project/warn"
import type { Answer } from "./oracle"

// `cold` until the worker has answered once: that question pays for
// loading Tailwind and gets the longer timeout.
type Bridge = {
  worker: Worker
  port: MessagePort
  nextId: number
  cold: boolean
}

// null: not started; false: off for the process.
let bridge: Bridge | null | false = null
let restarts = 0

const FIRST_TIMEOUT = 15_000
const TIMEOUT = 5_000
const RETRY_AFTER = 5_000
const REFRESH_AFTER = 1_000

function workerFile() {
  // Built next to this file; from source, the last build. That second
  // candidate would point outside an installed package.
  const candidates = [new URL("./tailwind-worker.js", import.meta.url)]
  if (/\/src\/tailwind\/[^/]+$/.test(import.meta.url)) {
    candidates.push(new URL("../../dist/tailwind-worker.js", import.meta.url))
  }
  for (const url of candidates) {
    try {
      if (fs.existsSync(url)) return url
    } catch {
      // A non-file URL; keep looking.
    }
  }
  return null
}

function stop() {
  if (bridge) bridge.worker.terminate().catch(() => {})
  bridge = null
  // A new worker numbers its generations from one again.
  memos.clear()
}

// One restart is allowed; after that the oracle is off.
function transportFailed(reason: string) {
  stop()
  if (restarts++ >= 1) {
    bridge = false
    warnOnce(
      "tailwind:off",
      `The Tailwind worker failed twice (${reason}); no-unknown-classes is using the grammar bundled with @shadcn/lint for the rest of this run.`
    )
  }
  return null
}

function start() {
  if (bridge) return bridge
  if (bridge === false) return null
  const file = workerFile()
  if (!file) {
    bridge = false
    warnOnce(
      "tailwind:off",
      "The Tailwind worker script was not found next to @shadcn/lint; no-unknown-classes is using the bundled grammar."
    )
    return null
  }
  try {
    const channel = new MessageChannel()
    const worker = new Worker(file, {
      workerData: { port: channel.port2 },
      transferList: [channel.port2],
    })
    // An error from a replaced worker is one failure arriving late.
    worker.on("error", (error) => {
      if (bridge && bridge.worker === worker) transportFailed(error.message)
    })
    // Replaced on the next question, not waited on for a full timeout.
    worker.on("exit", () => {
      if (bridge && bridge.worker === worker) stop()
    })
    worker.unref()
    channel.port1.unref()
    bridge = { worker, port: channel.port1, nextId: 1, cold: true }
    return bridge
  } catch (error) {
    return transportFailed((error as Error).message)
  }
}

function timeoutFor(live: Bridge) {
  return live.cold ? FIRST_TIMEOUT : TIMEOUT
}

function ask(cssFile: string, candidates: string[]): Answer | null {
  const live = start()
  if (!live) return null
  const id = live.nextId++
  const shared = new SharedArrayBuffer(4)
  const flag = new Int32Array(shared)
  live.port.postMessage({ id, cssFile, candidates, shared })
  const waited = Atomics.wait(flag, 0, 0, timeoutFor(live))
  live.cold = false
  if (waited === "timed-out") return transportFailed("timed out")
  const received = receiveMessageOnPort(live.port) as
    { message: { id: number; answer: Answer } } | undefined
  if (!received || received.message.id !== id) {
    return transportFailed("out-of-order answer")
  }
  // A worker that answers is healthy: a later failure starts over.
  restarts = 0
  return received.message.answer
}

type ThemeMemo = {
  generation: number
  checkedAt: number
  hasModules: boolean
  // True for a known class; "font-size" for a known one that sets it.
  verdicts: Map<string, UnknownClass | true | "font-size">
}

const memos = new Map<string, ThemeMemo>()
const failed = new Map<string, { at: number; reason: string }>()

export type UnknownClass = {
  token: string
  suggestion: string | null
  baseKnown: boolean
}

function themeFailed(cssFile: string, reason: string) {
  failed.set(cssFile, { at: Date.now(), reason })
  memos.delete(cssFile)
  warnOnce(
    `tailwind:${cssFile}:${reason}`,
    `The Tailwind theme at ${cssFile} could not be built (${reason}); no-unknown-classes is using the grammar bundled with @shadcn/lint there until it can.`
  )
  return null
}

// Null when the oracle is unavailable for this theme. Answers are
// remembered per theme and rechecked about once a second.
function verdictsFor(cssFile: string, candidates: string[]) {
  if (bridge === false) return null
  const failure = failed.get(cssFile)
  if (failure) {
    if (Date.now() - failure.at < RETRY_AFTER) return null
    failed.delete(cssFile)
  }
  const now = Date.now()
  let memo = memos.get(cssFile)
  const stale = !memo || now - memo.checkedAt >= REFRESH_AFTER
  let unseen = candidates.filter((c) => !memo?.verdicts.has(c))
  if (unseen.length || stale) {
    let answer = ask(cssFile, [...new Set(unseen)])
    if (!answer) return null
    if (!answer.ok) return themeFailed(cssFile, answer.reason)
    if (!memo || memo.generation !== answer.generation) {
      // The theme was rebuilt, so nothing remembered still holds. One
      // that loads JavaScript needs a fresh worker: a module cache never
      // forgets an edited plugin.
      const rebuild = Boolean(memo && answer.hasModules)
      if (rebuild) stop()
      unseen = [...new Set(candidates)]
      // A rebuild always asks again: the fresh worker owes us a
      // generation number even when every candidate is already known.
      if (rebuild || unseen.length) {
        answer = ask(cssFile, unseen)
        if (!answer) return null
        if (!answer.ok) return themeFailed(cssFile, answer.reason)
      }
      memo = {
        generation: answer.generation,
        checkedAt: now,
        hasModules: answer.hasModules,
        verdicts: new Map(),
      }
      memos.set(cssFile, memo)
    }
    memo.checkedAt = now
    for (const token of unseen) memo.verdicts.set(token, true)
    for (const entry of answer.unknown) memo.verdicts.set(entry.token, entry)
    for (const token of answer.fontSizes) memo.verdicts.set(token, "font-size")
  }
  return memo!.verdicts
}

export function unknownClasses(cssFile: string, candidates: string[]) {
  const verdicts = verdictsFor(cssFile, candidates)
  if (!verdicts) return null
  const out: UnknownClass[] = []
  for (const token of candidates) {
    const verdict = verdicts.get(token)
    if (typeof verdict === "object") out.push(verdict)
  }
  return out
}

// Whether the theme's Tailwind generates a font size for this class. Null
// when the oracle is unavailable for this theme.
export function setsFontSize(cssFile: string, token: string) {
  const verdicts = verdictsFor(cssFile, [token])
  if (!verdicts) return null
  return verdicts.get(token) === "font-size"
}

export function oracleAvailable() {
  return bridge !== false && start() !== null
}

export function resetOracleMemo() {
  memos.clear()
  failed.clear()
}

export function stopOracleForTests() {
  stop()
}

export function failOracleTransportForTests() {
  transportFailed("test")
}

export function oracleStateForTests() {
  return {
    nextTimeout: bridge ? timeoutFor(bridge) : FIRST_TIMEOUT,
    restarts,
  }
}
