const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyCompletion,
  extractTasks,
  serializeGist,
} = require("../src/core");

const SOURCE_PATH = "01_ToDo/current-todo.md";

test("同名の親子と同名の兄弟に異なる決定的IDを付ける", () => {
  const markdown = [
    "- [ ] 確認する",
    "    - [ ] 確認する",
    "    - [ ] 確認する",
    "        - [ ] 確認する",
  ].join("\n");

  const first = extractTasks(markdown, SOURCE_PATH, 30);
  const second = extractTasks(markdown, SOURCE_PATH, 30);

  assert.deepEqual(first.map(({ id }) => id), second.map(({ id }) => id));
  assert.equal(new Set(first.map(({ id }) => id)).size, 4);
  assert.deepEqual(first.map(({ level }) => level), [0, 1, 1, 2]);
  assert.ok(first.every(({ id }) => /^[0-9a-f]{16}$/.test(id)));
});

test("完了済みの親を階層に含めて未完了の子のIDを安定させる", () => {
  const before = [
    "- [ ] 親",
    "    - [ ] 子",
  ].join("\n");
  const after = [
    "- [x] 親",
    "    - [ ] 子",
  ].join("\n");

  const beforeChild = extractTasks(before, SOURCE_PATH, 30)[1];
  const afterChild = extractTasks(after, SOURCE_PATH, 30)[0];

  assert.equal(afterChild.text, "子");
  assert.equal(afterChild.id, beforeChild.id);
});

test("Gist本文へIDと階層を保存する", () => {
  const markdown = [
    "- [ ] 親",
    "    - [ ] 子",
  ].join("\n");
  const tasks = extractTasks(markdown, SOURCE_PATH, 30);
  const body = serializeGist(tasks, "2026-08-16T00:00:00.000Z");

  assert.equal(body, [
    "# X3 ToDo v2",
    "updated: 2026-08-16T00:00:00.000Z",
    `- @${tasks[0].id} 親`,
    `  - @${tasks[1].id} 子`,
    "",
  ].join("\n"));
});

test("指定IDと一致する未完了ToDoだけを完了する", () => {
  const markdown = [
    "- [ ] 同じ名前",
    "    - [ ] 同じ名前",
    "- [ ] 同じ名前",
  ].join("\n");
  const tasks = extractTasks(markdown, SOURCE_PATH, 30);

  const result = applyCompletion(markdown, SOURCE_PATH, tasks[1].id);

  assert.equal(result.status, "completed");
  assert.equal(result.markdown, [
    "- [ ] 同じ名前",
    "    - [x] 同じ名前",
    "- [ ] 同じ名前",
  ].join("\n"));
});

test("存在しないIDでは本文を推測変更しない", () => {
  const markdown = "- [ ] 更新後の名前\n";

  const result = applyCompletion(markdown, SOURCE_PATH, "0123456789abcdef");

  assert.equal(result.status, "not-found");
  assert.equal(result.markdown, markdown);
});
