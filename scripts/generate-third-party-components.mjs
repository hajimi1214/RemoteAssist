import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repositoryRoot, "docs/third-party-components.csv");
const checkOnly = process.argv.includes("--check");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}\n${result.stderr}`);
  }
  return result.stdout;
}

function csvField(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function addRow(rows, ecosystem, component, version, scope, license, use, evidence) {
  if (!license || license === "UNDECLARED") {
    throw new Error(`Missing license metadata for ${ecosystem} component ${component}@${version}`);
  }
  rows.push([ecosystem, component, version, scope, license, use, evidence]);
}

const rows = [];
const packageManifest = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
const packageLock = JSON.parse(readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8"));
const directNpm = new Set([
  ...Object.keys(packageManifest.dependencies ?? {}),
  ...Object.keys(packageManifest.devDependencies ?? {}),
  ...Object.keys(packageManifest.optionalDependencies ?? {})
]);

for (const [lockPath, packageInfo] of Object.entries(packageLock.packages ?? {})) {
  if (!lockPath.startsWith("node_modules/")) continue;
  const name = lockPath.slice("node_modules/".length);
  const packageJsonPath = resolve(repositoryRoot, "node_modules", name, "package.json");
  let license = packageInfo.license;
  if (!license) {
    try {
      license = JSON.parse(readFileSync(packageJsonPath, "utf8")).license;
    } catch {
      // The lockfile license field is the authoritative fallback when npm
      // dependencies have not been installed in this checkout.
    }
  }
  addRow(
    rows,
    "npm",
    name,
    packageInfo.version,
    directNpm.has(name) ? "direct" : "transitive",
    license,
    "frontend, build, type definitions, or test tooling",
    "package-lock.json package metadata"
  );
}

const cargoMetadata = JSON.parse(run(
  "cargo",
  ["metadata", "--locked", "--format-version", "1"],
  resolve(repositoryRoot, "src-tauri")
));
const projectPackage = cargoMetadata.packages.find(pkg => pkg.name === "remoteassist" && !pkg.source);
if (!projectPackage) throw new Error("Could not identify the local Cargo package.");
const directCargo = new Set(projectPackage.dependencies.map(dependency => dependency.name));

for (const pkg of cargoMetadata.packages) {
  if (!pkg.source) continue;
  addRow(
    rows,
    "cargo",
    pkg.name,
    pkg.version,
    directCargo.has(pkg.name) ? "direct-or-target-specific" : "transitive",
    pkg.license,
    "Tauri desktop and Windows native code dependency",
    "Cargo.toml/Cargo.lock and cargo metadata SPDX field"
  );
}

const goLicenseByModule = new Map([
  ["github.com/gorilla/websocket", "BSD-2-Clause"],
  ["github.com/lib/pq", "MIT"],
  ["golang.org/x/crypto", "BSD-3-Clause"],
  ["golang.org/x/net", "BSD-3-Clause"],
  ["golang.org/x/sys", "BSD-3-Clause"],
  ["golang.org/x/term", "BSD-3-Clause"],
  ["golang.org/x/text", "BSD-3-Clause"]
]);
const directGo = new Set([
  "github.com/gorilla/websocket",
  "github.com/lib/pq",
  "golang.org/x/crypto"
]);
const goModules = run(
  "go",
  ["list", "-m", "-f", "{{.Path}}|{{.Version}}", "all"],
  resolve(repositoryRoot, "server")
);

for (const line of goModules.trim().split(/\r?\n/)) {
  const [module, version] = line.split("|");
  if (!version || module === "remoteassist/server") continue;
  addRow(
    rows,
    "Go module",
    module,
    version,
    directGo.has(module) ? "direct" : "transitive",
    goLicenseByModule.get(module),
    "signaling service or database/auth dependency",
    "go.mod/go.sum plus upstream module license metadata"
  );
}

const additionalComponents = [
  ["container image", "golang:1.26.11-alpine", "build stage", "MIXED", "Go build toolchain and Alpine userland", "server/Dockerfile"],
  ["container image", "alpine:3.22", "runtime stage", "MIXED", "Minimal runtime plus ca-certificates and wget packages", "server/Dockerfile"],
  ["container image", "postgres:16-alpine", "runtime service", "MIXED", "PostgreSQL database and Alpine packages", "deploy/docker-compose.yml"],
  ["container image", "coturn/coturn:4.6.3", "runtime service", "MIXED", "TURN relay daemon and its image packages", "deploy/docker-compose.yml"],
  ["container image", "caddy:2.8-alpine", "runtime service", "MIXED", "TLS reverse proxy and Alpine packages", "deploy/docker-compose.yml"],
  ["GitHub Action", "actions/checkout", "v4", "MIT", "CI source checkout", ".github/workflows/ci.yml"],
  ["GitHub Action", "actions/setup-node", "v4", "MIT", "CI Node.js setup", ".github/workflows/ci.yml"],
  ["GitHub Action", "actions/setup-go", "v5", "MIT", "CI Go setup", ".github/workflows/ci.yml"],
  ["GitHub Action", "dtolnay/rust-toolchain", "stable", "MIT", "CI Rust toolchain setup", ".github/workflows/ci.yml"],
  ["build distribution", "Gradle Wrapper", "9.6.1-bin", "Apache-2.0", "Android build distribution, checksum pinned in wrapper properties", "src-tauri/gen/android/gradle/wrapper/gradle-wrapper.properties"],
  ["runtime platform", "Microsoft WebView2 Evergreen Runtime", "user/system installed", "Microsoft proprietary terms", "Windows Tauri webview runtime, not redistributed by this repository", "Tauri 2 Windows runtime dependency"]
];

for (const [ecosystem, component, version, scope, license, use, evidence] of additionalComponents) {
  addRow(rows, ecosystem, component, version, scope, license, use, evidence);
}

function compareText(left, right) {
  return left === right ? 0 : left < right ? -1 : 1;
}

rows.sort((left, right) =>
  compareText(left[0], right[0]) ||
  compareText(left[1], right[1]) ||
  compareText(left[2], right[2])
);

const header = [
  "ecosystem",
  "component",
  "version",
  "scope",
  "SPDX license or status",
  "use",
  "evidence/source"
];
const output = [
  header.map(csvField).join(","),
  ...rows.map(row => row.map(csvField).join(","))
].join("\n") + "\n";

if (checkOnly) {
  let existing = "";
  try {
    existing = readFileSync(outputPath, "utf8");
  } catch {
    throw new Error("Component inventory is missing. Run `npm run licenses:generate`.");
  }
  if (existing !== output) {
    throw new Error("Component inventory is stale. Run `npm run licenses:generate` and review the diff.");
  }
  console.log(`Component inventory is current (${rows.length} entries).`);
} else {
  writeFileSync(outputPath, output, "utf8");
  console.log(`Wrote ${rows.length} entries to docs/third-party-components.csv.`);
}
