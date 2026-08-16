const { Plugin, PluginSettingTab, Setting, Notice, requestUrl } = require("obsidian");
const { extractTasks, serializeGist } = require("./core");
const { acknowledgeRelayEvent, fetchRelayEvents } = require("./firebase");
const { processRelayEvents } = require("./relay");

const DEFAULTS = {
  token: "",
  gistId: "",
  sourcePath: "01_ToDo/X3待受.md",
  maxTasks: 30,
  relayDatabaseUrl: "https://x3-todo-relay-default-rtdb.asia-southeast1.firebasedatabase.app",
  relayChannel: "",
  settingsVersion: 3,
};

const RELAY_POLL_MS = 5 * 60 * 1000;

class X3TodoSyncPlugin extends Plugin {
  async onload() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULTS, saved);
    this.settings.settingsVersion = DEFAULTS.settingsVersion;
    this.lastRelayStatus = "未設定";
    this.syncing = false;
    await this.saveSettings();

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
    this.registerInterval(window.setInterval(() => this.syncNow(false), RELAY_POLL_MS));
    this.app.workspace.onLayoutReady(() => this.syncNow(false));
  }

  onunload() {
    clearTimeout(this.syncTimer);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  relayConfigured() {
    return Boolean(this.settings.relayDatabaseUrl && this.settings.relayChannel);
  }

  async processRelay(file) {
    if (!this.relayConfigured()) {
      this.lastRelayStatus = "未設定";
      return { changed: false, acknowledged: 0, unresolved: [] };
    }

    const events = await fetchRelayEvents(
      requestUrl,
      this.settings.relayDatabaseUrl,
      this.settings.relayChannel,
    );
    if (events.length === 0) {
      this.lastRelayStatus = "待機中";
      return { changed: false, acknowledged: 0, unresolved: [] };
    }

    const markdown = await this.app.vault.read(file);
    const result = await processRelayEvents({
      events,
      markdown,
      sourcePath: this.settings.sourcePath,
      writeMarkdown: (nextMarkdown) => this.app.vault.modify(file, nextMarkdown),
      acknowledge: (eventId) => acknowledgeRelayEvent(
        requestUrl,
        this.settings.relayDatabaseUrl,
        this.settings.relayChannel,
        eventId,
      ),
    });
    this.lastRelayStatus = result.unresolved.length > 0
      ? `再同期が必要: ${result.unresolved.length}件`
      : `反映済み: ${result.acknowledged}件`;
    return result;
  }

  async uploadGist(file) {
    if (!this.settings.gistId || !this.settings.token) {
      throw new Error("設定でGist IDとトークンを入力してください");
    }
    const markdown = await this.app.vault.read(file);
    const tasks = extractTasks(markdown, this.settings.sourcePath, this.settings.maxTasks);
    const body = serializeGist(tasks, new Date().toISOString());
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
      throw new Error(`Gist HTTP ${response.status}: ${detail}`);
    }
    return tasks.length;
  }

  async syncNow(showNotice) {
    if (this.syncing) return;
    const file = this.app.vault.getAbstractFileByPath(this.settings.sourcePath);
    if (!file) {
      if (showNotice) new Notice(`X3 ToDo Sync: ${this.settings.sourcePath} が見つかりません`);
      return;
    }

    this.syncing = true;
    let relayError = null;
    try {
      try {
        await this.processRelay(file);
      } catch (error) {
        relayError = error;
        this.lastRelayStatus = "通信失敗";
        console.error("X3 ToDo relay failed", error);
      }

      const taskCount = await this.uploadGist(file);
      if (showNotice) {
        const suffix = relayError ? "（完了通知の取得は失敗）" : "";
        new Notice(`X3へToDo ${taskCount}件を同期しました${suffix}`);
      }
    } catch (error) {
      console.error("X3 ToDo sync failed", error);
      const reason = error instanceof Error ? error.message : String(error);
      if (showNotice) new Notice(`X3 ToDo同期失敗: ${reason}`);
    } finally {
      this.syncing = false;
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
    containerEl.createEl("p", { text: "未完了ToDoをX3へ送り、X3で完了した行だけを元ノートへ反映します。" });

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
        text.setPlaceholder("github_pat_...")
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
      .setName("最大表示件数")
      .setDesc("X3では1ページ6件、最大30件です")
      .addSlider((slider) => slider
        .setLimits(1, 30, 1)
        .setValue(this.plugin.settings.maxTasks)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxTasks = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("完了通知 Relay URL")
      .setDesc("Firebase Realtime DatabaseのURL")
      .addText((text) => text
        .setPlaceholder("https://...firebasedatabase.app")
        .setValue(this.plugin.settings.relayDatabaseUrl)
        .onChange(async (value) => {
          this.plugin.settings.relayDatabaseUrl = value.trim().replace(/\/+$/, "");
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("完了通知 接続キー")
      .setDesc("X3と共通の専用キー。GitHubトークンとは別物です")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("接続キー")
          .setValue(this.plugin.settings.relayChannel)
          .onChange(async (value) => {
            this.plugin.settings.relayChannel = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("完了通知の状態")
      .setDesc(this.plugin.lastRelayStatus);

    new Setting(containerEl)
      .setName("今すぐ同期")
      .addButton((button) => button.setButtonText("同期").setCta().onClick(() => this.plugin.syncNow(true)));
  }
}

module.exports = X3TodoSyncPlugin;
