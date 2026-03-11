/**
 * pAlert CSV Converter
 *
 * Watches a directory for new T{YYYYMMDDHHMMSS}_*.csv files,
 * extracts the #StartTime and absolute max values of a/b/c axes,
 * and appends results to an output .dat file in simple.dat format.
 *
 * Usage (standalone):
 *   node converter.js [watchDir] [outputFile]
 *
 * Usage (from start.js):
 *   require('./converter').start({ watchDir, outputFile })
 */

const chokidar = require('chokidar');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Match filenames like: T20260311123500_05133[0]_13.csv
const FILE_PATTERN = /^T\d{14}_.*\.csv$/;

function ensureHeader(outputFile) {
  if (!fs.existsSync(outputFile)) {
    fs.writeFileSync(outputFile, 'TIMESTAMP,a,b,c\r\n', 'utf8');
    console.log(`[converter] Created output file: ${outputFile}`);
  }
}

function processFile(filePath, outputFile) {
  const name = path.basename(filePath);

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let startTime = null;
  let aMax = 0, bMax = 0, cMax = 0;
  let rowCount = 0;

  rl.on('line', (line) => {
    line = line.trim();

    if (line.startsWith('#StartTime:')) {
      const raw = line.slice('#StartTime:'.length).trim();
      const m = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (m) startTime = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
      return;
    }

    if (line.startsWith('#') || line === '') return;

    const parts = line.split(',');
    if (parts.length < 4) return;

    const a = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);
    const c = parseFloat(parts[3]);
    if (isNaN(a) || isNaN(b) || isNaN(c)) return;

    rowCount++;
    if (Math.abs(a) > aMax) aMax = Math.abs(a);
    if (Math.abs(b) > bMax) bMax = Math.abs(b);
    if (Math.abs(c) > cMax) cMax = Math.abs(c);
  });

  rl.on('close', () => {
    if (!startTime) {
      console.warn(`[converter] No #StartTime in ${name}, skipping.`);
      return;
    }
    if (rowCount === 0) {
      console.warn(`[converter] No data rows in ${name}, skipping.`);
      return;
    }

    aMax = Math.round(aMax * 1e6) / 1e6;
    bMax = Math.round(bMax * 1e6) / 1e6;
    cMax = Math.round(cMax * 1e6) / 1e6;

    fs.appendFileSync(outputFile, `${startTime},${aMax},${bMax},${cMax}\r\n`, 'utf8');
    console.log(`[converter] ${name} → ${startTime},${aMax},${bMax},${cMax}`);
  });

  rl.on('error', (err) => console.error(`[converter] ${name}: ${err.message}`));
}

function start({ watchDir, outputFile }) {
  watchDir   = path.resolve(watchDir);
  outputFile = path.resolve(outputFile);

  ensureHeader(outputFile);

  console.log(`[converter] Monitoring : ${watchDir}`);
  console.log(`[converter] Output     : ${outputFile}`);
  console.log(`[converter] Pattern    : T{YYYYMMDDHHMMSS}_*.csv`);

  const watcher = chokidar.watch(watchDir, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
  });

  watcher.on('add', (filePath) => {
    const name = path.basename(filePath);
    if (!FILE_PATTERN.test(name)) return;
    console.log(`[converter] new: ${name}`);
    processFile(filePath, outputFile);
  });

  watcher.on('error', (err) => console.error('[converter] watcher error:', err));

  return watcher;
}

module.exports = { start };

// Run standalone when invoked directly
if (require.main === module) {
  start({
    watchDir:   process.argv[2] || './data',
    outputFile: process.argv[3] || './output.dat',
  });
}
