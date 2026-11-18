import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as i18n from "../src/i18n";

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
    id === "./i18n" ? i18n : createRequire(process.cwd() + "/package.json")(id),
  component,
);

test("rating is enabled only for read books while idle and keeps zero distinct from unrated", () => {
  const render = (read: boolean, disabled: boolean, rating: number | null) =>
    renderToStaticMarkup(
      React.createElement(component.InlineRating, {
        title: "Book",
        read,
        disabled,
        rating,
        onChange: () => {},
      }),
    );
  expect(render(false, false, 4)).toContain('disabled=""');
  expect(render(true, true, 4)).toContain('disabled=""');
  expect(render(true, false, 0)).not.toContain('disabled=""');
  expect(render(true, false, 0)).toContain('value="0" selected=""');
  expect(render(true, false, null)).toContain('value="" selected=""');
});
