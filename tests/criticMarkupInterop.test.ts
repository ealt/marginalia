import { describe, expect, it } from "vitest";
import { buildCommentMarkers, parseComments } from "../src/commentParser";
import {
  exportMarginaliaToCritic,
  importCriticToMarginalia,
  parseCriticSidecar
} from "../src/criticMarkupInterop";
import { Comment } from "../src/types";

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    v: 1,
    id: "a1b2c3d4",
    text: "Parent",
    author: "Eric",
    ts: 1708300000,
    resolved: false,
    children: [],
    ...overrides
  };
}

describe("criticMarkupInterop", () => {
  it("exports parent+children as CriticMarkup tokens and records sidecar mapping", () => {
    const ranged = makeComment({
      id: "thread001",
      text: "Parent note",
      children: [
        { id: "child001", text: "First child", author: "Riley", ts: 1708300001 },
        { id: "child002", text: "Second child", author: "Sam", ts: 1708300002 }
      ]
    });
    const point = makeComment({
      id: "thread002",
      text: "Point parent",
      children: [{ id: "child003", text: "Point child", author: "Jo", ts: 1708300003 }]
    });

    const rangedMarkers = buildCommentMarkers(ranged);
    const pointMarkers = buildCommentMarkers(point);
    const doc =
      `A ${rangedMarkers.startMarker}annotated text${rangedMarkers.endMarker} B `
      + `${pointMarkers.startMarker}${pointMarkers.endMarker} C`;

    const result = exportMarginaliaToCritic(doc);

    expect(result.text).toContain("{==annotated text==}{>>Parent note<<}{>>First child<<}{>>Second child<<}");
    expect(result.text).toContain("{>>Point parent<<}{>>Point child<<}");
    expect(result.sidecar.records).toHaveLength(2);
    expect(result.sidecar.records[0].anchorType).toBe("range");
    expect(result.sidecar.records[1].anchorType).toBe("point");
    expect(result.sidecar.records[1].tokenComments).toEqual(["Point parent", "Point child"]);
  });

  it("round-trips range comments with sidecar metadata", () => {
    const comment = makeComment({
      id: "thread010",
      text: "Parent",
      author: "Alex",
      ts: 1708301111,
      resolved: true,
      children: [
        { id: "child010", text: "Child one", author: "Riley", ts: 1708302222 }
      ]
    });

    const markers = buildCommentMarkers(comment);
    const sourceDoc = `Before ${markers.startMarker}annotated${markers.endMarker} after`;

    const exported = exportMarginaliaToCritic(sourceDoc);
    const imported = importCriticToMarginalia(exported.text, exported.sidecar);
    const parsed = parseComments(imported.text);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].comment.id).toBe("thread010");
    expect(parsed[0].comment.author).toBe("Alex");
    expect(parsed[0].comment.resolved).toBe(true);
    expect(parsed[0].comment.children).toHaveLength(1);
    expect(parsed[0].comment.children[0].id).toBe("child010");
    expect(parsed[0].comment.children[0].author).toBe("Riley");
  });

  it("imports standalone CriticMarkup comments as zero-length Marginalia anchors", () => {
    const source = "Before {>>Loose comment<<} after";
    const imported = importCriticToMarginalia(source, null);
    const parsed = parseComments(imported.text);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].comment.text).toBe("Loose comment");
    expect(parsed[0].annotatedFrom).toBe(parsed[0].annotatedTo);
    expect(imported.diagnostics.importedPointThreads).toBe(1);
  });

  it("restores grouped point threads with children when sidecar is provided", () => {
    const pointThread = makeComment({
      id: "thread020",
      text: "Point parent",
      author: "Dana",
      children: [
        { id: "child021", text: "Child A", author: "Pat", ts: 1708303333 },
        { id: "child022", text: "Child B", author: "Lee", ts: 1708304444 }
      ]
    });

    const pointMarkers = buildCommentMarkers(pointThread);
    const sourceDoc = `x ${pointMarkers.startMarker}${pointMarkers.endMarker} y`;

    const exported = exportMarginaliaToCritic(sourceDoc);
    expect(exported.text).toContain("{>>Point parent<<}{>>Child A<<}{>>Child B<<}");

    const imported = importCriticToMarginalia(exported.text, exported.sidecar);
    const parsed = parseComments(imported.text);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].comment.id).toBe("thread020");
    expect(parsed[0].comment.children.map((child) => child.id)).toEqual(["child021", "child022"]);
  });

  it("reports malformed CriticMarkup comment tokens", () => {
    const source = "before {>>broken token after";
    const imported = importCriticToMarginalia(source, null);

    expect(imported.diagnostics.malformedCriticTokens).toBe(1);
    expect(imported.text).toBe(source);
  });

  it("validates sidecar structure", () => {
    const invalid = parseCriticSidecar({ foo: "bar" });
    expect(invalid).toBeNull();
  });
});
