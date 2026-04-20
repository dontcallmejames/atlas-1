# Template Plugin

Copy this directory to make a new Atlas plugin:

```
pnpm new:plugin my-plugin
```

Then edit `plugins/my-plugin/main.js`. That scaffold renames the plugin id everywhere it appears, so `/my-plugin.hello` is the working command out of the gate.

See `plugins/tasks/`, `plugins/journal/`, and `plugins/habits/` for realistic plugins with parsers, views, XP, and more commands.
