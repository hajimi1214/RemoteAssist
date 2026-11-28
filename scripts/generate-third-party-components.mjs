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

const containerImageMetadata = new Map([
  ["golang:1.26.11-alpine", { scope: "build stage", use: "Go build toolchain and Alpine userland" }],
  ["alpine:3.22", { scope: "runtime stage", use: "Minimal runtime plus ca-certificates and wget packages" }],
  ["postgres:16-alpine", { scope: "runtime service", use: "PostgreSQL database and Alpine packages" }],
  ["coturn/coturn:4.6.3", { scope: "runtime service", use: "TURN relay daemon and its image packages" }],
  ["caddy:2.8-alpine", { scope: "runtime service", use: "TLS reverse proxy and Alpine packages" }]
]);

const containerImageRows = [];
const discoveredContainerImages = new Set();
const imageReferences = [
  {
    path: resolve(repositoryRoot, "server/Dockerfile"),
    evidence: "server/Dockerfile",
    expression: /^\s*FROM\s+([^\s#]+)/gim
  },
  {
    path: resolve(repositoryRoot, "deploy/docker-compose.yml"),
    evidence: "deploy/docker-compose.yml",
    expression: /^\s*image:\s*([^\s#]+)/gim
  }
];

for (const source of imageReferences) {
  const contents = readFileSync(source.path, "utf8");
  for (const match of contents.matchAll(source.expression)) {
    const reference = match[1];
    if (reference.startsWith("remoteassist-signaling:")) continue;
    const separator = reference.lastIndexOf("@sha256:");
    if (separator < 1) {
      throw new Error(`Container image must be pinned by digest: ${reference} in ${source.evidence}`);
    }
    const tag = reference.slice(0, separator);
    const digest = reference.slice(separator + 1);
    if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
      throw new Error(`Invalid container image digest for ${reference} in ${source.evidence}`);
    }
    const metadata = containerImageMetadata.get(tag);
    if (!metadata) throw new Error(`Container image is missing inventory metadata: ${tag}`);
    discoveredContainerImages.add(tag);
    addRow(
      containerImageRows,
      "container image",
      tag,
      `${digest} (multi-platform OCI index; linux/amd64 SBOM child manifest is in docs/container-image-sbom/summary.csv)`,
      metadata.scope,
      "MIXED",
      metadata.use,
      source.evidence
    );
  }
}

const unreferencedContainerImages = [...containerImageMetadata.keys()]
  .filter(image => !discoveredContainerImages.has(image));
if (unreferencedContainerImages.length > 0) {
  throw new Error(`Container image inventory entries have no Dockerfile/Compose reference: ${unreferencedContainerImages.join(", ")}`);
}

const pythonRequirements = new Map();
for (const line of readFileSync(resolve(repositoryRoot, "scripts/requirements-lan-cert.txt"), "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  const match = /^(?<name>[a-zA-Z0-9_-]+)==(?<version>[^\s;]+)$/.exec(trimmed);
  if (!match || pythonRequirements.has(match.groups.name)) {
    throw new Error(`Invalid or duplicated pinned Python package requirement: ${trimmed}`);
  }
  pythonRequirements.set(match.groups.name, match.groups.version);
}

const pythonPackageMetadata = new Map([
  ["cffi", { license: "MIT-0", scope: "transitive", use: "optional LAN certificate helper dependency" }],
  ["cryptography", { license: "Apache-2.0 OR BSD-3-Clause", scope: "direct", use: "optional LAN certificate and CRL generation helper" }],
  ["pycparser", { license: "BSD-3-Clause", scope: "transitive", use: "optional LAN certificate helper dependency" }]
]);
if (pythonRequirements.size !== pythonPackageMetadata.size) {
  throw new Error("Pinned LAN certificate Python requirements do not match the reviewed package inventory.");
}
for (const [component, metadata] of pythonPackageMetadata) {
  const version = pythonRequirements.get(component);
  if (!version) throw new Error(`Pinned Python requirement is missing from inventory metadata: ${component}`);
  addRow(
    rows,
    "Python package",
    component,
    version,
    metadata.scope,
    metadata.license,
    `${metadata.use}, pinned in scripts/requirements-lan-cert.txt`,
    "PyPI metadata"
  );
}

const additionalComponents = [
  ["GitHub Action", "actions/checkout", "v7.0.1 @ 3d3c42e5aac5ba805825da76410c181273ba90b1", "direct", "MIT", "CI source checkout (Node 24 runtime)", ".github/workflows/ci.yml"],
  ["GitHub Action", "actions/setup-node", "v7.1.0 @ 949feb2413d6458794dcd2491c4babbbce0c15c1", "direct", "MIT", "CI Node.js setup (Node 24 runtime)", ".github/workflows/ci.yml"],
  ["GitHub Action", "actions/setup-go", "v6.2.0 @ 7a3fe6cf4cb3a834922a1244abfce67bcef6a0c5", "direct", "MIT", "CI Go setup (Node 24 runtime)", ".github/workflows/ci.yml"],
  ["GitHub Action", "dtolnay/rust-toolchain", "stable @ 39008827e6b4319a349e9a42dfc90579dd25f1ca", "direct", "MIT", "CI Rust toolchain setup", ".github/workflows/ci.yml"],
  ["build distribution", "Gradle Wrapper", "9.6.1-bin", "direct", "Apache-2.0", "Android build distribution, checksum pinned in wrapper properties", "src-tauri/gen/android/gradle/wrapper/gradle-wrapper.properties"],
  ["Python development runtime", "CPython", "3.12.x", "optional local LAN certificate helper; not bundled by RemoteAssist", "PSF-2.0", "Python runtime for LAN certificate generation", "https://docs.python.org/3/license.html"],
  ["runtime platform", "Microsoft WebView2 Evergreen Runtime", "user/system installed", "runtime platform", "Microsoft proprietary terms", "Windows Tauri webview runtime, not redistributed by this repository", "Tauri 2 Windows runtime dependency"]
];

rows.push(...containerImageRows);

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
