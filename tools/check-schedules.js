#!/usr/bin/env node
// Validate every schedule in data/ with the same rules as tools/import.html.
// Usage: node tools/check-schedules.js      (exit 1 on errors; warnings don't fail)
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var lib = require('./schedule-lib.js');

var root = path.resolve(__dirname, '..');
var errors = 0, warns = 0;
lib.KEYS.forEach(function (key) {
  var file = path.join(root, 'data', key + '.js');
  var sandbox = { window: {} };
  try {
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  } catch (e) {
    console.log('ERROR ' + key + ': ' + (e.code === 'ENOENT' ? 'file missing' : 'does not load — ' + e.message));
    errors++;
    return;
  }
  var sched = (sandbox.window.SCHEDULES || {})[key];
  var issues = lib.validateSchedule(key, sched);
  issues.forEach(function (i) {
    console.log((i.level === 'error' ? 'ERROR ' : 'warn  ') + i.where + ': ' + i.msg);
    if (i.level === 'error') errors++; else warns++;
  });
  if (!issues.length) console.log('ok    ' + key);
});
console.log('\n' + errors + ' error(s), ' + warns + ' warning(s)');
process.exit(errors ? 1 : 0);
