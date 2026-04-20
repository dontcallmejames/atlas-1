/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {boolean} done
 * @property {string} text
 */

const TASK_LINE = /^- \[( |x|X)\] (.+?)(?:  \^(id-[a-z0-9]+))?$/;

/**
 * Parse a markdown task list file into an array of Task objects.
 * @param {string} source
 * @returns {Task[]}
 */
export function parseTasks(source) {
  const out = [];
  for (const rawLine of source.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    const m = line.match(TASK_LINE);
    if (!m) continue;
    const [, mark, text, id] = m;
    out.push({
      id: id ?? newTaskId(),
      done: mark.toLowerCase() === "x",
      text: text.trim(),
    });
  }
  return out;
}

/**
 * Serialize a list of Task objects back to inbox.md contents.
 * @param {Task[]} tasks
 * @returns {string}
 */
export function serializeTasks(tasks) {
  if (tasks.length === 0) return "";
  return tasks
    .map((t) => `- [${t.done ? "x" : " "}] ${t.text}  ^${t.id}`)
    .join("\n") + "\n";
}

/**
 * Generate a random task id.
 * Format: `id-<9 base36 chars>`.
 * @returns {string}
 */
export function newTaskId() {
  // 9 chars of base36 → ~1e14 combinations; collision-free for single-user vaults.
  let id = "id-";
  for (let i = 0; i < 9; i++) {
    id += Math.floor(Math.random() * 36).toString(36);
  }
  return id;
}
