import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as i18n from "../src/i18n";

test.afterEach(() => i18n.setLanguage("en"));
test("language choice persists across startup and updates document language", () => {
  const compiled = ts.transpileModule(readFileSync("src/i18n.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const storage = new Map<string, string>();
  const document = { documentElement: { lang: "" } };
  function start() {
    const module: any = {};
    new Function(
      "require",
      "exports",
      "localStorage",
      "navigator",
      "document",
      compiled,
    )(
      createRequire(process.cwd() + "/package.json"),
      module,
      {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      { language: "cs-CZ" },
      document,
    );
    return module;
  }
  const first = start();
  expect(document.documentElement.lang).toBe("cs");
  first.setLanguage("sk");
  expect(storage.get("bookdb.language")).toBe("sk");
  expect(document.documentElement.lang).toBe("sk");
  const second = start();
  expect(second.t("Settings")).toBe("Nastavenia");
});
test("language detection respects saved choice and falls back safely", () => {
  expect(i18n.detectLanguage("en", "sk-SK")).toBe("en");
  expect(i18n.detectLanguage(null, "cs-CZ")).toBe("cs");
  expect(i18n.detectLanguage("invalid", "sk-SK")).toBe("sk");
  expect(i18n.detectLanguage(null, "de-DE")).toBe("en");
});
test("catalog covers both languages with matching placeholders and preserves inserted titles", () => {
  for (const [key, entry] of Object.entries(i18n.messages)) {
    for (const locale of ["cs", "sk"] as const) {
      expect(entry[locale].trim(), key).not.toBe("");
      expect(entry[locale].match(/\{\w+\}/g)?.sort(), key).toEqual(
        key.match(/\{\w+\}/g)?.sort(),
      );
    }
  }
  expect(i18n.t("Select {title}", { title: "Collection" }, "cs")).toBe(
    "Vybrat Collection",
  );
  expect(i18n.t("Select {title}", { title: "Collection" }, "sk")).toBe(
    "Vybrať Collection",
  );
  i18n.setLanguage("sk");
  expect(i18n.number(12.5, 2)).toBe("12,50");
});
test("rating markup switches language while preserving book data and read restriction", () => {
  const compiled = ts.transpileModule(
    readFileSync("src/InlineRating.tsx", "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const component: any = {};
  new Function("require", "exports", compiled)(
    (id: string) =>
      id === "./i18n"
        ? i18n
        : createRequire(process.cwd() + "/package.json")(id),
    component,
  );
  for (const [locale, label] of [
    ["cs", "Hodnocení"],
    ["sk", "Hodnotenie"],
  ] as const) {
    i18n.setLanguage(locale);
    const html = renderToStaticMarkup(
      React.createElement(component.InlineRating, {
        title: "Read",
        rating: null,
        read: false,
        disabled: false,
        onChange: () => {},
      }),
    );
    expect(html).toContain(label + ": Read");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("Unrated");
  }
});
test("visible static JSX text is localized", () => {
  const missing: string[] = [];
  for (const name of [
    "main.tsx",
    "ImportReview.tsx",
    "InlineRating.tsx",
    "SeriesDetailsEditor.tsx",
    "SeriesEntryEditor.tsx",
    "Loans.tsx",
    "ReadingTracker.tsx",
  ]) {
    const source = ts.createSourceFile(
      name,
      readFileSync("src/" + name, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node: ts.Node) {
      if (
        ts.isJsxAttribute(node) &&
        ["className", "value", "key", "name", "id"].includes(
          node.name.getText(source),
        )
      ) {
        expect(
          node.getText(source),
          "Internal attributes must not be translated",
        ).not.toMatch(/\bt\(/);
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "t" &&
        node.arguments.length &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const key = node.arguments[0].text;
        if (!i18n.messages[key])
          missing.push(name + ": missing translation for " + key);
      }
      if (ts.isJsxText(node)) {
        const text = node.text.replace(/\s+/g, " ").trim();
        if (
          /[a-zA-Z]/.test(text) &&
          ![
            "B",
            "BookDB",
            "BOOKDB",
            "English",
            "Čeština",
            "Slovenčina",
          ].includes(text)
        )
          missing.push(name + ": " + text);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(missing).toEqual([]);
});
