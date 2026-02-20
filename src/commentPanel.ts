import { ItemView, WorkspaceLeaf } from "obsidian";
import { parseCommentsWithDiagnostics } from "./commentParser";
import type CommentsPlugin from "./main";

export const COMMENT_PANEL_VIEW_TYPE = "marginalia-panel";
type ParsedCommentEntry = ReturnType<typeof parseCommentsWithDiagnostics>["comments"][number];

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

    const renderCommentCard = (
      container: HTMLElement,
      parsed: ParsedCommentEntry,
      commentId: string,
      author: string,
      text: string,
      ts: number,
      options: { isChild: boolean }
    ): void => {
      const card = container.createDiv({ cls: "marginalia-card" });
      card.dataset.commentId = commentId;
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      if (options.isChild) {
        card.classList.add("is-reply");
      }
      if (!options.isChild && parsed.comment.resolved) {
        card.classList.add("is-resolved");
      }
      if (this.plugin.activeCommentId === commentId) {
        card.classList.add("is-selected");
      }
      card.addEventListener("click", () => this.plugin.jumpToComment(commentId));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.plugin.jumpToComment(commentId);
        }
      });

      if (!options.isChild) {
        const annotatedText = docText
          .slice(parsed.annotatedFrom, parsed.annotatedTo)
          .replace(/\s+/g, " ")
          .trim();
        const previewText = annotatedText.length > 140 ? `${annotatedText.slice(0, 137)}...` : annotatedText;
        card.createDiv({
          cls: "marginalia-card-quote",
          text: previewText || "(empty annotated range)"
        });
      }

      card.createDiv({ cls: "marginalia-card-text", text });
      const createdAt = new Date(ts * 1000).toLocaleString();
      card.createDiv({
        cls: "marginalia-card-meta",
        text: `${author || "Unknown"} • ${createdAt}`
      });

      const actions = card.createDiv({ cls: "marginalia-card-actions" });
      const canModify = this.plugin.canCurrentUserEditOrDelete(author);

      if (!options.isChild) {
        const replyButton = actions.createEl("button", { text: "Reply" });
        replyButton.addEventListener("click", (event) => {
          event.stopPropagation();
          void this.plugin.replyToComment(parsed.comment.id);
        });
      }

      if (canModify) {
        const editButton = actions.createEl("button", { text: "Edit" });
        editButton.addEventListener("click", (event) => {
          event.stopPropagation();
          void this.plugin.editComment(commentId);
        });
      }

      if (!options.isChild) {
        const resolveButton = actions.createEl("button", { text: parsed.comment.resolved ? "Unresolve" : "Resolve" });
        resolveButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.plugin.resolveComment(parsed.comment.id);
        });
      }

      if (canModify) {
        const deleteButton = actions.createEl("button", { text: "Delete" });
        deleteButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.plugin.deleteComment(commentId);
        });
      }
    };

    for (const parsed of comments) {
      const thread = root.createDiv({ cls: "marginalia-thread" });
      const isExpanded = this.isThreadExpanded(parsed);
      if (isExpanded) {
        thread.classList.add("is-expanded");
      }

      renderCommentCard(
        thread,
        parsed,
        parsed.comment.id,
        parsed.comment.author,
        parsed.comment.text,
        parsed.comment.ts,
        { isChild: false }
      );

      if (!isExpanded && parsed.comment.children.length > 0) {
        thread.createDiv({
          cls: "marginalia-thread-collapsed-meta",
          text: `${parsed.comment.children.length} repl${parsed.comment.children.length === 1 ? "y" : "ies"}`
        });
      }

      if (isExpanded) {
        const children = [...parsed.comment.children].sort((a, b) => a.ts - b.ts);
        for (const child of children) {
          renderCommentCard(
            thread,
            parsed,
            child.id,
            child.author,
            child.text,
            child.ts,
            { isChild: true }
          );
        }
      }
    }

    const selectedCard = root.querySelector<HTMLElement>(".marginalia-card.is-selected");
    selectedCard?.scrollIntoView({ block: "nearest" });
  }

  private isThreadExpanded(parsed: ParsedCommentEntry): boolean {
    if (this.plugin.activeCommentId === parsed.comment.id) {
      return true;
    }
    if (!this.plugin.activeCommentId) {
      return false;
    }
    return parsed.comment.children.some((child) => child.id === this.plugin.activeCommentId);
  }
}
