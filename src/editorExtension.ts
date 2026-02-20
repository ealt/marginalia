import { Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { parseComments } from "./commentParser";
import { Comment } from "./types";

export const COMMENT_ICON_CLICK_EVENT = "marginalia-icon-click";

interface CommentIconClickDetail {
  commentId: string;
}

class CommentIconWidget extends WidgetType {
  private readonly comment: Comment;
  private readonly isActive: boolean;

  constructor(comment: Comment, isActive: boolean) {
    super();
    this.comment = comment;
    this.isActive = isActive;
  }

  eq(other: CommentIconWidget): boolean {
    return other.comment.id === this.comment.id
      && other.comment.resolved === this.comment.resolved
      && other.isActive === this.isActive;
  }

  toDOM(view: EditorView): HTMLElement {
    const iconEl = document.createElement("span");
    iconEl.className = "marginalia-icon";
    if (this.comment.resolved) {
      iconEl.classList.add("is-resolved");
    }
    if (this.isActive) {
      iconEl.classList.add("is-active");
    }
    iconEl.textContent = "C";
    iconEl.title = this.isActive ? "Comment (selected)" : this.comment.resolved ? "Comment (resolved)" : "Comment";
    iconEl.setAttribute("role", "button");
    iconEl.setAttribute("aria-label", `Comment ${this.comment.id}`);
    iconEl.setAttribute("contenteditable", "false");

    iconEl.addEventListener("mousedown", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
    });
    iconEl.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      view.dom.dispatchEvent(
        new CustomEvent<CommentIconClickDetail>(COMMENT_ICON_CLICK_EVENT, {
          bubbles: true,
          detail: { commentId: this.comment.id }
        })
      );
    });

    return iconEl;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildDecorations(docText: string, activeCommentId: string | null): DecorationSet {
  const comments = parseComments(docText);
  const builder = new RangeSetBuilder<Decoration>();

  for (const parsed of comments) {
    const isActive = parsed.comment.id === activeCommentId
      || parsed.comment.children.some((child) => child.id === activeCommentId);
    builder.add(parsed.startMarkerFrom, parsed.startMarkerTo, Decoration.replace({}));

    if (parsed.annotatedFrom < parsed.annotatedTo) {
      const className = [
        "marginalia-highlight",
        parsed.comment.resolved ? "marginalia-highlight-resolved" : "",
        isActive ? "marginalia-highlight-active" : ""
      ]
        .filter((value) => value.length > 0)
        .join(" ");
      builder.add(
        parsed.annotatedFrom,
        parsed.annotatedTo,
        Decoration.mark({
          class: className,
          attributes: {
            "data-marginalia-id": parsed.comment.id
          }
        })
      );
    }

    builder.add(
      parsed.endMarkerFrom,
      parsed.endMarkerTo,
      Decoration.replace({
        widget: new CommentIconWidget(parsed.comment, isActive)
      })
    );
  }

  return builder.finish();
}

export function createCommentsEditorExtension(
  onIconClick: (commentId: string) => void,
  onHighlightClick: (commentId: string) => void,
  getActiveCommentId: () => string | null
): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private readonly view: EditorView;
      private readonly onIconClick: (event: Event) => void;
      private readonly onHighlightClick: (event: MouseEvent) => void;
      private activeCommentId: string | null;

      constructor(view: EditorView) {
        this.view = view;
        this.activeCommentId = getActiveCommentId();
        this.decorations = buildDecorations(view.state.doc.toString(), this.activeCommentId);
        this.onIconClick = (event: Event) => {
          const detail = (event as CustomEvent<CommentIconClickDetail>).detail;
          if (detail?.commentId) {
            onIconClick(detail.commentId);
          }
        };
        this.onHighlightClick = (event: MouseEvent) => {
          const rawTarget = event.target;
          const targetEl = rawTarget instanceof HTMLElement
            ? rawTarget
            : rawTarget instanceof Node
              ? rawTarget.parentElement
              : null;
          if (!targetEl) {
            return;
          }

          const highlightEl = targetEl.closest<HTMLElement>(".marginalia-highlight[data-marginalia-id]");
          const commentId = highlightEl?.dataset.marginaliaId;
          if (!commentId) {
            return;
          }

          onHighlightClick(commentId);
        };
        this.view.dom.addEventListener(COMMENT_ICON_CLICK_EVENT, this.onIconClick as EventListener);
        this.view.dom.addEventListener("click", this.onHighlightClick as EventListener);
      }

      update(update: ViewUpdate): void {
        const nextActiveCommentId = getActiveCommentId();
        if (update.docChanged || nextActiveCommentId !== this.activeCommentId) {
          this.activeCommentId = nextActiveCommentId;
          this.decorations = buildDecorations(update.state.doc.toString(), this.activeCommentId);
        }
      }

      destroy(): void {
        this.view.dom.removeEventListener(COMMENT_ICON_CLICK_EVENT, this.onIconClick as EventListener);
        this.view.dom.removeEventListener("click", this.onHighlightClick as EventListener);
      }
    },
    {
      decorations: (value) => value.decorations
    }
  );
}
