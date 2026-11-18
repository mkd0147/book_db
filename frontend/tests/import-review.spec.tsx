import { test, expect } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { api, ApiError } from "../src/api";
import { resolveImport, type ImportConflict } from "../src/import-review";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as i18n from "../src/i18n";

const conflicts: ImportConflict[] = [
  {
    index: 0,
    entry: {
      author: "Leo Tolstoy",
      english_title: "The Death of Ivan Ilych",
      rank: 1,
    },
    candidates: [
      {
        id: 12,
        author: "Leo Tolstoy",
        english_title: "The Death of Ivan Ilyich",
      },
    ],
  },
  {
    index: 1,
    entry: {
      author: "Graham Greene",
      english_title: "The End of The Party",
      rank: 2,
    },
    candidates: [
      {
        id: 42,
        author: "Graham Greene",
        english_title: "The End of the Affair",
      },
    ],
  },
];
const preview = JSON.stringify({
  name: "Stories",
  entries: conflicts.map((c) => c.entry),
});

test("Import review: API retains candidates in structured errors", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ detail: { message: "Review matches", conflicts } }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  try {
    let error: unknown;
    try {
      await api("/lists/import", "POST", {});
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).detail.conflicts).toEqual(conflicts);
  } finally {
    globalThis.fetch = original;
  }
});

test("Import review: explicit choices preserve IDs and distinguish different works", () => {
  expect(() => resolveImport(preview, conflicts, { 0: "12" })).toThrow(
    "every possible match",
  );
  expect(() =>
    resolveImport(preview, conflicts, { 0: "99", 1: "separate" }),
  ).toThrow("displayed books");
  const resolved = resolveImport(preview, conflicts, {
    0: "12",
    1: "separate",
  });
  expect(resolved.entries[0].book_id).toBe(12);
  expect(resolved.entries[1].create_separate).toBe(true);
  expect(resolved.entries[1].book_id).toBeUndefined();
  expect(JSON.parse(preview).entries[0].book_id).toBeUndefined();
});

test("Import review: displays source and candidate titles with no default selection", () => {
  // Playwright rewrites JSX for its own component protocol. Compile this component
  // with the application's React runtime for a browser-free markup assertion.
  const compiled = ts.transpileModule(
    readFileSync("src/ImportReview.tsx", "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const exports: any = {};
  new Function("require", "exports", compiled)(
    (id: string) =>
      id === "./i18n"
        ? i18n
        : createRequire(process.cwd() + "/package.json")(id),
    exports,
  );
  const html = renderToStaticMarkup(
    React.createElement(exports.ImportReview, {
      conflicts,
      choices: {},
      disabled: false,
      onChoose: () => {},
    }),
  );
  expect(html).toContain("The End of The Party");
  expect(html).toContain("The End of the Affair");
  expect(html).toContain("Book #42");
  expect(html).toContain("Nothing has been imported yet");
  expect(html).not.toContain('checked=""');
});
