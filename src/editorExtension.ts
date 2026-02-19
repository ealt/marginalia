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

  constructor(comment: Comment) {
    super();
    this.comment = comment;
  }

  eq(other: CommentIconWidget): boolean {
    return other.comment.id === this.comment.id && other.comment.resolved === this.comment.resolved;
  }

  toDOM(view: EditorView): HTMLElement {
    const iconEl = document.createElement("span");
    iconEl.className = "marginalia-icon";
    if (this.comment.resolved) {
      iconEl.classList.add("is-resolved");
    }
    iconEl.textContent = "C";
    iconEl.title = this.comment.resolved ? "Comment (resolved)" : "Comment";
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

function buildDecorations(docText: string): DecorationSet {
  const comments = parseComments(docText);
  const builder = new RangeSetBuilder<Decoration>();

  for (const parsed of comments) {
    builder.add(parsed.startMarkerFrom, parsed.startMarkerTo, Decoration.replace({}));

    if (parsed.annotatedFrom < parsed.annotatedTo) {
      const className = parsed.comment.resolved
        ? "marginalia-highlight marginalia-highlight-resolved"
        : "marginalia-highlight";
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
        widget: new CommentIconWidget(parsed.comment)
      })
    );
  }

  return builder.finish();
}

export function createCommentsEditorExtension(onIconClick: (commentId: string) => void): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private readonly view: EditorView;
      private readonly onIconClick: (event: Event) => void;

      constructor(view: EditorView) {
        this.view = view;
        this.decorations = buildDecorations(view.state.doc.toString());
        this.onIconClick = (event: Event) => {
          const detail = (event as CustomEvent<CommentIconClickDetail>).detail;
          if (detail?.commentId) {
            onIconClick(detail.commentId);
          }
        };
        this.view.dom.addEventListener(COMMENT_ICON_CLICK_EVENT, this.onIconClick as EventListener);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged) {
          this.decorations = buildDecorations(update.state.doc.toString());
        }
      }

      destroy(): void {
        this.view.dom.removeEventListener(COMMENT_ICON_CLICK_EVENT, this.onIconClick as EventListener);
      }
    },
    {
      decorations: (value) => value.decorations
    }
  );
}
