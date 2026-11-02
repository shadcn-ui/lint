import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { resetFsMemo } from "../src/project/fs"
import {
  candidatesFor,
  isStrayUncPath,
  isUncPath,
  packageTarget,
  resolveFile,
} from "../src/project/resolve"
import { resolveStylesheet } from "../src/tailwind/oracle"

let tmp: string
let app: string
let secret: string

function write(file: string, content: string) {
  const full = path.join(tmp, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
  return full
}

function manifest(dir: string, json: Record<string, unknown>) {
  write(path.join(dir, "package.json"), JSON.stringify(json))
}

beforeEach(() => {
  resetFsMemo()
  tmp = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-containment-"))
  )
  app = path.join(tmp, "app")
  secret = write("secret/x.css", ".secret {}")
  write("app/node_modules/secret/x.css", ".nested {}")
})

afterEach(() => {
  resetFsMemo()
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe("exports", () => {
  test("a target that walks out of the package falls back to the next", () => {
    manifest("app", { name: "app" })
    const fallback = write("app/node_modules/pkg/dist/x.css", ".ok {}")
    manifest("app/node_modules/pkg", {
      name: "pkg",
      exports: {
        "./x.css": ["../../../secret/x.css", "./dist/x.css"],
        "./y.css": { style: "../../../secret/x.css", default: "./dist/x.css" },
      },
    })
    expect(resolveFile("pkg/x.css", app, app, [".css"])).toBe(fallback)
    expect(resolveFile("pkg/y.css", app, app, [".css"])).toBe(fallback)
  })

  test("an escaping target alone resolves nothing", () => {
    manifest("app", { name: "app" })
    manifest("app/node_modules/pkg", {
      name: "pkg",
      exports: { "./x.css": "../../../secret/x.css", "./abs.css": secret },
    })
    expect(resolveFile("pkg/x.css", app, app, [".css"])).toBeNull()
    expect(resolveFile("pkg/abs.css", app, app, [".css"])).toBeNull()
    expect(candidatesFor("pkg/abs.css", app, app)).not.toContain(secret)
  })

  test("a node_modules segment or an encoded separator is refused", () => {
    manifest("app", { name: "app" })
    write("app/node_modules/pkg/node_modules/dep/x.css", ".dep {}")
    write("app/node_modules/pkg/a%2fb.css", ".enc {}")
    manifest("app/node_modules/pkg", {
      name: "pkg",
      exports: {
        "./dep.css": "./node_modules/dep/x.css",
        "./enc.css": "./a%2fb.css",
      },
    })
    expect(resolveFile("pkg/dep.css", app, app, [".css"])).toBeNull()
    expect(resolveFile("pkg/enc.css", app, app, [".css"])).toBeNull()
  })

  test("a wildcard capture cannot inject ../", () => {
    manifest("app", { name: "app" })
    manifest("app/node_modules/pkg", {
      name: "pkg",
      exports: { "./*": "./dist/*" },
    })
    expect(
      resolveFile("pkg/../../../secret/x.css", app, app, [".css"])
    ).toBeNull()
    for (const candidate of candidatesFor(
      "pkg/../../../secret/x.css",
      app,
      app
    )) {
      expect(candidate.startsWith(path.join(app, "node_modules/pkg"))).toBe(
        true
      )
    }
  })

  test("a ./ target inside the package still resolves", () => {
    manifest("app", { name: "app" })
    const file = write("app/node_modules/pkg/dist/x.css", ".ok {}")
    const themed = write("app/node_modules/pkg/dist/themes/dark.css", ".d {}")
    manifest("app/node_modules/pkg", {
      name: "pkg",
      exports: { "./x.css": "./dist/x.css", "./themes/*": "./dist/themes/*" },
    })
    expect(resolveFile("pkg/x.css", app, app, [".css"])).toBe(file)
    expect(resolveFile("pkg/themes/dark.css", app, app, [".css"])).toBe(themed)
  })
})

describe("imports", () => {
  test("a target that walks out of the project falls back to the next", () => {
    const fallback = write("app/src/x.css", ".ok {}")
    manifest("app", {
      name: "app",
      imports: {
        "#x": ["../secret/x.css", "./src/x.css"],
        "#abs": secret,
        "#up": "../secret/x.css",
      },
    })
    expect(resolveFile("#x", app, app, [".css"])).toBe(fallback)
    expect(resolveFile("#abs", app, app, [".css"])).toBeNull()
    expect(resolveFile("#up", app, app, [".css"])).toBeNull()
  })

  test("a wildcard capture cannot inject ../", () => {
    write("app/src/styles/a.css", ".a {}")
    manifest("app", { name: "app", imports: { "#styles/*": "./src/styles/*" } })
    expect(resolveFile("#styles/a.css", app, app, [".css"])).toBe(
      path.join(app, "src/styles/a.css")
    )
    expect(resolveFile("#styles/../../../secret/x.css", app, app)).toBeNull()
  })

  test("a bare package target resolves as a package, not a path", () => {
    const file = write("app/node_modules/theme/dist/x.css", ".t {}")
    manifest("app/node_modules/theme", {
      name: "theme",
      exports: { "./x.css": "./dist/x.css" },
    })
    // Read as a path, "secret/x.css" would be app/secret/x.css.
    write("app/secret/x.css", ".path {}")
    manifest("app", {
      name: "app",
      imports: {
        "#theme": "theme/x.css",
        "#secret": "secret/x.css",
        "#deep/*": "theme/*",
      },
    })
    expect(resolveFile("#theme", app, app, [".css"])).toBe(file)
    expect(resolveFile("#secret", app, app, [".css"])).toBe(
      path.join(app, "node_modules/secret/x.css")
    )
    expect(resolveFile("#deep/../../../secret/x.css", app, app)).toBeNull()
  })
})

describe("UNC paths", () => {
  test("are recognized with either separator", () => {
    expect(isUncPath("//host/share/x.css")).toBe(true)
    expect(isUncPath("\\\\host\\share\\x.css")).toBe(true)
    expect(isUncPath("/\\host/share")).toBe(true)
    expect(isUncPath("/home/x.css")).toBe(false)
    expect(isUncPath("C:\\x.css")).toBe(false)
  })

  test("outside the project are stray, inside one on a share are not", () => {
    expect(isStrayUncPath("//host/share/x.css", "/home/app")).toBe(true)
    expect(isStrayUncPath("/home/app/x.css", "/home/app")).toBe(false)
    expect(isStrayUncPath("//host/share/app/x.css", "//host/share/app")).toBe(
      false
    )
    expect(isStrayUncPath("//other/share/x.css", "//host/share/app")).toBe(true)
  })

  test("an absolute UNC specifier is never a candidate", () => {
    manifest("app", { name: "app" })
    expect(candidatesFor("//host/share/x.css", app, app)).toEqual([])
    expect(candidatesFor("\\\\host\\share\\x.css", app, app)).not.toContain(
      "\\\\host\\share\\x.css"
    )
  })

  test("a UNC exports target is skipped", () => {
    manifest("app", { name: "app" })
    const fallback = write("app/node_modules/pkg/dist/x.css", ".ok {}")
    manifest("app/node_modules/pkg", {
      name: "pkg",
      exports: {
        "./x.css": [
          "//host/share/x.css",
          "\\\\host\\share\\x.css",
          "./dist/x.css",
        ],
      },
    })
    const dir = path.join(app, "node_modules/pkg")
    expect(packageTarget(dir, "//host/share/x.css")).toBeNull()
    expect(packageTarget(dir, "\\\\host\\share\\x.css")).toBeNull()
    expect(resolveFile("pkg/x.css", app, app, [".css"])).toBe(fallback)
  })
})

describe("resolveStylesheet", () => {
  test("skips exports targets that leave the package", () => {
    const fallback = write("app/node_modules/pkg/dist/x.css", ".ok {}")
    manifest("app/node_modules/pkg", {
      name: "pkg",
      exports: {
        ".": { style: "../../../secret/x.css", default: "./dist/x.css" },
        "./x.css": "../../../secret/x.css",
        "./abs.css": secret,
        "./unc.css": "//host/share/x.css",
        "./ok.css": { style: "./dist/x.css" },
        "./*": "./dist/*",
      },
    })
    expect(resolveStylesheet(app, "pkg")).toBe(fallback)
    expect(resolveStylesheet(app, "pkg/ok.css")).toBe(fallback)
    expect(resolveStylesheet(app, "pkg/x.css")).toBe(fallback)
    expect(resolveStylesheet(app, "pkg/abs.css")).not.toBe(secret)
    expect(resolveStylesheet(app, "pkg/unc.css")).toBeNull()
    expect(resolveStylesheet(app, "pkg/../../../secret/x.css")).toBeNull()
  })

  test("skips a root exports string that leaves the package", () => {
    const index = write("app/node_modules/pkg/index.css", ".i {}")
    manifest("app/node_modules/pkg", {
      name: "pkg",
      exports: "../../../secret/x.css",
    })
    expect(resolveStylesheet(app, "pkg")).toBe(index)
  })

  test("skips a style or main field that leaves the package", () => {
    write("secret/y.css", ".s {}")
    const index = write("app/node_modules/pkg2/index.css", ".i {}")
    manifest("app/node_modules/pkg2", {
      name: "pkg2",
      style: "../../../secret/y.css",
      main: "../../../secret/y.css",
    })
    expect(resolveStylesheet(app, "pkg2")).toBe(index)
  })

  test("never resolves an absolute UNC import", () => {
    expect(resolveStylesheet(app, "//host/share/x.css")).toBeNull()
  })
})
