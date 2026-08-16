const { applyCompletion } = require("./core");

const ALLOWED_FIELDS = new Set(["createdAt", "deviceId", "schemaVersion", "taskId"]);

function normalizeRelayEvents(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];

  const events = [];
  for (const [eventId, value] of Object.entries(payload)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (Object.keys(value).some((key) => !ALLOWED_FIELDS.has(key))) continue;
    if (value.schemaVersion !== 1 || !/^[0-9a-f]{16}$/.test(value.taskId || "")) continue;
    events.push({ eventId, taskId: value.taskId });
  }
  return events;
}

async function processRelayEvents({ events, markdown, sourcePath, writeMarkdown, acknowledge }) {
  let nextMarkdown = markdown;
  let changed = false;
  const readyToAcknowledge = [];
  const unresolved = [];

  for (const event of events) {
    const result = applyCompletion(nextMarkdown, sourcePath, event.taskId);
    if (result.status === "completed") {
      nextMarkdown = result.markdown;
      changed = true;
      readyToAcknowledge.push(event.eventId);
    } else if (result.status === "already-completed") {
      readyToAcknowledge.push(event.eventId);
    } else {
      unresolved.push(event.eventId);
    }
  }

  if (changed) await writeMarkdown(nextMarkdown);
  for (const eventId of readyToAcknowledge) await acknowledge(eventId);

  return {
    changed,
    acknowledged: readyToAcknowledge.length,
    unresolved,
  };
}

module.exports = {
  normalizeRelayEvents,
  processRelayEvents,
};
