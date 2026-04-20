# Habits

Built-in plugin for Atlas 1 — daily habit tracking with YAML-defined habits
and an append-only JSONL log.

## Data

    <vault>/habits/
    |-- habits.yaml          # habit definitions (human-edited)
    \-- log/
        |-- 2026-04.jsonl    # append-only check-in log
        \-- 2026-05.jsonl

### habits.yaml

    habits:
      - id: workout
        name: Workout
        xp: 30
      - id: read
        name: Read 20 min
        xp: 10

First run seeds a starter list if the file is missing.

### log/YYYY-MM.jsonl

One JSON line per check-in:

    {"ts":1745123456789,"habitId":"workout","date":"2026-04-20"}

## Commands

| Command                      | Description                                           |
|------------------------------|-------------------------------------------------------|
| `/habits.checkin <id>`       | Mark today done; award the habit's XP; once per day   |
| `/habits.uncheckin <id>`     | Undo today's check-in                                 |
| `/habits.list`               | Log each habit with today's status + streak           |
| `/habits.status`             | Log a table of streaks (devtools)                     |

## UI

One card per habit: checkbox for today, current streak, XP reward, and a
30-day heatmap.

## Fork pointers

- [main.js](./main.js) — lifecycle + commands + view.
- [parser.js](./parser.js) — YAML/JSONL parse/serialize + streak math.
- `js-yaml` is the only runtime dep beyond `@atlas/sdk`.
