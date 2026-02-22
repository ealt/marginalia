import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { importCriticToMarginalia, parseCriticSidecar } from "../src/criticMarkupInterop.ts";

function toSidecarPath(notePath) {
  const lowerPath = notePath.toLowerCase();
  if (lowerPath.endsWith(".md")) {
    return `${notePath.slice(0, -3)}.critmeta.json`;
  }
  return `${notePath}.critmeta.json`;
}

async function readSidecar(path) {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = parseCriticSidecar(JSON.parse(raw));
    if (!parsed) {
      console.warn(`Sidecar ignored due to invalid shape: ${path}`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npm run interop:import -- path/to/note.md");
  process.exit(1);
}

const notePath = resolve(inputPath);
const sidecarPath = toSidecarPath(notePath);

const source = await readFile(notePath, "utf8");
const sidecar = await readSidecar(sidecarPath);
const result = importCriticToMarginalia(source, sidecar);

await writeFile(notePath, result.text, "utf8");

const threadCount = result.diagnostics.importedRangeThreads + result.diagnostics.importedPointThreads;
console.log(`Imported ${threadCount} thread(s) from CriticMarkup.`);
if (result.diagnostics.matchedSidecarRecords > 0) {
  console.log(`Matched ${result.diagnostics.matchedSidecarRecords} sidecar record(s).`);
}
if (result.diagnostics.unmatchedSidecarRecords > 0) {
  console.log(`Unmatched sidecar record(s): ${result.diagnostics.unmatchedSidecarRecords}`);
}
if (result.diagnostics.malformedCriticTokens > 0) {
  console.log(`Malformed CriticMarkup token(s) ignored: ${result.diagnostics.malformedCriticTokens}`);
}
