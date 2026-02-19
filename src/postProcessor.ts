import { MarkdownPostProcessor } from "obsidian";
import { parseComments } from "./commentParser";
import type CommentsPlugin from "./main";

interface TextNodeSpan {
  node: Text;
  start: number;
  end: number;
}

interface TextSnapshot {
  text: string;
  spans: TextNodeSpan[];
}

export function createReadingModePostProcessor(plugin: CommentsPlugin): MarkdownPostProcessor {
  return (el, ctx) => {
    if (!plugin.settings.showInReadingMode) {
      return;
    }

    const section = ctx.getSectionInfo(el);
    if (!section?.text) {
      return;
    }

    const comments = parseComments(section.text);
    if (comments.length === 0) {
      return;
    }

    let searchStart = 0;
    for (const parsed of comments) {
      const annotatedText = section.text.slice(parsed.annotatedFrom, parsed.annotatedTo);
      if (!annotatedText.trim()) {
        continue;
      }

      const snapshot = snapshotText(el);
      const matchIndex = snapshot.text.indexOf(annotatedText, searchStart);
      if (matchIndex < 0) {
        continue;
      }

      wrapTextRange(
        snapshot.spans,
        matchIndex,
        matchIndex + annotatedText.length,
        buildReadingHighlightClass(parsed.comment.resolved, parsed.comment.id === plugin.activeCommentId),
        parsed.comment.id,
        (commentId) => {
          plugin.selectCommentFromDocument(commentId);
        }
      );

      searchStart = matchIndex + annotatedText.length;
    }
  };
}

function buildReadingHighlightClass(isResolved: boolean, isActive: boolean): string {
  return [
    "marginalia-highlight",
    isResolved ? "marginalia-highlight-resolved" : "",
    isActive ? "marginalia-highlight-active" : ""
  ]
    .filter((value) => value.length > 0)
    .join(" ");
}

function snapshotText(root: HTMLElement): TextSnapshot {
  const spans: TextNodeSpan[] = [];
  let fullText = "";

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current !== null) {
    const textNode = current as Text;
    if (textNode.nodeValue && textNode.nodeValue.length > 0) {
      const start = fullText.length;
      fullText += textNode.nodeValue;
      spans.push({
        node: textNode,
        start,
        end: fullText.length
      });
    }
    current = walker.nextNode();
  }

  return { text: fullText, spans };
}

function wrapTextRange(
  spans: TextNodeSpan[],
  from: number,
  to: number,
  className: string,
  commentId: string,
  onCommentSelect: (commentId: string) => void
): void {
  for (const span of spans) {
    if (span.end <= from || span.start >= to) {
      continue;
    }

    if (!span.node.parentNode) {
      continue;
    }

    let target = span.node;
    const localStart = Math.max(0, from - span.start);
    const localEnd = Math.min(span.node.data.length, to - span.start);
    const selectedLength = localEnd - localStart;
    if (selectedLength <= 0) {
      continue;
    }

    if (localStart > 0) {
      target = target.splitText(localStart);
    }
    if (selectedLength < target.data.length) {
      target.splitText(selectedLength);
    }

    const parent = target.parentNode;
    if (!parent) {
      continue;
    }

    const wrapper = document.createElement("span");
    wrapper.className = className;
    wrapper.setAttribute("data-marginalia-id", commentId);
    wrapper.addEventListener("click", (event) => {
      event.stopPropagation();
      onCommentSelect(commentId);
    });
    parent.replaceChild(wrapper, target);
    wrapper.appendChild(target);
  }
}
