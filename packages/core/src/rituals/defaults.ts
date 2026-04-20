/**
 * Default rituals seeded into `<vault>/.atlas/rituals/` on first run.
 * Each entry is written verbatim to `<name>.atlas`.
 */
export const DEFAULT_RITUALS: Record<string, string> = {
  "morning.atlas": [
    "# morning ritual — opens your daily note + shows today's tasks",
    "# @cron 0 8 * * *",
    "",
    "/journal.today",
    "/tasks.list",
    "/habits.list",
    "",
  ].join("\n"),
  "evening.atlas": [
    "# evening ritual — archive done tasks + log a quick journal note",
    "",
    "/tasks.archive",
    "/journal.append end of day",
    "",
  ].join("\n"),
};
