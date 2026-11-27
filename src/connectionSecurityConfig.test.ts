import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type TauriConfig = {
  app?: {
    windows?: Array<{ useHttpsScheme?: boolean }>;
    security?: { csp?: string };
  };
};

function loadTauriConfig(fileName: string): TauriConfig {
  const configURL = new URL(`../src-tauri/${fileName}`, import.meta.url);
  return JSON.parse(readFileSync(configURL, "utf8")) as TauriConfig;
}

function parseCsp(configuration: TauriConfig): Map<string, string[]> {
  const csp = configuration.app?.security?.csp;
  assert.ok(csp, "the packaged application must define a CSP");

  return new Map(
    csp.split(";").map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

function assertDocumentAndScriptBoundaries(directives: Map<string, string[]>) {
  assert.deepEqual(directives.get("default-src"), ["'self'"]);
  assert.deepEqual(directives.get("base-uri"), ["'self'"]);
  assert.deepEqual(directives.get("object-src"), ["'none'"]);
  assert.deepEqual(directives.get("frame-ancestors"), ["'none'"]);
  assert.deepEqual(directives.get("script-src"), ["'self'"]);

  for (const [name, sources] of directives) {
    assert.ok(!sources.includes("*"), `${name} must not use a wildcard source`);
    assert.ok(!sources.includes("'unsafe-eval'"), `${name} must not allow eval`);
  }
}

test("desktop CSP confines document loads while supporting configured remote services", () => {
  const directives = parseCsp(loadTauriConfig("tauri.conf.json"));

  assertDocumentAndScriptBoundaries(directives);
  assert.deepEqual(directives.get("connect-src"), [
    "ipc:",
    "http://ipc.localhost",
    "http://localhost:8080",
    "ws://localhost:8080",
    "https:",
    "wss:",
  ]);
  assert.deepEqual(directives.get("img-src"), ["'self'", "asset:", "http://asset.localhost", "data:", "blob:"]);
  assert.deepEqual(directives.get("media-src"), ["'self'", "blob:"]);
});

test("Android CSP and generated manifest retain HTTPS-only transport", () => {
  const configuration = loadTauriConfig("tauri.android.conf.json");
  const directives = parseCsp(configuration);
  const manifestURL = new URL("../src-tauri/gen/android/app/src/main/AndroidManifest.xml", import.meta.url);
  const buildFileURL = new URL("../src-tauri/gen/android/app/build.gradle.kts", import.meta.url);
  const manifest = readFileSync(manifestURL, "utf8");
  const buildFile = readFileSync(buildFileURL, "utf8");

  assertDocumentAndScriptBoundaries(directives);
  assert.deepEqual(directives.get("connect-src"), ["ipc:", "http://ipc.localhost", "https:", "wss:"]);
  assert.equal(configuration.app?.windows?.[0]?.useHttpsScheme, true);
  assert.match(manifest, /android:usesCleartextTraffic="\$\{usesCleartextTraffic\}"/);
  assert.match(buildFile, /defaultConfig\s*\{[\s\S]*?\["usesCleartextTraffic"\]\s*=\s*"false"/);
  assert.match(buildFile, /getByName\("debug"\)\s*\{[\s\S]*?\["usesCleartextTraffic"\]\s*=\s*"false"/);
});
