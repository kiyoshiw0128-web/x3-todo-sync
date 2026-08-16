const { Plugin, PluginSettingTab, Setting, Notice, requestUrl } = require("obsidian");

const DEFAULTS = {
  token: "",
  gistId: "",
  sourcePath: "01_ToDo/X3待受.md",
  maxTasks: 10,
};

class X3TodoSyncPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new X3TodoSettingTab(this.app, this));
    this.addCommand({
      id: "sync-now",
      name: "X3 ToDoを今すぐ同期",
      callback: () => this.syncNow(true),
    });
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file.path !== this.settings.sourcePath) return;
      clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(() => this.syncNow(false), 3000);
    }));
  }

  onunload() {
    clearTimeout(this.syncTimer);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  extractTasks(markdown) {
    const tasks = [];
    for (const line of markdown.split(/\r?\n/)) {
      const match = line.match(/^\s*[-*]\s+\[ \]\s+(.+?)\s*$/i);
      if (!match) continue;
      const cleaned = match[1]
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
        .replace(/[*_`~]/g, "")
        .trim();
      if (cleaned) tasks.push(cleaned.slice(0, 160));
      if (tasks.length >= this.settings.maxTasks) break;
    }
    return tasks;
  }

  async syncNow(showNotice) {
    if (!this.settings.gistId || !this.settings.token) {
      if (showNotice) new Notice("X3 ToDo Sync: 設定でGist IDとトークンを入力してください");
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(this.settings.sourcePath);
    if (!file) {
      if (showNotice) new Notice(`X3 ToDo Sync: ${this.settings.sourcePath} が見つかりません`);
      return;
    }
    try {
      const markdown = await this.app.vault.read(file);
      const tasks = this.extractTasks(markdown);
      const body = ["# X3 ToDo", `updated: ${new Date().toISOString()}`, ...tasks.map((task) => `- ${task}`)].join("\n") + "\n";
      const response = await requestUrl({
        url: `https://api.github.com/gists/${this.settings.gistId}`,
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${this.settings.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        contentType: "application/json",
        body: JSON.stringify({ files: { "x3-todo.txt": { content: body } } }),
        throw: false,
      });
      if (response.status !== 200) {
        const detail = response.json?.message || `HTTP ${response.status}`;
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }
      if (showNotice) new Notice(`X3へToDo ${tasks.length}件を同期しました`);
    } catch (error) {
      console.error("X3 ToDo sync failed", error);
      const reason = error instanceof Error ? error.message : String(error);
      new Notice(`X3 ToDo同期失敗: ${reason}`);
    }
  }
}

class X3TodoSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "X3 ToDo Sync" });
    containerEl.createEl("p", { text: "専用ノートの未完了ToDoだけをSecret Gistへ送信します。機密情報は記載しないでください。" });

    new Setting(containerEl)
      .setName("GitHub Gist ID")
      .setDesc("同期先GistのURLに含まれる英数字のID")
      .addText((text) => text
        .setPlaceholder("0123456789abcdef...")
        .setValue(this.plugin.settings.gistId)
        .onChange(async (value) => {
          this.plugin.settings.gistId = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("GitHub Gistトークン")
      .setDesc("Gist権限だけを付けた専用トークンを使用してください")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("ghp_...")
          .setValue(this.plugin.settings.token)
          .onChange(async (value) => {
            this.plugin.settings.token = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("同期するノート")
      .addText((text) => text
        .setValue(this.plugin.settings.sourcePath)
        .onChange(async (value) => {
          this.plugin.settings.sourcePath = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("今すぐ同期")
      .addButton((button) => button.setButtonText("同期").setCta().onClick(() => this.plugin.syncNow(true)));
  }
}

module.exports = X3TodoSyncPlugin;
