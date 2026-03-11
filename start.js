const { start: startConverter }     = require('./converter');
const { start: startEventWatcher }  = require('./event-watcher');

// ── Config ────────────────────────────────────────────────────────────────────
const config = {
  watchDir:        process.env.WATCH_DIR        || './data',
  converterOutput: process.env.CONVERTER_OUTPUT || './output.dat',
  eventOutput:     process.env.EVENT_OUTPUT     || './events.dat',
  intervalMin:     parseInt(process.env.INTERVAL_MIN || '5', 10),
};

// ── Start ─────────────────────────────────────────────────────────────────────
console.log('=== pAlert Converter ===');
console.log(`Watch dir : ${config.watchDir}`);
console.log(`Interval  : ${config.intervalMin} min\n`);

startConverter({
  watchDir:   config.watchDir,
  outputFile: config.converterOutput,
});

console.log();

startEventWatcher({
  watchDir:    config.watchDir,
  outputFile:  config.eventOutput,
  intervalMin: config.intervalMin,
});
