const test = require("node:test");
const assert = require("node:assert/strict");

const { extractTasks } = require("../src/core");
const {
  normalizeRelayEvents,
  processRelayEvents,
} = require("../src/relay");

const SOURCE_PATH = "01_ToDo/current-todo.md";

test("Firebase応答から正しい完了イベントだけを受け取る", () => {
  const events = normalizeRelayEvents({
    valid: { taskId: "0123456789abcdef", schemaVersion: 1, deviceId: "x3" },
    wrongId: { taskId: "not-hex", schemaVersion: 1 },
    wrongVersion: { taskId: "fedcba9876543210", schemaVersion: 2 },
    extraBody: { taskId: "1111111111111111", schemaVersion: 1, text: "本文は禁止" },
  });

  assert.deepEqual(events, [
    { eventId: "valid", taskId: "0123456789abcdef" },
  ]);
});

test("ノート保存成功後にだけイベントを処理済みにする", async () => {
  const original = "- [ ] 親\n    - [ ] 子\n";
  const child = extractTasks(original, SOURCE_PATH, 30)[1];
  const calls = [];
  let saved = "";

  const result = await processRelayEvents({
    events: [{ eventId: "event-1", taskId: child.id }],
    markdown: original,
    sourcePath: SOURCE_PATH,
    writeMarkdown: async (markdown) => {
      calls.push("write");
      saved = markdown;
    },
    acknowledge: async (eventId) => calls.push(`ack:${eventId}`),
  });

  assert.deepEqual(calls, ["write", "ack:event-1"]);
  assert.equal(saved, "- [ ] 親\n    - [x] 子\n");
  assert.deepEqual(result, { changed: true, acknowledged: 1, unresolved: [] });
});

test("ノート保存に失敗した場合はイベントを残す", async () => {
  const original = "- [ ] 失敗テスト\n";
  const task = extractTasks(original, SOURCE_PATH, 30)[0];
  const acknowledged = [];

  await assert.rejects(() => processRelayEvents({
    events: [{ eventId: "event-2", taskId: task.id }],
    markdown: original,
    sourcePath: SOURCE_PATH,
    writeMarkdown: async () => { throw new Error("disk full"); },
    acknowledge: async (eventId) => acknowledged.push(eventId),
  }), /disk full/);

  assert.deepEqual(acknowledged, []);
});

test("一致しないIDは推測変更せず未解決として残す", async () => {
  let wrote = false;
  let acknowledged = false;

  const result = await processRelayEvents({
    events: [{ eventId: "event-3", taskId: "0123456789abcdef" }],
    markdown: "- [ ] 編集後\n",
    sourcePath: SOURCE_PATH,
    writeMarkdown: async () => { wrote = true; },
    acknowledge: async () => { acknowledged = true; },
  });

  assert.equal(wrote, false);
  assert.equal(acknowledged, false);
  assert.deepEqual(result.unresolved, ["event-3"]);
});

test("既に完了済みの同一IDは再変更せずイベントだけ処理済みにする", async () => {
  const unchecked = "- [ ] 完了済み\n";
  const task = extractTasks(unchecked, SOURCE_PATH, 30)[0];
  const acknowledged = [];

  const result = await processRelayEvents({
    events: [{ eventId: "event-4", taskId: task.id }],
    markdown: "- [x] 完了済み\n",
    sourcePath: SOURCE_PATH,
    writeMarkdown: async () => { throw new Error("write should not run"); },
    acknowledge: async (eventId) => acknowledged.push(eventId),
  });

  assert.deepEqual(acknowledged, ["event-4"]);
  assert.deepEqual(result, { changed: false, acknowledged: 1, unresolved: [] });
});
