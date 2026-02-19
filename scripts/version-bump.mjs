#!/usr/bin/env node

// Bump version across manifest.json, package.json, and versions.json.
//
// Usage:
//   node scripts/version-bump.mjs <new-version>
//   node scripts/version-bump.mjs patch|minor|major
//
// Examples:
//   node scripts/version-bump.mjs 1.2.3
//   node scripts/version-bump.mjs patch     # 0.1.0 → 0.1.1

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "..");

function readJSON(name) {
  return JSON.parse(readFileSync(resolve(root, name), "utf-8"));
}

function writeJSON(name, data) {
  writeFileSync(resolve(root, name), JSON.stringify(data, null, 2) + "\n");
}

function bumpVersion(current, type) {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    console.error(`Cannot parse current version: "${current}"`);
    process.exit(1);
  }
  const [major, minor, patch] = parts;
  switch (type) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
    default:
      console.error(`Unknown bump type: "${type}"`);
      process.exit(1);
  }
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/version-bump.mjs <version|patch|minor|major>");
  process.exit(1);
}

const manifest = readJSON("manifest.json");
const pkg = readJSON("package.json");
const versions = readJSON("versions.json");

const currentVersion = manifest.version;
const newVersion = ["patch", "minor", "major"].includes(arg)
  ? bumpVersion(currentVersion, arg)
  : arg;

if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error(`Invalid version format: "${newVersion}" (expected x.y.z)`);
  process.exit(1);
}

if (newVersion === currentVersion) {
  console.error(`Version is already ${currentVersion}`);
  process.exit(1);
}

manifest.version = newVersion;
pkg.version = newVersion;
versions[newVersion] = manifest.minAppVersion;

writeJSON("manifest.json", manifest);
writeJSON("package.json", pkg);
writeJSON("versions.json", versions);

console.log(`${currentVersion} → ${newVersion}`);
console.log("Updated: manifest.json, package.json, versions.json");
