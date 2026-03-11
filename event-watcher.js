/**
 * pAlert Event Watcher
 *
 * Runs on a fixed interval (default 5 min). At each tick, scans the watch
 * directory for earthquake event files (YYYYMMDDHHMMSS+mmm_*.csv) whose
 * timestamp falls within the previous interval window.
 *
 * If events are found → records max Intensity / PGA / PGV.
 * If no events found  → records 0, 0, 0.
 *
 * Output format:
 *   TIMESTAMP,Intensity,PGA,PGV
 *   '2026-03-09 15:25:00',3.0,15.1,4.2
 *   '2026-03-09 15:30:00',0,0,0
 *
 * Usage (standalone):
 *   node event-watcher.js [watchDir] [outputFile] [intervalMinutes]
 *
 * Usage (from start.js):
 *   require('./event-watcher').start({ watchDir, outputFile, intervalMin })
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Match: 20260309152526+590_05133[0]_151.csv
const EVENT_PATTERN = /^(\d{14})\+\d+_.*\.csv$/;

const pad = (n) => String(n).padStart(2, '0');

function formatTimestamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function floorToInterval(d, intervalMs) {
  return new Date(Math.floor(d.getTime() / intervalMs) * intervalMs);
}

function parseEventTime(filename) {
  const m = filename.match(EVENT_PATTERN);
  if (!m) return null;
  const s = m[1];
  return new Date(
    parseInt(s.slice(0, 4)),
    parseInt(s.slice(4, 6)) - 1,
    parseInt(s.slice(6, 8)),
    parseInt(s.slice(8, 10)),
    parseInt(s.slice(10, 12)),
    parseInt(s.slice(12, 14)),
  );
}

function parseEventFile(filePath) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    let result = null;

    rl.on('line', (line) => {
      line = line.trim();
      if (line.startsWith('#Intensity:')) {
        const m = line.match(/#Intensity:([\d.]+)\s+PGA:([\d.]+)gal\s+PGV:([\d.]+)/);
        if (m) {
          result = {
            intensity: parseFloat(m[1]),
            pga:       parseFloat(m[2]),
            pgv:       parseFloat(m[3]),
          };
          rl.close();
        }
      }
    });

    rl.on('close', () => resolve(result));
    rl.on('error', reject);
  });
}

function ensureHeader(outputFile) {
  if (!fs.existsSync(outputFile)) {
    fs.writeFileSync(outputFile, 'TIMESTAMP,Intensity,PGA,PGV\r\n', 'utf8');
    console.log(`[event-watcher] Created output file: ${outputFile}`);
  }
}

async function tick(watchDir, outputFile, intervalMs) {
  const now         = new Date();
  const windowEnd   = floorToInterval(now, intervalMs);
  const windowStart = new Date(windowEnd.getTime() - intervalMs);
  const timestamp   = formatTimestamp(windowEnd);

  console.log(`[event-watcher] tick ${timestamp} — window [${formatTimestamp(windowStart)} ~ ${formatTimestamp(windowEnd)})`);

  let entries;
  try {
    entries = fs.readdirSync(watchDir);
  } catch (err) {
    console.error(`[event-watcher] Cannot read ${watchDir}: ${err.message}`);
    fs.appendFileSync(outputFile, `${timestamp},0,0,0\r\n`, 'utf8');
    return;
  }

  const matched = entries.filter((name) => {
    const t = parseEventTime(name);
    return t && t >= windowStart && t < windowEnd;
  });

  if (matched.length === 0) {
    fs.appendFileSync(outputFile, `${timestamp},0,0,0\r\n`, 'utf8');
    console.log(`[event-watcher] none → ${timestamp},0,0,0`);
    return;
  }

  let maxIntensity = 0, maxPGA = 0, maxPGV = 0;

  for (const name of matched) {
    try {
      const data = await parseEventFile(path.join(watchDir, name));
      if (!data) { console.warn(`[event-watcher] No #Intensity in ${name}`); continue; }
      if (data.intensity > maxIntensity) maxIntensity = data.intensity;
      if (data.pga       > maxPGA)       maxPGA       = data.pga;
      if (data.pgv       > maxPGV)       maxPGV       = data.pgv;
      console.log(`[event-watcher] ${name} → Intensity=${data.intensity} PGA=${data.pga} PGV=${data.pgv}`);
    } catch (err) {
      console.error(`[event-watcher] ${name}: ${err.message}`);
    }
  }

  fs.appendFileSync(outputFile, `${timestamp},${maxIntensity},${maxPGA},${maxPGV}\r\n`, 'utf8');
  console.log(`[event-watcher] ok → ${timestamp},${maxIntensity},${maxPGA},${maxPGV}`);
}

function scheduleNext(watchDir, outputFile, intervalMs) {
  const now      = Date.now();
  const nextTick = (Math.floor(now / intervalMs) + 1) * intervalMs;
  const delay    = nextTick - now;
  setTimeout(async () => {
    await tick(watchDir, outputFile, intervalMs);
    scheduleNext(watchDir, outputFile, intervalMs);
  }, delay);
  console.log(`[event-watcher] next tick in ${Math.round(delay / 1000)}s (at ${formatTimestamp(new Date(nextTick))})`);
}

function start({ watchDir, outputFile, intervalMin = 5 }) {
  watchDir    = path.resolve(watchDir);
  outputFile  = path.resolve(outputFile);
  const intervalMs = intervalMin * 60 * 1000;

  ensureHeader(outputFile);

  console.log(`[event-watcher] Watch dir  : ${watchDir}`);
  console.log(`[event-watcher] Output     : ${outputFile}`);
  console.log(`[event-watcher] Interval   : ${intervalMin} min`);

  tick(watchDir, outputFile, intervalMs).then(() =>
    scheduleNext(watchDir, outputFile, intervalMs)
  );
}

module.exports = { start };

// Run standalone when invoked directly
if (require.main === module) {
  start({
    watchDir:    process.argv[2] || './data',
    outputFile:  process.argv[3] || './events.dat',
    intervalMin: parseInt(process.argv[4] || '5', 10),
  });
}
