import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;
const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the speaking topic deck", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.match(
    html,
    /<title>OutLoud Deck \| Public Speaking Topic Generator<\/title>/i,
  );
  assert.match(html, /OutLoud Deck/);
  assert.match(html, /Pick the uncomfortable topic\. Speak it clean\./);
  assert.match(html, /Draw three/);
  assert.match(html, /Why this one/);
  assert.match(html, /Last 10/);
  assert.doesNotMatch(html, /Codex/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("removes the starter preview surface", async () => {
  const [css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /SpeechDeckApp/);
  assert.match(layout, /OutLoud Deck/);
  assert.match(css, /topic-stack/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page, /codex-preview|SkeletonPreview/);
  assert.doesNotMatch(layout, /Starter Project/);
  assert.doesNotMatch(
    css,
    /loading-spinner|status-mark|status-progress|canvas|pets/i,
  );

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await assert.rejects(
    access(new URL("public/_sites-preview", templateRoot)),
  );
});
