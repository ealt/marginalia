import { Editor, MarkdownView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { buildCommentMarkers, generateCommentId, parseCommentsWithDiagnostics, serializeComment } from "./commentParser";
import { CommentModalOptions, promptForComment } from "./commentModal";
import { COMMENT_PANEL_VIEW_TYPE, CommentPanelView } from "./commentPanel";
import { createCommentsEditorExtension } from "./editorExtension";
import { createReadingModePostProcessor } from "./postProcessor";
import { CommentsSettingTab } from "./settings";
import { Comment, CommentChild, CommentsPluginSettings, DEFAULT_SETTINGS } from "./types";

export default class CommentsPlugin extends Plugin {
  settings: CommentsPluginSettings = DEFAULT_SETTINGS;
  activeCommentId: string | null = null;
  private lastMarkdownLeaf: WorkspaceLeaf | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.updateHighlightStyles();

    this.registerView(
      COMMENT_PANEL_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new CommentPanelView(leaf, this)
    );

    this.registerEditorExtension(
      createCommentsEditorExtension((commentId) => {
        void this.handleIconClick(commentId);
      }, (commentId) => {
        this.selectCommentFromDocument(commentId);
      }, () => this.activeCommentId)
    );
    this.registerMarkdownPostProcessor(createReadingModePostProcessor(this));

    this.addCommand({
      id: "add-comment",
      name: "Add comment",
      editorCallback: (editor) => {
        void this.addComment(editor);
      }
    });

    this.addCommand({
      id: "toggle-comments-panel",
      name: "Toggle comments panel",
      callback: () => {
        void this.togglePanel();
      }
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        menu.addItem((item) => {
          item
            .setTitle("Add comment")
            .setIcon("message-square-plus")
            .onClick(() => {
              void this.addComment(editor);
            });
        });
      })
    );

    this.addRibbonIcon("message-square", "Toggle comments panel", () => {
      void this.togglePanel();
    });

    this.lastMarkdownLeaf = this.resolveMarkdownLeaf();

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.rememberMarkdownLeaf(leaf);
        this.refreshPanel();
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.rememberMarkdownLeaf(this.app.workspace.activeLeaf);
        this.refreshPanel();
      })
    );

    this.addSettingTab(new CommentsSettingTab(this.app, this));
  }


  getActiveMarkdownView(): MarkdownView | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.file) {
      this.rememberMarkdownLeaf(this.app.workspace.activeLeaf);
      return activeView;
    }

    const rememberedView = this.lastMarkdownLeaf?.view;
    if (rememberedView instanceof MarkdownView && rememberedView.file) {
      return rememberedView;
    }

    const fallbackLeaf = this.resolveMarkdownLeaf();
    if (fallbackLeaf?.view instanceof MarkdownView) {
      this.lastMarkdownLeaf = fallbackLeaf;
      return fallbackLeaf.view;
    }

    return null;
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.updateHighlightStyles();
    this.refreshPanel();
  }

  updateHighlightStyles(): void {
    document.body.style.setProperty(
      "--marginalia-highlight-color",
      this.toAlphaColor(this.settings.highlightColor, 0.18)
    );
    document.body.style.setProperty(
      "--marginalia-highlight-color-resolved",
      this.toAlphaColor(this.settings.resolvedHighlightColor, 0.12)
    );
    document.body.style.setProperty(
      "--marginalia-highlight-color-active",
      this.toAlphaColor(this.settings.highlightColor, 0.42)
    );
    document.body.style.setProperty(
      "--marginalia-highlight-color-resolved-active",
      this.toAlphaColor(this.settings.resolvedHighlightColor, 0.28)
    );
  }

  async addComment(editor: Editor): Promise<void> {
    const selection = editor.getSelection();
    if (!selection) {
      new Notice("Select text before adding a comment.");
      return;
    }

    const commentText = await this.askForComment({
      title: "Add comment",
      submitLabel: "Add"
    });
    if (!commentText) {
      return;
    }

    const comment = this.buildNewComment(commentText, editor.getValue());

    const markers = buildCommentMarkers(comment);
    this.activeCommentId = comment.id;
    editor.replaceSelection(`${markers.startMarker}${selection}${markers.endMarker}`);
    this.refreshPanel();
  }

  async replyToComment(parentCommentId: string): Promise<void> {
    const target = this.findCommentInActiveEditor(parentCommentId);
    if (!target) {
      return;
    }
    if (target.child) {
      new Notice("Replies can only be added to top-level comments.");
      return;
    }

    const replyText = await this.askForComment({
      title: "Reply to comment",
      submitLabel: "Reply"
    });
    if (!replyText) {
      return;
    }

    const reply = this.buildNewCommentChild(replyText, target.editor.getValue());
    const updatedComment: Comment = {
      ...target.match.comment,
      children: [...target.match.comment.children, reply]
    };
    this.activeCommentId = reply.id;
    this.replaceOffsets(target.editor, target.match.endMarkerFrom, target.match.endMarkerTo, serializeComment(updatedComment));
    this.refreshPanel();
  }

  async editComment(commentId: string): Promise<void> {
    const target = this.findCommentInActiveEditor(commentId);
    if (!target) {
      return;
    }
    const author = target.child?.author ?? target.match.comment.author;
    if (!this.canCurrentUserEditOrDelete(author)) {
      new Notice("Only the comment author can edit this comment.");
      return;
    }

    this.noticeInvalidPairs(target.invalidPairs);

    const updatedText = await this.askForComment({
      title: "Edit comment",
      initialValue: target.child?.text ?? target.match.comment.text,
      submitLabel: "Save"
    });
    if (!updatedText) {
      return;
    }

    const updatedComment = target.child
      ? this.updateChildComment(target.match.comment, target.child.id, (child) => ({ ...child, text: updatedText }))
      : { ...target.match.comment, text: updatedText };
    this.replaceOffsets(target.editor, target.match.endMarkerFrom, target.match.endMarkerTo, serializeComment(updatedComment));
    this.activeCommentId = commentId;
    this.refreshPanel();
  }

  resolveComment(commentId: string): void {
    const target = this.findCommentInActiveEditor(commentId);
    if (!target) {
      return;
    }

    if (target.child) {
      new Notice("Replies cannot be resolved.");
      return;
    }

    this.noticeInvalidPairs(target.invalidPairs);

    const updatedComment: Comment = {
      ...target.match.comment,
      resolved: !target.match.comment.resolved
    };
    this.replaceOffsets(target.editor, target.match.endMarkerFrom, target.match.endMarkerTo, serializeComment(updatedComment));
    this.activeCommentId = commentId;
    this.refreshPanel();
  }

  deleteComment(commentId: string): void {
    const target = this.findCommentInActiveEditor(commentId);
    if (!target) {
      return;
    }
    const author = target.child?.author ?? target.match.comment.author;
    if (!this.canCurrentUserEditOrDelete(author)) {
      new Notice("Only the comment author can delete this comment.");
      return;
    }

    this.noticeInvalidPairs(target.invalidPairs);

    if (target.child) {
      const updatedComment: Comment = {
        ...target.match.comment,
        children: target.match.comment.children.filter((child) => child.id !== target.child!.id)
      };
      this.replaceOffsets(target.editor, target.match.endMarkerFrom, target.match.endMarkerTo, serializeComment(updatedComment));
      if (this.activeCommentId === commentId) {
        this.activeCommentId = target.match.comment.id;
      }
      this.refreshPanel();
      return;
    }

    // Remove in reverse order so earlier offsets remain valid.
    this.replaceOffsets(target.editor, target.match.endMarkerFrom, target.match.endMarkerTo, "");
    this.replaceOffsets(target.editor, target.match.startMarkerFrom, target.match.startMarkerTo, "");
    if (this.activeCommentId === commentId) {
      this.activeCommentId = null;
    }
    this.refreshPanel();
  }

  jumpToComment(commentId: string): void {
    const target = this.findCommentInActiveEditor(commentId);
    if (!target) {
      return;
    }
    this.activeCommentId = commentId;
    if (this.jumpToCommentInReadingMode(target.match.comment.id)) {
      this.refreshPanel();
      return;
    }

    const from = target.editor.offsetToPos(target.match.annotatedFrom);
    const to = target.editor.offsetToPos(target.match.annotatedTo);

    if (target.match.annotatedFrom < target.match.annotatedTo) {
      target.editor.setSelection(from, to);
    } else {
      target.editor.setCursor(from);
    }
    target.editor.scrollIntoView({ from, to }, true);
    this.refreshPanel();
  }

  selectCommentFromDocument(commentId: string): void {
    this.activeCommentId = commentId;
    void this.togglePanel(true).then(() => {
      this.refreshPanel();
    });
  }

  async togglePanel(forceOpen = false): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(COMMENT_PANEL_VIEW_TYPE);
    if (leaves.length > 0 && !forceOpen) {
      for (const leaf of leaves) {
        leaf.detach();
      }
      return;
    }

    const leaf = leaves[0] ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("Unable to open comments panel.");
      return;
    }

    if (leaves.length === 0) {
      await leaf.setViewState({ type: COMMENT_PANEL_VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
    this.refreshPanel();
  }

  refreshPanel(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(COMMENT_PANEL_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof CommentPanelView) {
        view.redraw();
      }
    }
    this.updateReadingModeActiveHighlight();
  }

  private async handleIconClick(commentId: string): Promise<void> {
    this.activeCommentId = commentId;
    await this.togglePanel(true);
    this.jumpToComment(commentId);
  }

  private askForComment(options: CommentModalOptions): Promise<string | null> {
    return promptForComment(this.app, options);
  }

  private replaceOffsets(editor: Editor, fromOffset: number, toOffset: number, replacement: string): void {
    const from = editor.offsetToPos(fromOffset);
    const to = editor.offsetToPos(toOffset);
    editor.replaceRange(replacement, from, to);
  }

  private generateUniqueCommentId(docText: string): string {
    const existingIds = new Set<string>();
    for (const item of parseCommentsWithDiagnostics(docText).comments) {
      existingIds.add(item.comment.id);
      for (const child of item.comment.children) {
        existingIds.add(child.id);
      }
    }
    let id = generateCommentId();
    while (existingIds.has(id)) {
      id = generateCommentId();
    }
    return id;
  }

  private buildNewComment(text: string, docText: string): Comment {
    const comment: Comment = {
      v: 1,
      id: this.generateUniqueCommentId(docText),
      text,
      author: this.resolveCommentAuthor(),
      ts: Math.floor(Date.now() / 1000),
      resolved: false,
      children: []
    };
    return comment;
  }

  private buildNewCommentChild(text: string, docText: string): CommentChild {
    return {
      id: this.generateUniqueCommentId(docText),
      text,
      author: this.resolveCommentAuthor(),
      ts: Math.floor(Date.now() / 1000)
    };
  }

  private updateChildComment(comment: Comment, childId: string, updater: (child: CommentChild) => CommentChild): Comment {
    return {
      ...comment,
      children: comment.children.map((child) => (child.id === childId ? updater(child) : child))
    };
  }

  private findCommentInActiveEditor(commentId: string): {
    editor: Editor;
    match: ReturnType<typeof parseCommentsWithDiagnostics>["comments"][number];
    child: CommentChild | null;
    invalidPairs: number;
  } | null {
    const activeView = this.getActiveMarkdownView();
    if (!activeView) {
      new Notice("Open a markdown editor first.");
      return null;
    }

    const editor = activeView.editor;
    const parsed = parseCommentsWithDiagnostics(editor.getValue());
    const target = this.findCommentTargetInParsed(parsed.comments, commentId);
    const match = target?.match ?? null;
    if (!match) {
      new Notice("Comment not found in active note.");
      if (parsed.invalidPairs > 0) {
        this.noticeInvalidPairs(parsed.invalidPairs);
      }
      return null;
    }

    return {
      editor,
      match,
      child: target?.child ?? null,
      invalidPairs: parsed.invalidPairs
    };
  }

  private noticeInvalidPairs(invalidPairs: number): void {
    if (invalidPairs > 0) {
      new Notice(`${invalidPairs} malformed comment pair(s) were ignored.`);
    }
  }

  private toAlphaColor(input: string, alpha: number): string {
    const hex = input.trim();
    const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(hex);
    if (shortMatch) {
      const [r, g, b] = shortMatch[1].split("").map((char) => parseInt(`${char}${char}`, 16));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    const longMatch = /^#([0-9a-fA-F]{6})$/.exec(hex);
    if (longMatch) {
      const value = longMatch[1];
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return input;
  }

  private rememberMarkdownLeaf(leaf: WorkspaceLeaf | null): void {
    if (leaf?.view instanceof MarkdownView && leaf.view.file) {
      this.lastMarkdownLeaf = leaf;
    }
  }

  private resolveMarkdownLeaf(): WorkspaceLeaf | null {
    const activeFile = this.app.workspace.getActiveFile();
    const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");

    if (activeFile) {
      for (const leaf of markdownLeaves) {
        if (leaf.view instanceof MarkdownView && leaf.view.file?.path === activeFile.path) {
          return leaf;
        }
      }
    }

    for (const leaf of markdownLeaves) {
      if (leaf.view instanceof MarkdownView && leaf.view.file) {
        return leaf;
      }
    }

    return null;
  }

  private resolveCommentAuthor(): string {
    const configuredAuthor = this.settings.authorName.trim();
    if (configuredAuthor.length > 0) {
      return configuredAuthor;
    }

    const gitUserName = this.getGitUserName();
    if (gitUserName) {
      return gitUserName;
    }

    return "Unknown";
  }

  canCurrentUserEditOrDelete(commentAuthor: string): boolean {
    return this.normalizeAuthorIdentity(this.resolveCommentAuthor()) === this.normalizeAuthorIdentity(commentAuthor);
  }

  private getGitUserName(): string | null {
    const requireFn = (globalThis as { require?: (id: string) => unknown }).require;
    if (!requireFn) {
      return null;
    }

    const cwd = this.getVaultBasePath();
    const childProcess = requireFn("child_process") as {
      execFileSync?: (file: string, args: string[], options?: { cwd?: string; encoding: "utf8" }) => string;
    };
    if (typeof childProcess.execFileSync !== "function") {
      return null;
    }
    const execFileSync = childProcess.execFileSync;

    const runGitConfig = (args: string[]): string | null => {
      try {
        return execFileSync("git", ["config", ...args], {
          cwd,
          encoding: "utf8"
        }).trim();
      } catch {
        return null;
      }
    };

    const localOrGlobal = runGitConfig(["--get", "user.name"]);
    if (localOrGlobal && localOrGlobal.length > 0) {
      return localOrGlobal;
    }

    const globalName = runGitConfig(["--global", "--get", "user.name"]);
    return globalName && globalName.length > 0 ? globalName : null;
  }

  private getVaultBasePath(): string | undefined {
    const adapter = this.app.vault.adapter as { getBasePath?: () => string };
    const basePath = adapter.getBasePath?.();
    return typeof basePath === "string" && basePath.length > 0 ? basePath : undefined;
  }

  private normalizeAuthorIdentity(author: string): string {
    const normalized = author.trim();
    return normalized.length > 0 ? normalized.toLowerCase() : "unknown";
  }

  private findCommentTargetInParsed(
    parsedComments: ReturnType<typeof parseCommentsWithDiagnostics>["comments"],
    commentId: string
  ): {
    match: ReturnType<typeof parseCommentsWithDiagnostics>["comments"][number];
    child: CommentChild | null;
  } | null {
    for (const entry of parsedComments) {
      if (entry.comment.id === commentId) {
        return { match: entry, child: null };
      }

      const child = entry.comment.children.find((item) => item.id === commentId) ?? null;
      if (child) {
        return { match: entry, child };
      }
    }

    return null;
  }

  private jumpToCommentInReadingMode(commentId: string): boolean {
    const activeView = this.getActiveMarkdownView();
    if (!activeView || activeView.getMode() !== "preview") {
      return false;
    }

    const findHighlightedComment = (): HTMLElement | null => {
      return activeView.previewMode.containerEl.querySelector<HTMLElement>(
        `.marginalia-highlight[data-marginalia-id="${commentId}"]`
      );
    };

    let highlightEl = findHighlightedComment();
    if (!highlightEl) {
      activeView.previewMode.rerender();
      highlightEl = findHighlightedComment();
    }
    if (!highlightEl) {
      return false;
    }

    highlightEl.scrollIntoView({ block: "center" });
    return true;
  }

  private updateReadingModeActiveHighlight(): void {
    const activeView = this.getActiveMarkdownView();
    if (!activeView || activeView.getMode() !== "preview") {
      return;
    }

    const parsed = parseCommentsWithDiagnostics(activeView.editor.getValue()).comments;
    const activeThreadId = this.activeCommentId
      ? (this.findCommentTargetInParsed(parsed, this.activeCommentId)?.match.comment.id ?? null)
      : null;

    const highlightEls = activeView.previewMode.containerEl.querySelectorAll<HTMLElement>(
      ".marginalia-highlight[data-marginalia-id]"
    );
    highlightEls.forEach((highlightEl) => {
      const isActive = activeThreadId !== null && highlightEl.dataset.marginaliaId === activeThreadId;
      highlightEl.classList.toggle("marginalia-highlight-active", isActive);
    });
  }
}
