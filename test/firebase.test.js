const test = require("node:test");
const assert = require("node:assert/strict");

const {
  acknowledgeRelayEvent,
  fetchRelayEvents,
  relayEventsUrl,
} = require("../src/firebase");

test("末尾スラッシュを除去してイベント一覧URLを構築する", () => {
  assert.equal(
    relayEventsUrl("https://example.firebasedatabase.app/", "channel_A-123"),
    "https://example.firebasedatabase.app/relay/channel_A-123/events.json",
  );
});

test("不正な接続キーをURLへ埋め込まない", () => {
  assert.throws(
    () => relayEventsUrl("https://example.firebasedatabase.app", "../escape"),
    /接続キー/,
  );
});

test("Firebaseから未処理イベントを取得する", async () => {
  const requests = [];
  const events = await fetchRelayEvents(async (options) => {
    requests.push(options);
    return {
      status: 200,
      json: { abc: { taskId: "0123456789abcdef", schemaVersion: 1 } },
    };
  }, "https://example.firebasedatabase.app", "channel_A-123");

  assert.equal(requests[0].method, "GET");
  assert.deepEqual(events, [{ eventId: "abc", taskId: "0123456789abcdef" }]);
});

test("Firebase取得失敗を例外として扱う", async () => {
  await assert.rejects(
    () => fetchRelayEvents(async () => ({ status: 503, json: null }), "https://example.firebasedatabase.app", "channel_A-123"),
    /HTTP 503/,
  );
});

test("処理済みイベントをDELETEする", async () => {
  const requests = [];
  await acknowledgeRelayEvent(async (options) => {
    requests.push(options);
    return { status: 200 };
  }, "https://example.firebasedatabase.app", "channel_A-123", "event_1");

  assert.equal(requests[0].method, "DELETE");
  assert.equal(requests[0].url, "https://example.firebasedatabase.app/relay/channel_A-123/events/event_1.json");
});
