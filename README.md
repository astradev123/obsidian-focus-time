# Focus Time

English | [简体中文](README_zh.md)

Focus Time records how long you spend in each note and turns it into a dashboard: where the time went, which notes you keep coming back to, and when you actually work.

![Dashboard overview](asset/dashboard-overview.png)

## What it measures

A session starts when a Markdown note is open in the active tab. It ends when you switch notes, leave the window, go idle, or hit midnight — a session running from 23:40 to 00:20 is split into one session per day.

Each session also records whether the note was being edited or only read, so the dashboard can show an edit/read split instead of a single number.

Idle detection counts input, not cursor movement. Typing, clicking, scrolling and selecting text reset the timer; moving the mouse does not. The threshold is configurable, and reading can use a longer one than editing.

The status bar shows the current note's time, and the reason when tracking is paused.

## Dashboard

Five ranges (day, week, month, year, total) and four tabs:

| Tab | Contents |
| --- | --- |
| Overview | Totals, edit/read split, focus trend, 12-week calendar, a short summary, top notes |
| Trends | Median and longest session, context switches, active days, hour-by-weekday heatmap, session length distribution |
| Notes | Notes ranked by time, with new and returning counts |
| Categories | Time and note count per top-level folder; click a folder to filter the notes tab |

![Trends](asset/dashboard-trends.png)

![Notes](asset/dashboard-notes.png)

![Categories](asset/dashboard-categories.png)

A small "?" next to a metric explains how it is calculated. The markers can be turned off in settings.

On a phone the layout collapses into one column:

<img src="asset/dashboard-mobile.png" width="320" alt="Dashboard on a phone">

## Install

1. **Settings → Community plugins → Browse**, search for "Focus Time".
2. Install, then enable it under **Community plugins**.

## Commands

- **Open Focus Time dashboard** — also available from the ribbon icon.
- **Pause or resume focus tracking**
- **Rescan legacy focus data** — re-imports 1.x files, skipping records already imported.
- **Export focus sessions as CSV**, **Export focus data as JSON**, **Export a focus report as Markdown** — written to `store/exports/`.
- **Write focus totals to the current note** — adds `focus_total` (minutes) and `focus_updated` (date) to frontmatter.

## Inline stats

A `focus-time` block renders the total and session count for a range:

````markdown
```focus-time
month
```
````

Accepted values: `today`, `week` (default), `month`, `note` (the note containing the block), `total`.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Language | Follow Obsidian | English, 简体中文, 繁體中文, 日本語, 한국어 |
| Strict mode | On | Stop counting while the window is not focused |
| Idle detection | 5 minutes | Off, fixed, custom, or a separate threshold for reading |
| Daily focus goal | 60 minutes | Used for streaks and the goal progress in the sidebar |
| Concept hints | On | The "?" markers described above |

## Where the data lives

Everything sits inside the plugin folder, under `.obsidian/plugins/focus-time/store/`:

```
store/
  events/2026-11.<device>.jsonl    sessions, one shard per device per month
  notes.json                       note ids and their current paths
  meta.json                        schema version and migration state
  archive/v0-<timestamp>/          copy of 1.x data, taken before import
  reports/migration-<timestamp>.json
  exports/
```

Events are append-only and carry an id, so the same data can be imported twice without double counting. Each device writes its own shard; all shards are merged when the index loads. Note ids are stable, so renaming a note or moving a folder keeps its history.

The folder lives inside the plugin, so removing the plugin removes the data. Export or copy it first if you might reinstall.

Settings live in the plugin's `data.json`, next to the `store/` folder.

## Upgrading from 1.x

On the first start with 1.x data present, the plugin copies `data.json` and `data/*.json` into `store/archive/`, imports them, checks the totals, and writes a report to `store/reports/`. The original files are only read.

If the numbers look wrong, run **Rescan legacy focus data**; already imported events are skipped. Version 1.x cannot read the new event log, so keep the archive if you plan to go back.

## Development

```bash
npm install
npm run dev      # watch build
npm run check    # translations, tests, typecheck, bundle
npm run shots    # regenerate the screenshots in asset/
```

`npm run shots` renders the dashboard from a fixed demo dataset with headless Chrome. Set `CHROME_PATH` if Chrome is not in the usual location.

## Support

If Focus Time is useful to you, you can [buy me a coffee](https://buymeacoffee.com/astradev123).

## License

[Apache 2.0](LICENSE)
