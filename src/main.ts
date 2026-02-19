import { Editor, MarkdownView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { buildCommentMarkers, generateCommentId, parseCommentsWithDiagnostics, serializeComment } from "./commentParser";
import { CommentModalOptions, promptForComment } from "./commentModal";
import { COMMENT_PANEL_VIEW_TYPE, CommentPanelView } from "./commentPanel";
import { createCommentsEditorExtension } from "./editorExtension";
import { createReadingModePostProcessor } from "./postProcessor";
import { CommentsSettingTab } from "./settings";
import { Comment, CommentsPluginSettings, DEFAULT_SETTINGS } from "./types";

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
      })
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
      this.toAlphaColor(this.settings.highlightColor, 0.35)
    );
    document.body.style.setProperty(
      "--marginalia-highlight-color-resolved",
      this.toAlphaColor(this.settings.resolvedHighlightColor, 0.22)
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

    const id = this.generateUniqueCommentId(editor.getValue());
    const comment: Comment = {
      v: 1,
      id,
      text: commentText,
      author: this.settings.authorName || "Unknown",
      ts: Math.floor(Date.now() / 1000),
      resolved: false
    };

    const markers = buildCommentMarkers(comment);
    editor.replaceSelection(`${markers.startMarker}${selection}${markers.endMarker}`);
    this.activeCommentId = id;
    this.refreshPanel();
  }

  async editComment(commentId: string): Promise<void> {
    const target = this.findCommentInActiveEditor(commentId);
    if (!target) {
      return;
    }

    this.noticeInvalidPairs(target.invalidPairs);

    const updatedText = await this.askForComment({
      title: "Edit comment",
      initialValue: target.match.comment.text,
      submitLabel: "Save"
    });
    if (!updatedText) {
      return;
    }

    const updatedComment: Comment = {
      ...target.match.comment,
      text: updatedText
    };
    this.replaceOffsets(target.editor, target.match.endMarkerFrom, target.match.endMarkerTo, serializeComment(updatedComment));
    this.activeCommentId = commentId;
    this.refreshPanel();
  }

  resolveComment(commentId: string): void {
    const target = this.findCommentInActiveEditor(commentId);
    if (!target) {
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

    this.noticeInvalidPairs(target.invalidPairs);

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

    const from = target.editor.offsetToPos(target.match.annotatedFrom);
    const to = target.editor.offsetToPos(target.match.annotatedTo);

    if (target.match.annotatedFrom < target.match.annotatedTo) {
      target.editor.setSelection(from, to);
    } else {
      target.editor.setCursor(from);
    }
    target.editor.scrollIntoView({ from, to }, true);
    this.activeCommentId = commentId;
    this.refreshPanel();
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
    const existingIds = new Set(parseCommentsWithDiagnostics(docText).comments.map((item) => item.comment.id));
    let id = generateCommentId();
    while (existingIds.has(id)) {
      id = generateCommentId();
    }
    return id;
  }

  private findCommentInActiveEditor(commentId: string): {
    editor: Editor;
    match: ReturnType<typeof parseCommentsWithDiagnostics>["comments"][number];
    invalidPairs: number;
  } | null {
    const activeView = this.getActiveMarkdownView();
    if (!activeView) {
      new Notice("Open a markdown editor first.");
      return null;
    }

    const editor = activeView.editor;
    const parsed = parseCommentsWithDiagnostics(editor.getValue());
    const match = parsed.comments.find((entry) => entry.comment.id === commentId);
    if (!match) {
      new Notice("Comment not found in active note.");
      if (parsed.invalidPairs > 0) {
        this.noticeInvalidPairs(parsed.invalidPairs);
      }
      return null;
    }

    return { editor, match, invalidPairs: parsed.invalidPairs };
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
}
