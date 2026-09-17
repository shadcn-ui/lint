// Filesystem helpers, memoized for the duration of a lint burst.

import * as fs from "node:fs"
import * as path from "node:path"

// How long any answer derived from the filesystem stays fresh. A run
// visits many files in a burst and asks the same questions for each; one
// second answers from memory without letting an editor go stale. The
// signature caches (components, theme, wrappers) re-stat on the same beat.
export const TTL = 1000

// A path inside an installed package, on either separator.
export const NODE_MODULES = /[\\/]node_modules[\\/]/

const MAX_MEMO_ENTRIES = 50_000

const memo = new Map<string, { at: number; value: unknown }>()

// A `stale` check lets a derived answer reject itself early: the memo's
// clock says fresh, but the files it was built from have moved on.
export function memoize<T>(
  key: string,
  compute: () => T,
  stale?: (value: T) => boolean
): T {
  const hit = memo.get(key)
  const now = Date.now()
  if (hit && now - hit.at < TTL && !stale?.(hit.value as T)) {
    return hit.value as T
  }
  const value = compute()
  if (memo.size >= MAX_MEMO_ENTRIES && !memo.has(key)) {
    for (const oldest of memo.keys()) {
      memo.delete(oldest)
      if (memo.size <= MAX_MEMO_ENTRIES * 0.75) {
        break
      }
    }
  }
  memo.set(key, { at: now, value })
  return value
}

const dirs = new Map<string, string>()

// Every rule asks this for every file, and normalization is not free.
export function dirOf(file: string) {
  let dir = dirs.get(file)
  if (dir === undefined) {
    if (dirs.size > 20_000) dirs.clear()
    dir = path.dirname(path.resolve(file))
    dirs.set(file, dir)
  }
  return dir
}

export function isDirectory(p: string) {
  return memoize(`dir:${p}`, () => {
    try {
      return fs.statSync(p).isDirectory()
    } catch {
      return false
    }
  })
}

export function isFile(p: string) {
  return memoize(`file:${p}`, () => {
    try {
      return fs.statSync(p).isFile()
    } catch {
      return false
    }
  })
}

export function mtimeOf(p: string) {
  return memoize(`mtime:${p}`, () => {
    try {
      return fs.statSync(p).mtimeMs
    } catch {
      return null
    }
  })
}

// Symlinks resolved and, on a case-insensitive filesystem, the spelling
// on disk, so "@/COMPONENTS/ui" and "@/components/ui" are one directory.
export function realpath(p: string) {
  return memoize(`real:${p}`, () => {
    try {
      return fs.realpathSync.native(p)
    } catch {
      return p
    }
  })
}

export function findUp(fromDir: string, name: string): string | null {
  const start = path.resolve(fromDir)
  return memoize(`up:${start}|${name}`, () => {
    let dir = start
    for (let depth = 0; depth < 32; depth++) {
      const candidate = path.join(dir, name)
      if (memoize(`exists:${candidate}`, () => fs.existsSync(candidate))) {
        return candidate
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return null
  })
}

export function resetFsMemo() {
  memo.clear()
}
