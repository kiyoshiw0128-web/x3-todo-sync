const { normalizeRelayEvents } = require("./relay");

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

function validateSegment(value, label) {
  if (!SAFE_SEGMENT.test(value || "")) throw new Error(`${label}が不正です`);
}

function relayEventsUrl(databaseUrl, channel) {
  validateSegment(channel, "接続キー");
  const base = (databaseUrl || "").replace(/\/+$/, "");
  if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(base)) throw new Error("Relay URLが不正です");
  return `${base}/relay/${channel}/events.json`;
}

async function fetchRelayEvents(request, databaseUrl, channel) {
  const response = await request({
    url: relayEventsUrl(databaseUrl, channel),
    method: "GET",
    throw: false,
  });
  if (response.status !== 200) throw new Error(`Relay取得 HTTP ${response.status}`);
  return normalizeRelayEvents(response.json);
}

async function acknowledgeRelayEvent(request, databaseUrl, channel, eventId) {
  validateSegment(eventId, "イベントID");
  const eventsUrl = relayEventsUrl(databaseUrl, channel).replace(/\.json$/, "");
  const response = await request({
    url: `${eventsUrl}/${eventId}.json`,
    method: "DELETE",
    throw: false,
  });
  if (response.status !== 200 && response.status !== 204) {
    throw new Error(`Relay削除 HTTP ${response.status}`);
  }
}

module.exports = {
  acknowledgeRelayEvent,
  fetchRelayEvents,
  relayEventsUrl,
};
