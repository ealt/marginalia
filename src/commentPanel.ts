import { ItemView, WorkspaceLeaf } from "obsidian";
import { parseCommentsWithDiagnostics } from "./commentParser";
import type CommentsPlugin from "./main";

export const COMMENT_PANEL_VIEW_TYPE = "marginalia-panel";

export class CommentPanelView extends ItemView {
  private readonly plugin: CommentsPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: CommentsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return COMMENT_PANEL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Comments";
  }

  getIcon(): string {
    return "message-square";
  }

  async onOpen(): Promise<void> {
    this.redraw();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  redraw(): void {
    this.contentEl.empty();
    const root = this.contentEl.createDiv({ cls: "marginalia-panel-root" });
    root.createEl("h3", { cls: "marginalia-panel-header", text: "Comments" });

    const activeView = this.plugin.getActiveMarkdownView();
    if (!activeView || !activeView.file) {
      root.createDiv({ cls: "marginalia-panel-empty", text: "Open a markdown note to view comments." });
      return;
    }

    const docText = activeView.editor.getValue();
    const { comments, invalidPairs } = parseCommentsWithDiagnostics(docText);

    root.createDiv({ cls: "marginalia-panel-meta", text: activeView.file.path });
    if (invalidPairs > 0) {
      root.createDiv({
        cls: "marginalia-panel-meta",
        text: `${invalidPairs} malformed comment pair(s) were ignored.`
      });
    }

    if (comments.length === 0) {
      root.createDiv({ cls: "marginalia-panel-empty", text: "No comments in this note." });
      return;
    }

    for (const parsed of comments) {
      const card = root.createDiv({ cls: "marginalia-card" });
      card.dataset.commentId = parsed.comment.id;
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      if (parsed.comment.resolved) {
        card.classList.add("is-resolved");
      }
      if (this.plugin.activeCommentId === parsed.comment.id) {
        card.classList.add("is-selected");
      }
      card.addEventListener("click", () => this.plugin.jumpToComment(parsed.comment.id));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.plugin.jumpToComment(parsed.comment.id);
        }
      });

      const annotatedText = docText
        .slice(parsed.annotatedFrom, parsed.annotatedTo)
        .replace(/\s+/g, " ")
        .trim();
      const previewText = annotatedText.length > 140 ? `${annotatedText.slice(0, 137)}...` : annotatedText;
      card.createDiv({
        cls: "marginalia-card-quote",
        text: previewText || "(empty annotated range)"
      });

      card.createDiv({ cls: "marginalia-card-text", text: parsed.comment.text });
      const createdAt = new Date(parsed.comment.ts * 1000).toLocaleString();
      card.createDiv({
        cls: "marginalia-card-meta",
        text: `${parsed.comment.author || "Unknown"} • ${createdAt}`
      });

      const actions = card.createDiv({ cls: "marginalia-card-actions" });
      const canModify = this.plugin.canCurrentUserEditOrDelete(parsed.comment.author);

      if (canModify) {
        const editButton = actions.createEl("button", { text: "Edit" });
        editButton.addEventListener("click", (event) => {
          event.stopPropagation();
          void this.plugin.editComment(parsed.comment.id);
        });
      }

      const resolveButton = actions.createEl("button", { text: parsed.comment.resolved ? "Unresolve" : "Resolve" });
      resolveButton.addEventListener("click", (event) => {
        event.stopPropagation();
        this.plugin.resolveComment(parsed.comment.id);
      });

      if (canModify) {
        const deleteButton = actions.createEl("button", { text: "Delete" });
        deleteButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.plugin.deleteComment(parsed.comment.id);
        });
      }
    }

    const selectedCard = root.querySelector<HTMLElement>(".marginalia-card.is-selected");
    selectedCard?.scrollIntoView({ block: "nearest" });
  }
}
