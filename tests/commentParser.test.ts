import { describe, expect, it } from "vitest";
import {
  buildCommentMarkers,
  generateCommentId,
  parseComments,
  parseCommentsWithDiagnostics,
  serializeComment
} from "../src/commentParser";
import { Comment } from "../src/types";

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    v: 1,
    id: "a1b2c3d4",
    text: "Test comment",
    author: "Eric",
    ts: 1708300000,
    resolved: false,
    ...overrides
  };
}

describe("commentParser", () => {
  it("parses a valid comment pair and returns annotation offsets", () => {
    const comment = makeComment();
    const { startMarker, endMarker } = buildCommentMarkers(comment);
    const doc = `Before ${startMarker}annotated text${endMarker} after`;

    const parsed = parseComments(doc);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].comment).toEqual(comment);
    expect(doc.slice(parsed[0].annotatedFrom, parsed[0].annotatedTo)).toBe("annotated text");
  });

  it("escapes only literal '-->' during serialization and round-trips text", () => {
    const comment = makeComment({
      text: "Keep <- and -> readable, but protect --> terminator"
    });
    const serialized = serializeComment(comment);
    expect(serialized).toContain("--\\u003e");
    expect(serialized).toContain("->");

    const doc = `x ${buildCommentMarkers(comment).startMarker}y${serialized} z`;
    const parsed = parseComments(doc);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].comment.text).toBe(comment.text);
  });

  it("skips malformed payloads and reports diagnostics", () => {
    const valid = makeComment();
    const validMarkers = buildCommentMarkers(valid);
    const invalidId = "badbad01";
    const doc =
      `${validMarkers.startMarker}ok${validMarkers.endMarker}` +
      ` <!-- marginalia-start: ${invalidId} -->oops<!-- marginalia: {"v":1,"id":"${invalidId}","text":"broken" -->`;

    const result = parseCommentsWithDiagnostics(doc);
    expect(result.comments).toHaveLength(1);
    expect(result.invalidPairs).toBe(1);
    expect(result.comments[0].comment.id).toBe(valid.id);
  });

  it("rejects pairs where start marker id and payload id mismatch", () => {
    const payload = JSON.stringify(makeComment({ id: "payload01" }));
    const doc = `<!-- marginalia-start: start01 -->text<!-- marginalia: ${payload} -->`;

    const result = parseCommentsWithDiagnostics(doc);
    expect(result.comments).toHaveLength(0);
    expect(result.invalidPairs).toBe(1);
  });

  it("generates 8-character alphanumeric ids", () => {
    const id = generateCommentId();
    expect(id).toMatch(/^[a-zA-Z0-9]{8}$/);
  });
});
