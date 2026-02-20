import { Comment, CommentChild, CommentWithPosition, ParseCommentsResult } from "./types";

const COMMENT_PAIR_REGEX =
  /(<!--\s*marginalia-start:\s*([a-zA-Z0-9_-]+)\s*-->)([\s\S]*?)(<!--\s*marginalia:\s*([\s\S]*?)\s*-->)/g;
const COMMENT_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const RANDOM_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function parseComments(docText: string): CommentWithPosition[] {
  return parseCommentsWithDiagnostics(docText).comments;
}

export function parseCommentsWithDiagnostics(docText: string): ParseCommentsResult {
  const comments: CommentWithPosition[] = [];
  let invalidPairs = 0;

  COMMENT_PAIR_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COMMENT_PAIR_REGEX.exec(docText)) !== null) {
    const fullStartMarker = match[1];
    const startId = match[2];
    const annotatedText = match[3];
    const fullEndMarker = match[4];
    const rawJsonPayload = match[5];

    const parsed = parseAndValidatePayload(rawJsonPayload, startId);
    if (parsed === null) {
      invalidPairs += 1;
      continue;
    }

    const startMarkerFrom = match.index;
    const startMarkerTo = startMarkerFrom + fullStartMarker.length;
    const annotatedFrom = startMarkerTo;
    const annotatedTo = annotatedFrom + annotatedText.length;
    const endMarkerFrom = annotatedTo;
    const endMarkerTo = endMarkerFrom + fullEndMarker.length;

    comments.push({
      comment: parsed,
      startMarkerFrom,
      startMarkerTo,
      endMarkerFrom,
      endMarkerTo,
      annotatedFrom,
      annotatedTo
    });
  }

  comments.sort((a, b) => a.annotatedFrom - b.annotatedFrom);
  return { comments, invalidPairs };
}

export function validateParsedComment(parsed: unknown, startId: string): Comment | null {
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;
  if (candidate.v !== 1) {
    return null;
  }

  if (typeof candidate.id !== "string" || candidate.id !== startId || !COMMENT_ID_REGEX.test(candidate.id)) {
    return null;
  }

  if (typeof candidate.text !== "string") {
    return null;
  }

  if (typeof candidate.author !== "string") {
    return null;
  }

  if (typeof candidate.ts !== "number" || !Number.isFinite(candidate.ts)) {
    return null;
  }

  if (typeof candidate.resolved !== "boolean") {
    return null;
  }

  const children = parseCommentChildren(candidate.children);
  if (children === null) {
    return null;
  }

  return {
    v: 1,
    id: candidate.id,
    text: candidate.text,
    author: candidate.author,
    ts: Math.floor(candidate.ts),
    resolved: candidate.resolved,
    children
  };
}

export function serializeComment(comment: Comment): string {
  const payload = JSON.stringify(comment).replace(/-->/g, "--\\u003e");
  return `<!-- marginalia: ${payload} -->`;
}

export function buildStartMarker(id: string): string {
  return `<!-- marginalia-start: ${id} -->`;
}

export function buildCommentMarkers(comment: Comment): { startMarker: string; endMarker: string } {
  return {
    startMarker: buildStartMarker(comment.id),
    endMarker: serializeComment(comment)
  };
}

export function generateCommentId(): string {
  const output: string[] = [];
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      output.push(RANDOM_CHARS[byte % RANDOM_CHARS.length]);
    }
    return output.join("");
  }

  for (let i = 0; i < 8; i += 1) {
    output.push(RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)]);
  }
  return output.join("");
}

function parseAndValidatePayload(rawPayload: string, startId: string): Comment | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    return null;
  }
  return validateParsedComment(parsed, startId);
}

function parseCommentChildren(input: unknown): CommentChild[] | null {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input)) {
    return null;
  }

  const children: CommentChild[] = [];
  for (const item of input) {
    if (typeof item !== "object" || item === null) {
      return null;
    }
    const child = item as Record<string, unknown>;
    if (typeof child.id !== "string" || !COMMENT_ID_REGEX.test(child.id)) {
      return null;
    }
    if (typeof child.text !== "string") {
      return null;
    }
    if (typeof child.author !== "string") {
      return null;
    }
    if (typeof child.ts !== "number" || !Number.isFinite(child.ts)) {
      return null;
    }

    children.push({
      id: child.id,
      text: child.text,
      author: child.author,
      ts: Math.floor(child.ts)
    });
  }

  return children;
}
