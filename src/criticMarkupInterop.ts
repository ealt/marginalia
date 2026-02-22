import { buildCommentMarkers, generateCommentId, parseCommentsWithDiagnostics } from "./commentParser.ts";
import type { Comment, CommentChild } from "./types.ts";

const COMMENT_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const WHITESPACE_REGEX = /\s/;

type AnchorType = "range" | "point";

interface ParentMeta {
  id: string;
  author: string;
  ts: number;
  resolved: boolean;
  text: string;
}

interface ChildMeta {
  id: string;
  author: string;
  ts: number;
  text: string;
}

export interface CriticSidecarRecord {
  threadId: string;
  anchorType: AnchorType;
  exportOrder: number;
  tokenComments: string[];
  tokenBlockFingerprint: string;
  annotatedTextFingerprint: string;
  parent: ParentMeta;
  children: ChildMeta[];
}

export interface CriticSidecar {
  v: 1;
  source: "marginalia";
  generatedAt: string;
  records: CriticSidecarRecord[];
}

export interface ExportCriticDiagnostics {
  malformedMarginaliaPairs: number;
  exportedRangeThreads: number;
  exportedPointThreads: number;
}

export interface ImportCriticDiagnostics {
  malformedCriticTokens: number;
  importedRangeThreads: number;
  importedPointThreads: number;
  matchedSidecarRecords: number;
  unmatchedSidecarRecords: number;
}

export interface ExportCriticResult {
  text: string;
  sidecar: CriticSidecar;
  diagnostics: ExportCriticDiagnostics;
}

export interface ImportCriticResult {
  text: string;
  diagnostics: ImportCriticDiagnostics;
}

interface CriticToken {
  content: string;
  end: number;
}

interface SidecarMatch {
  recordIndex: number;
  record: CriticSidecarRecord;
}

interface ThreadCandidate {
  anchorType: AnchorType;
  order: number;
  annotatedText: string;
  tokenComments: string[];
}

interface ParseOutcome {
  kind: "none" | "malformed" | "token";
  token?: CriticToken;
}

interface ParsedCommentRun {
  comments: string[];
  end: number;
  malformedCount: number;
}

export function exportMarginaliaToCritic(docText: string): ExportCriticResult {
  const parsed = parseCommentsWithDiagnostics(docText);
  const output: string[] = [];
  const records: CriticSidecarRecord[] = [];
  let cursor = 0;
  let exportedRangeThreads = 0;
  let exportedPointThreads = 0;

  parsed.comments.forEach((entry, index) => {
    output.push(docText.slice(cursor, entry.startMarkerFrom));

    const annotatedText = docText.slice(entry.annotatedFrom, entry.annotatedTo);
    const tokenComments = [entry.comment.text, ...entry.comment.children.map((child) => child.text)];
    const tokenBlock = tokenComments.map(encodeCriticCommentToken).join("");

    if (annotatedText.length > 0) {
      output.push(`${encodeCriticHighlight(annotatedText)}${tokenBlock}`);
      exportedRangeThreads += 1;
    } else {
      output.push(tokenBlock);
      exportedPointThreads += 1;
    }

    records.push(buildSidecarRecord(entry.comment, annotatedText, tokenComments, index));
    cursor = entry.endMarkerTo;
  });

  output.push(docText.slice(cursor));

  return {
    text: output.join(""),
    sidecar: {
      v: 1,
      source: "marginalia",
      generatedAt: new Date().toISOString(),
      records
    },
    diagnostics: {
      malformedMarginaliaPairs: parsed.invalidPairs,
      exportedRangeThreads,
      exportedPointThreads
    }
  };
}

export function importCriticToMarginalia(docText: string, sidecar: CriticSidecar | null = null): ImportCriticResult {
  const matcher = createSidecarMatcher(sidecar);
  const existingIds = collectExistingIds(docText);
  const output: string[] = [];

  let cursor = 0;
  let i = 0;
  let order = 0;
  let malformedCriticTokens = 0;
  let importedRangeThreads = 0;
  let importedPointThreads = 0;

  while (i < docText.length) {
    const highlight = parseHighlightTokenAt(docText, i);
    if (highlight.kind === "malformed") {
      malformedCriticTokens += 1;
      i += 1;
      continue;
    }

    if (highlight.kind === "token") {
      const attached = parseAttachedCommentTokens(docText, highlight.token!.end);
      malformedCriticTokens += attached.malformedCount;
      if (attached.comments.length > 0) {
        output.push(docText.slice(cursor, i));

        const candidate: ThreadCandidate = {
          anchorType: "range",
          order,
          annotatedText: decodeCriticTokenText(highlight.token!.content),
          tokenComments: attached.comments.map(decodeCriticTokenText)
        };
        const match = claimSidecarMatch(matcher, candidate);
        const comment = buildImportedComment(candidate.tokenComments, match?.record ?? null, existingIds);
        const markers = buildCommentMarkers(comment);

        output.push(`${markers.startMarker}${candidate.annotatedText}${markers.endMarker}`);
        cursor = attached.end;
        i = attached.end;
        order += 1;
        importedRangeThreads += 1;
        continue;
      }

      i = highlight.token!.end;
      continue;
    }

    const commentToken = parseCommentTokenAt(docText, i);
    if (commentToken.kind === "malformed") {
      malformedCriticTokens += 1;
      i += 1;
      continue;
    }

    if (commentToken.kind === "token") {
      const run = parseStandaloneCommentRun(docText, i);
      malformedCriticTokens += run.malformedCount;

      if (run.comments.length > 0) {
        output.push(docText.slice(cursor, i));

        let runOffset = 0;
        while (runOffset < run.comments.length) {
          const remaining = run.comments.length - runOffset;
          let chosenLength = 1;
          let chosenMatch: SidecarMatch | null = null;

          for (let length = remaining; length >= 1; length -= 1) {
            const commentsSlice = run.comments.slice(runOffset, runOffset + length).map(decodeCriticTokenText);
            const candidate: ThreadCandidate = {
              anchorType: "point",
              order,
              annotatedText: "",
              tokenComments: commentsSlice
            };
            const match = findSidecarMatch(matcher, candidate);
            if (match) {
              chosenLength = length;
              chosenMatch = match;
              break;
            }
          }

          const tokenComments = run.comments
            .slice(runOffset, runOffset + chosenLength)
            .map(decodeCriticTokenText);
          const candidate: ThreadCandidate = {
            anchorType: "point",
            order,
            annotatedText: "",
            tokenComments
          };
          if (chosenMatch) {
            matcher.usedRecordIndexes.add(chosenMatch.recordIndex);
          }
          const comment = buildImportedComment(tokenComments, chosenMatch?.record ?? null, existingIds);
          const markers = buildCommentMarkers(comment);
          output.push(`${markers.startMarker}${markers.endMarker}`);

          runOffset += chosenLength;
          order += 1;
          importedPointThreads += 1;
        }

        cursor = run.end;
        i = run.end;
        continue;
      }
    }

    i += 1;
  }

  output.push(docText.slice(cursor));

  return {
    text: output.join(""),
    diagnostics: {
      malformedCriticTokens,
      importedRangeThreads,
      importedPointThreads,
      matchedSidecarRecords: matcher.usedRecordIndexes.size,
      unmatchedSidecarRecords: matcher.records.length - matcher.usedRecordIndexes.size
    }
  };
}

export function parseCriticSidecar(input: unknown): CriticSidecar | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  if (candidate.v !== 1 || candidate.source !== "marginalia" || !Array.isArray(candidate.records)) {
    return null;
  }

  const parsedRecords: CriticSidecarRecord[] = [];
  for (const item of candidate.records) {
    const parsedRecord = parseSidecarRecord(item);
    if (!parsedRecord) {
      return null;
    }
    parsedRecords.push(parsedRecord);
  }

  return {
    v: 1,
    source: "marginalia",
    generatedAt: typeof candidate.generatedAt === "string" ? candidate.generatedAt : "",
    records: parsedRecords
  };
}

function parseSidecarRecord(input: unknown): CriticSidecarRecord | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.threadId !== "string") {
    return null;
  }
  if (candidate.anchorType !== "range" && candidate.anchorType !== "point") {
    return null;
  }
  if (typeof candidate.exportOrder !== "number" || !Number.isFinite(candidate.exportOrder)) {
    return null;
  }
  if (!Array.isArray(candidate.tokenComments) || !candidate.tokenComments.every((value) => typeof value === "string")) {
    return null;
  }
  if (typeof candidate.tokenBlockFingerprint !== "string") {
    return null;
  }
  if (typeof candidate.annotatedTextFingerprint !== "string") {
    return null;
  }

  const parent = parseParentMeta(candidate.parent);
  if (!parent) {
    return null;
  }

  if (!Array.isArray(candidate.children)) {
    return null;
  }
  const children: ChildMeta[] = [];
  for (const item of candidate.children) {
    const child = parseChildMeta(item);
    if (!child) {
      return null;
    }
    children.push(child);
  }

  return {
    threadId: candidate.threadId,
    anchorType: candidate.anchorType,
    exportOrder: Math.floor(candidate.exportOrder),
    tokenComments: [...candidate.tokenComments],
    tokenBlockFingerprint: candidate.tokenBlockFingerprint,
    annotatedTextFingerprint: candidate.annotatedTextFingerprint,
    parent,
    children
  };
}

function parseParentMeta(input: unknown): ParentMeta | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.id !== "string"
    || typeof candidate.author !== "string"
    || typeof candidate.ts !== "number"
    || !Number.isFinite(candidate.ts)
    || typeof candidate.resolved !== "boolean"
    || typeof candidate.text !== "string") {
    return null;
  }

  return {
    id: candidate.id,
    author: candidate.author,
    ts: Math.floor(candidate.ts),
    resolved: candidate.resolved,
    text: candidate.text
  };
}

function parseChildMeta(input: unknown): ChildMeta | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.id !== "string"
    || typeof candidate.author !== "string"
    || typeof candidate.ts !== "number"
    || !Number.isFinite(candidate.ts)
    || typeof candidate.text !== "string") {
    return null;
  }

  return {
    id: candidate.id,
    author: candidate.author,
    ts: Math.floor(candidate.ts),
    text: candidate.text
  };
}

function buildSidecarRecord(comment: Comment, annotatedText: string, tokenComments: string[], exportOrder: number): CriticSidecarRecord {
  return {
    threadId: comment.id,
    anchorType: annotatedText.length > 0 ? "range" : "point",
    exportOrder,
    tokenComments,
    tokenBlockFingerprint: fingerprint(joinTokenComments(tokenComments)),
    annotatedTextFingerprint: fingerprint(normalizeForMatch(annotatedText)),
    parent: {
      id: comment.id,
      author: comment.author,
      ts: comment.ts,
      resolved: comment.resolved,
      text: comment.text
    },
    children: comment.children.map((child) => ({
      id: child.id,
      author: child.author,
      ts: child.ts,
      text: child.text
    }))
  };
}

function parseHighlightTokenAt(text: string, index: number): ParseOutcome {
  return parseTokenAt(text, index, "{==", "==}");
}

function parseCommentTokenAt(text: string, index: number): ParseOutcome {
  return parseTokenAt(text, index, "{>>", "<<}");
}

function parseTokenAt(text: string, index: number, open: string, close: string): ParseOutcome {
  if (!text.startsWith(open, index)) {
    return { kind: "none" };
  }

  const endIndex = text.indexOf(close, index + open.length);
  if (endIndex === -1) {
    return { kind: "malformed" };
  }

  return {
    kind: "token",
    token: {
      content: text.slice(index + open.length, endIndex),
      end: endIndex + close.length
    }
  };
}

function parseAttachedCommentTokens(text: string, start: number): ParsedCommentRun {
  const comments: string[] = [];
  let malformedCount = 0;
  let cursor = start;
  let end = start;

  while (cursor < text.length) {
    const nextCommentIndex = skipWhitespace(text, cursor);
    const comment = parseCommentTokenAt(text, nextCommentIndex);

    if (comment.kind === "malformed") {
      malformedCount += 1;
      break;
    }
    if (comment.kind !== "token") {
      break;
    }

    comments.push(comment.token!.content);
    end = comment.token!.end;
    cursor = comment.token!.end;
  }

  return {
    comments,
    end: comments.length > 0 ? end : start,
    malformedCount
  };
}

function parseStandaloneCommentRun(text: string, start: number): ParsedCommentRun {
  const comments: string[] = [];
  let malformedCount = 0;
  let cursor = start;
  let end = start;

  while (cursor < text.length) {
    const comment = parseCommentTokenAt(text, cursor);
    if (comment.kind === "malformed") {
      malformedCount += 1;
      break;
    }
    if (comment.kind !== "token") {
      break;
    }

    comments.push(comment.token!.content);
    end = comment.token!.end;

    const whitespaceEnd = skipWhitespace(text, end);
    const next = parseCommentTokenAt(text, whitespaceEnd);
    if (next.kind === "malformed") {
      malformedCount += 1;
      break;
    }
    if (next.kind !== "token") {
      break;
    }

    cursor = whitespaceEnd;
  }

  return { comments, end, malformedCount };
}

function skipWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length && WHITESPACE_REGEX.test(text[index])) {
    index += 1;
  }
  return index;
}

function collectExistingIds(docText: string): Set<string> {
  const ids = new Set<string>();
  for (const entry of parseCommentsWithDiagnostics(docText).comments) {
    ids.add(entry.comment.id);
    for (const child of entry.comment.children) {
      ids.add(child.id);
    }
  }
  return ids;
}

function buildImportedComment(tokenComments: string[], sidecarRecord: CriticSidecarRecord | null, usedIds: Set<string>): Comment {
  const now = Math.floor(Date.now() / 1000);
  const parentText = tokenComments[0] ?? "";

  const parentId = takeCommentId(sidecarRecord?.parent.id ?? sidecarRecord?.threadId ?? null, usedIds);
  const parentAuthor = sidecarRecord?.parent.author ?? "Unknown";
  const parentTs = normalizeTimestamp(sidecarRecord?.parent.ts, now);
  const resolved = sidecarRecord?.parent.resolved ?? false;

  const children: CommentChild[] = [];
  for (let i = 1; i < tokenComments.length; i += 1) {
    const childMeta = sidecarRecord?.children[i - 1];
    children.push({
      id: takeCommentId(childMeta?.id ?? null, usedIds),
      text: tokenComments[i],
      author: childMeta?.author ?? "Unknown",
      ts: normalizeTimestamp(childMeta?.ts, now)
    });
  }

  return {
    v: 1,
    id: parentId,
    text: parentText,
    author: parentAuthor,
    ts: parentTs,
    resolved,
    children
  };
}

function normalizeTimestamp(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.floor(value);
}

function takeCommentId(preferredId: string | null, usedIds: Set<string>): string {
  if (preferredId && COMMENT_ID_REGEX.test(preferredId) && !usedIds.has(preferredId)) {
    usedIds.add(preferredId);
    return preferredId;
  }

  let id = generateCommentId();
  while (usedIds.has(id)) {
    id = generateCommentId();
  }
  usedIds.add(id);
  return id;
}

function createSidecarMatcher(sidecar: CriticSidecar | null): {
  records: CriticSidecarRecord[];
  usedRecordIndexes: Set<number>;
} {
  return {
    records: sidecar?.records ?? [],
    usedRecordIndexes: new Set<number>()
  };
}

function findSidecarMatch(
  matcher: { records: CriticSidecarRecord[]; usedRecordIndexes: Set<number> },
  candidate: ThreadCandidate
): SidecarMatch | null {
  if (matcher.records.length === 0) {
    return null;
  }

  const normalizedAnnotated = fingerprint(normalizeForMatch(candidate.annotatedText));
  const tokenFingerprint = fingerprint(joinTokenComments(candidate.tokenComments));

  const recordMatches = (record: CriticSidecarRecord): boolean => {
    if (record.anchorType !== candidate.anchorType) {
      return false;
    }
    if (record.tokenBlockFingerprint !== tokenFingerprint) {
      return false;
    }
    if (candidate.anchorType === "range" && record.annotatedTextFingerprint !== normalizedAnnotated) {
      return false;
    }
    return true;
  };

  for (let index = 0; index < matcher.records.length; index += 1) {
    if (matcher.usedRecordIndexes.has(index)) {
      continue;
    }
    const record = matcher.records[index];
    if (record.exportOrder === candidate.order && recordMatches(record)) {
      return { recordIndex: index, record };
    }
  }

  for (let index = 0; index < matcher.records.length; index += 1) {
    if (matcher.usedRecordIndexes.has(index)) {
      continue;
    }
    const record = matcher.records[index];
    if (recordMatches(record)) {
      return { recordIndex: index, record };
    }
  }

  return null;
}

function claimSidecarMatch(
  matcher: { records: CriticSidecarRecord[]; usedRecordIndexes: Set<number> },
  candidate: ThreadCandidate
): SidecarMatch | null {
  const match = findSidecarMatch(matcher, candidate);
  if (match) {
    matcher.usedRecordIndexes.add(match.recordIndex);
  }
  return match;
}

function encodeCriticHighlight(text: string): string {
  return `{==${encodeCriticTokenText(text)}==}`;
}

function encodeCriticCommentToken(text: string): string {
  return `{>>${encodeCriticTokenText(text)}<<}`;
}

function encodeCriticTokenText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/==}/g, "\\==}")
    .replace(/<<}/g, "\\<<}");
}

function decodeCriticTokenText(value: string): string {
  return value
    .replace(/\\<<}/g, "<<}")
    .replace(/\\==}/g, "==}")
    .replace(/\\\\/g, "\\");
}

function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function joinTokenComments(comments: string[]): string {
  return comments.map((value) => normalizeForMatch(value)).join("\u241E");
}

function fingerprint(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
