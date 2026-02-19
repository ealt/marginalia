import { App, Modal, Notice } from "obsidian";

export interface CommentModalOptions {
  title: string;
  initialValue?: string;
  submitLabel: string;
}

class CommentModal extends Modal {
  private readonly options: CommentModalOptions;
  private readonly onSubmit: (value: string | null) => void;
  private settled = false;

  constructor(app: App, options: CommentModalOptions, onSubmit: (value: string | null) => void) {
    super(app);
    this.options = options;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h3", { text: this.options.title });

    const textarea = contentEl.createEl("textarea", { cls: "marginalia-modal-textarea" });
    textarea.value = this.options.initialValue ?? "";
    textarea.rows = 6;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const actions = contentEl.createDiv({ cls: "marginalia-modal-actions" });

    const cancelButton = actions.createEl("button", { text: "Cancel" });
    const submitButton = actions.createEl("button", { text: this.options.submitLabel });
    submitButton.classList.add("mod-cta");

    cancelButton.addEventListener("click", () => {
      this.finish(null);
      this.close();
    });

    submitButton.addEventListener("click", () => {
      const value = textarea.value.trim();
      if (!value) {
        new Notice("Comment text cannot be empty.");
        return;
      }
      this.finish(value);
      this.close();
    });

    textarea.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        submitButton.click();
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
    this.finish(null);
  }

  private finish(value: string | null): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.onSubmit(value);
  }
}

export function promptForComment(app: App, options: CommentModalOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new CommentModal(app, options, resolve);
    modal.open();
  });
}
