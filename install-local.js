const fs = require("node:fs");
const path = require("node:path");

const vaultRoot = path.resolve(__dirname, "../../..");
const relayConfigPath = path.resolve(__dirname, "../relay/relay.local.json");
const pluginDir = path.join(vaultRoot, ".obsidian", "plugins", "x3-todo-sync");
const dataPath = path.join(pluginDir, "data.json");

if (!fs.existsSync(relayConfigPath)) throw new Error("Relay local configuration is missing");
const relay = JSON.parse(fs.readFileSync(relayConfigPath, "utf8"));
const settings = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, "utf8")) : {};
settings.relayDatabaseUrl = relay.databaseUrl;
settings.relayChannel = relay.channel;
settings.settingsVersion = 3;

fs.mkdirSync(pluginDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, "main.js"), path.join(pluginDir, "main.js"));
fs.copyFileSync(path.join(__dirname, "manifest.json"), path.join(pluginDir, "manifest.json"));
fs.writeFileSync(dataPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
console.log("X3 ToDo Sync was installed locally with Relay configuration.");
