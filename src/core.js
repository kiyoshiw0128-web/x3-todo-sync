function cleanTaskText(text) {
  return text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
    .replace(/[*_`~]/g, "")
    .trim();
}

function fnv1a32(text, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hash ^= code & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= code >>> 8;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function taskId(material) {
  const high = fnv1a32(material, 0x811c9dc5).toString(16).padStart(8, "0");
  const low = fnv1a32(material, 0x9e3779b9).toString(16).padStart(8, "0");
  return `${high}${low}`;
}

function parseTasks(markdown, sourcePath) {
  const parsed = [];
  const parents = [];
  const occurrences = new Map();
  const lines = markdown.split(/\r?\n/);

  lines.forEach((line, lineIndex) => {
    const match = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.+?)\s*$/);
    if (!match) return;

    const cleaned = cleanTaskText(match[3]).slice(0, 160);
    if (!cleaned) return;

    const indentWidth = match[1].replace(/\t/g, "    ").length;
    const level = Math.min(3, Math.floor(indentWidth / 4));
    parents.length = level;
    const hierarchy = [...parents, cleaned];
    const occurrenceKey = `${sourcePath}\u0000${level}\u0000${hierarchy.join("\u0000")}`;
    const occurrence = occurrences.get(occurrenceKey) || 0;
    occurrences.set(occurrenceKey, occurrence + 1);
    const id = taskId(`${occurrenceKey}\u0000${occurrence}`);

    parsed.push({
      checked: match[2].toLowerCase() === "x",
      id,
      level,
      lineIndex,
      text: cleaned,
    });
    parents[level] = cleaned;
    parents.length = level + 1;
  });

  return parsed;
}

function extractTasks(markdown, sourcePath, maxTasks) {
  return parseTasks(markdown, sourcePath)
    .filter(({ checked }) => !checked)
    .slice(0, maxTasks);
}

function serializeGist(tasks, updatedAt) {
  return [
    "# X3 ToDo v2",
    `updated: ${updatedAt}`,
    ...tasks.map((task) => `${"  ".repeat(task.level)}- @${task.id} ${task.text}`),
    "",
  ].join("\n");
}

function applyCompletion(markdown, sourcePath, id) {
  const matches = parseTasks(markdown, sourcePath)
    .filter((task) => task.id === id);
  if (matches.length !== 1) {
    return { status: matches.length > 1 ? "ambiguous" : "not-found", markdown };
  }
  if (matches[0].checked) {
    return { status: "already-completed", markdown };
  }

  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const lineIndex = matches[0].lineIndex;
  lines[lineIndex] = lines[lineIndex].replace(/^(\s*[-*]\s+\[) (\])/, "$1x$2");
  return { status: "completed", markdown: lines.join(eol) };
}

module.exports = {
  applyCompletion,
  extractTasks,
  serializeGist,
};
