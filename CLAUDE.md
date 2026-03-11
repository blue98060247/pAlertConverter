# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the full application (both processes)
node start.js

# Run converter only (args: watchDir outputFile)
node converter.js ./data ./output.dat

# Run event-watcher only (args: watchDir outputFile intervalMinutes)
node event-watcher.js ./data ./events.dat 5

# Production deployment with PM2
pm2 start pm2.json

# Environment variable overrides
WATCH_DIR=./data CONVERTER_OUTPUT=./output.dat EVENT_OUTPUT=./events.dat INTERVAL_MIN=5 node start.js
```

No tests or linters are configured.

## Architecture

This is a **dual-process seismic data pipeline** for pALERT earthquake sensors. It watches directories for CSV files, extracts acceleration/intensity metrics, and appends results to simple `.dat` files for downstream consumption.

### Two Processes

**`converter.js`** — continuous file watcher
- Monitors for files matching `T{YYYYMMDDHHMMSS}_*.csv` (regular interval data)
- Extracts `#StartTime` from CSV header metadata
- Calculates max absolute value across 3 axes (columns b, c, d) from all data rows
- Appends one line per file: `'YYYY-MM-DD HH:MM:SS',a,b,c` to output `.dat`

**`event-watcher.js`** — periodic event detector (default: every 5 min)
- Monitors for files matching `{YYYYMMDDHHMMSS}+{mmm}_*.csv` (event-triggered data, `+mmm` = millisecond offset)
- On each interval, scans for event files within the past N-minute window
- Extracts `#Intensity`, `#PGA`, `#PGV` from event file headers
- Appends max values or `0,0,0` if no events occurred

**`start.js`** — launches both processes with shared env config

### Input CSV Format

```
#StationCode[0]:5133
#InstrumentType: pALERT_S303
#StartTime:2026/03/11 12:35:00.000
#SampleRate(Hz): 100
#Data: 4F
0.0000,-0.002459,0.011579,-0.047369,-0.529530
```

Row columns: `time, ?, a, b, c` — converter uses columns 2–4 (0-indexed).

### Output `.dat` Format

```
TIMESTAMP,a,b,c
'2026-03-11 12:35:00',0.047,0.529,0.031
```

### `models/` Directory

Contains Mongoose schemas for a larger MongoDB-based monitoring platform (not part of this repo's runtime — no mongoose in package.json). Key schemas: `Instrument.js` (alert thresholds WL/AL/WSL), `Project.js`, `User.js`, `Output.js`, `Event.js`, `Message.js`.

### Deployment

`pm2.json` manages both processes with auto-restart (max 10 restarts, 3s delay). Logs go to `./logs/`.
