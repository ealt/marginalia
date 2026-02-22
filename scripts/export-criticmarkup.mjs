import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exportMarginaliaToCritic } from "../src/criticMarkupInterop.ts";

function toSidecarPath(notePath) {
  const lowerPath = notePath.toLowerCase();
  if (lowerPath.endsWith(".md")) {
    return `${notePath.slice(0, -3)}.critmeta.json`;
  }
  return `${notePath}.critmeta.json`;
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npm run interop:export -- path/to/note.md");
  process.exit(1);
}

const notePath = resolve(inputPath);
const sidecarPath = toSidecarPath(notePath);

const source = await readFile(notePath, "utf8");
const result = exportMarginaliaToCritic(source);

await writeFile(notePath, result.text, "utf8");
await writeFile(sidecarPath, `${JSON.stringify(result.sidecar, null, 2)}\n`, "utf8");

const threadCount = result.diagnostics.exportedRangeThreads + result.diagnostics.exportedPointThreads;
console.log(`Exported ${threadCount} thread(s) to CriticMarkup.`);
if (result.diagnostics.malformedMarginaliaPairs > 0) {
  console.log(`Ignored ${result.diagnostics.malformedMarginaliaPairs} malformed Marginalia pair(s).`);
}
console.log(`Sidecar written: ${sidecarPath}`);
