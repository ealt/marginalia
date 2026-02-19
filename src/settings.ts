import { App, PluginSettingTab, Setting } from "obsidian";
import type CommentsPlugin from "./main";

export class CommentsSettingTab extends PluginSettingTab {
  private readonly plugin: CommentsPlugin;

  constructor(app: App, plugin: CommentsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Author name")
      .setDesc("Default author label used when adding comments. Leave blank to use git user.name (fallback: Unknown).")
      .addText((text) => {
        text.setPlaceholder("Your name");
        text.setValue(this.plugin.settings.authorName);
        text.onChange(async (value) => {
          this.plugin.settings.authorName = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Highlight color")
      .setDesc("Background color for unresolved comment highlights.")
      .addColorPicker((picker) => {
        picker.setValue(this.normalizePickerColor(this.plugin.settings.highlightColor, "#f4d470"));
        picker.onChange(async (value) => {
          this.plugin.settings.highlightColor = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Resolved highlight color")
      .setDesc("Background color for resolved comment highlights.")
      .addColorPicker((picker) => {
        picker.setValue(this.normalizePickerColor(this.plugin.settings.resolvedHighlightColor, "#79828f"));
        picker.onChange(async (value) => {
          this.plugin.settings.resolvedHighlightColor = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Show in reading mode")
      .setDesc("Apply best-effort comment highlighting while in reading mode.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showInReadingMode);
        toggle.onChange(async (value) => {
          this.plugin.settings.showInReadingMode = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private normalizePickerColor(value: string, fallback: string): string {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim()) ? value : fallback;
  }
}
