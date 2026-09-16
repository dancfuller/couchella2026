// Schedule data helpers shared by tools/import.html (browser) and
// tools/check-schedules.js (Node). No dependencies.
//
// Data model (one file per festival-day in data/, see CLAUDE.md):
//   SCHEDULES[key] = { weekends: { "1": { showDate: "YYYY-MM-DD", stages: [
//     { stage: "Main Stage", href: "https://...", acts: [["8:30 PM", "Artist"], ...] } ] } } }
// Times are Eastern (ET) wall-clock. Acts at 12:00–6:59 AM belong to the
// previous evening's show (same roll-over rule as the day pages).
(function (root) {
  'use strict';

  var KEYS = ['coachella-friday', 'coachella-saturday', 'coachella-sunday',
              'stagecoach-friday', 'stagecoach-saturday', 'stagecoach-sunday'];
  // Desktop grid capacity: Coachella 4 + 3 + clock, Stagecoach 2 + clock.
  var MAX_STAGES = { coachella: 7, stagecoach: 2 };
  var ROLLOVER_HOUR = 7;   // h < 7 → after midnight (mirrors norm()/edtStringToUTC in day pages)
  var END_HOUR = 4;        // now-playing caps the last act at 4:00 AM ET (END in day pages)

  function festivalOf(key) { return key.split('-')[0]; }
  function dayOf(key) { return key.split('-')[1]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ── Times ────────────────────────────────────────────
  // Lenient input: "8:30 PM", "8:30pm", "8 p.m.", "12:05 AM". Returns canonical label or null.
  var TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i;
  function parseTime(s) {
    var m = String(s).trim().match(TIME_RE);
    if (!m) return null;
    var h = +m[1], mn = m[2] === undefined ? 0 : +m[2];
    if (h < 1 || h > 12 || mn > 59) return null;
    return { h12: h, m: mn, ap: m[3].toUpperCase() + 'M' };
  }
  function label(t) { return t.h12 + ':' + (t.m < 10 ? '0' : '') + t.m + ' ' + t.ap; }
  function to24(t) { var h = t.h12 % 12; if (t.ap === 'PM') h += 12; return h; }
  function from24(h, m) { h = ((h % 24) + 24) % 24; return { h12: h % 12 || 12, m: m, ap: h >= 12 ? 'PM' : 'AM' }; }
  // Minutes from show-day midnight, with the after-midnight roll-over.
  function showMinute(lbl) {
    var t = parseTime(lbl); if (!t) return null;
    var h = to24(t); if (h < ROLLOVER_HOUR) h += 24;
    return h * 60 + t.m;
  }
  function shiftHours(lbl, hours) {
    var t = parseTime(lbl); if (!t) return null;
    return label(from24(to24(t) + hours, t.m));
  }

  function dateLabel(showDate) {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      .format(new Date(showDate + 'T12:00:00Z'));
  }

  // ── Validation ───────────────────────────────────────
  // Returns [{level: 'error'|'warn', where, msg}]. Errors break the page or now-playing;
  // warnings are things a human should look at (missing stream link, late acts).
  function validateWeekend(key, wk, wkKey) {
    var out = [], festival = festivalOf(key), pre = key + ' W' + wkKey;
    function add(level, where, msg) { out.push({ level: level, where: where, msg: msg }); }
    if (!wk || typeof wk !== 'object') { add('error', pre, 'weekend missing'); return out; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wk.showDate || '') || isNaN(new Date(wk.showDate + 'T12:00:00Z'))) {
      add('error', pre, 'showDate must be YYYY-MM-DD, got ' + JSON.stringify(wk.showDate));
    } else if (dateLabel(wk.showDate).split(',')[0].toLowerCase() !== dayOf(key)) {
      add('error', pre, 'showDate ' + wk.showDate + ' is a ' + dateLabel(wk.showDate).split(',')[0] + ', not ' + cap(dayOf(key)));
    }
    if (!Array.isArray(wk.stages) || !wk.stages.length) { add('error', pre, 'no stages'); return out; }
    if (MAX_STAGES[festival] && wk.stages.length > MAX_STAGES[festival]) {
      add('warn', pre, wk.stages.length + ' stages; the desktop grid is laid out for ' + MAX_STAGES[festival]);
    }
    var seenStage = {};
    wk.stages.forEach(function (st, si) {
      var w = pre + ' › ' + (st && st.stage ? st.stage : 'stage #' + (si + 1));
      if (!st || typeof st.stage !== 'string' || !st.stage.trim()) { add('error', w, 'stage name missing'); return; }
      if (st.stage !== st.stage.trim()) add('error', w, 'stage name has leading/trailing spaces');
      var sk = st.stage.trim().toLowerCase();
      if (seenStage[sk]) add('error', w, 'duplicate stage name');
      seenStage[sk] = true;
      if (!st.href) add('warn', w, 'no livestream link — the Watch button will not show');
      else if (!/^https:\/\/[^\s"'<>]+$/.test(st.href)) add('error', w, 'href must be an https:// URL with no spaces or quotes: ' + st.href);
      if (!Array.isArray(st.acts) || !st.acts.length) { add('error', w, 'no acts'); return; }
      var prev = null, seenName = {};
      st.acts.forEach(function (a, ai) {
        var aw = w + ' › act #' + (ai + 1);
        if (!Array.isArray(a) || a.length !== 2) { add('error', aw, 'act must be ["h:mm AM", "Name"]'); return; }
        var time = a[0], name = a[1];
        if (typeof name !== 'string' || !name.trim()) add('error', aw, 'act name missing');
        else {
          aw = w + ' › ' + name;
          if (name !== name.trim()) add('error', aw, 'act name has leading/trailing spaces');
          if (seenName[name.trim().toLowerCase()]) add('warn', aw, 'same act listed twice on this stage');
          seenName[name.trim().toLowerCase()] = true;
        }
        var t = parseTime(time);
        if (!t || label(t) !== time) { add('error', aw, 'time must look like "8:30 PM", got ' + JSON.stringify(time)); return; }
        var mnt = showMinute(time);
        if (mnt >= (24 + END_HOUR) * 60) add('warn', aw, time + ' is at/after 4:00 AM — never shown as now-playing');
        if (prev !== null && mnt <= prev.m) {
          add('error', aw, time + (mnt === prev.m ? ' has the same start as ' : ' starts before ') + prev.name + ' (' + prev.time + ') — acts must be in time order');
        }
        prev = { m: mnt, name: name, time: time };
      });
    });
    return out;
  }

  function validateSchedule(key, sched) {
    if (KEYS.indexOf(key) === -1) return [{ level: 'error', where: key, msg: 'unknown schedule key' }];
    if (!sched || !sched.weekends) return [{ level: 'error', where: key, msg: 'missing or failed to load' }];
    var wks = Object.keys(sched.weekends);
    var need = festivalOf(key) === 'coachella' ? ['1', '2'] : ['1'];
    var out = [];
    need.forEach(function (k) { if (wks.indexOf(k) === -1) out.push({ level: 'error', where: key, msg: 'weekend ' + k + ' missing' }); });
    wks.forEach(function (k) { out = out.concat(validateWeekend(key, sched.weekends[k], k)); });
    return out;
  }

  // ── Paste parsing ────────────────────────────────────
  // Accepts JSON (a full schedule {weekends}, one weekend {showDate, stages}, or a stages
  // array) or the plain-text format:
  //
  //   Main Stage | https://www.youtube.com/watch?v=...
  //   8:30 PM  Teddy Swims
  //   10:00 PM The xx
  //
  //   Outdoor Theatre
  //   7:00 PM  Dabeull
  //
  // Time may also trail the name ("Teddy Swims - 8:30 PM"); a time range keeps its start.
  // opts.sourceTz 'PT' shifts every time +3 h to ET. Acts are sorted into time order.
  // Returns {stages, errors: [string], notes: [string]}.
  var T = '(\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?\\s*m\\.?)';
  var LEAD_RE = new RegExp('^' + T + '(?:\\s*[-–—]\\s*' + T + ')?\\s*[-–—:|,]?\\s*(.+)$', 'i');
  var TRAIL_RE = new RegExp('^(.+?)\\s*[-–—:|,]?\\s*' + T + '(?:\\s*[-–—]\\s*' + T + ')?$', 'i');
  var URL_RE = /(https:\/\/\S+)/;

  function parsePaste(text, opts) {
    opts = opts || {};
    var trimmed = String(text).trim(), res;
    if (/^[\[{]/.test(trimmed)) {
      try { res = fromJson(JSON.parse(trimmed)); }
      catch (e) { return { stages: [], errors: ['Looks like JSON but does not parse: ' + e.message], notes: [] }; }
    } else {
      res = fromText(trimmed);
    }
    if (opts.sourceTz === 'PT') {
      res.stages.forEach(function (st) { st.acts.forEach(function (a) { var s = shiftHours(a[0], 3); if (s) a[0] = s; }); });
      res.notes.push('Converted all times from Pacific to Eastern (+3 h).');
    }
    res.stages.forEach(function (st) {
      var before = st.acts.map(function (a) { return a[0]; }).join();
      st.acts.sort(function (x, y) { return (showMinute(x[0]) || 0) - (showMinute(y[0]) || 0); });
      if (st.acts.map(function (a) { return a[0]; }).join() !== before) res.notes.push('Sorted ' + st.stage + ' into time order.');
    });
    return res;
  }

  function fromJson(j) {
    var stages = Array.isArray(j) ? j : j.stages ? j.stages : null;
    if (!stages && j.weekends) {
      var ks = Object.keys(j.weekends);
      if (ks.length !== 1) return { stages: [], errors: ['JSON has ' + ks.length + ' weekends; paste one weekend at a time.'], notes: [] };
      stages = j.weekends[ks[0]].stages;
    }
    if (!Array.isArray(stages)) return { stages: [], errors: ['JSON must be a stages array, {stages: [...]}, or {weekends: {...}}.'], notes: [] };
    var errors = [];
    var out = stages.map(function (st, i) {
      var acts = (st.acts || []).map(function (a) {
        var t = parseTime(a[0]);
        if (!t) errors.push((st.stage || 'stage #' + (i + 1)) + ': bad time ' + JSON.stringify(a[0]));
        return [t ? label(t) : String(a[0]), String(a[1] == null ? '' : a[1]).trim()];
      });
      return { stage: String(st.stage || '').trim(), href: st.href ? String(st.href).trim() : '', acts: acts };
    });
    return { stages: out, errors: errors, notes: [] };
  }

  function fromText(text) {
    var stages = [], errors = [], cur = null;
    text.split(/\r?\n/).forEach(function (raw, i) {
      var line = raw.replace(/ /g, ' ').trim();
      if (!line || line.charAt(0) === '#') return;
      var url = line.match(URL_RE);
      var m = line.match(LEAD_RE), time, name;
      if (m) { time = m[1]; name = m[3]; }
      else if ((m = line.match(TRAIL_RE))) { name = m[1]; time = m[2]; }
      if (time && parseTime(time) && !url) {
        if (!cur) { errors.push('Line ' + (i + 1) + ': act before any stage name: ' + line); return; }
        cur.acts.push([label(parseTime(time)), name.trim()]);
        return;
      }
      if (url && cur && !cur.href && line.replace(URL_RE, '').replace(/[|\s]/g, '') === '') { cur.href = url[1]; return; }
      var stageName = line.replace(URL_RE, '').replace(/\s*\|\s*$/, '').trim();
      if (!stageName) { errors.push('Line ' + (i + 1) + ': link with no stage: ' + line); return; }
      cur = { stage: stageName, href: url ? url[1] : '', acts: [] };
      stages.push(cur);
    });
    stages.forEach(function (st) { if (!st.acts.length) errors.push('Stage "' + st.stage + '" has no acts (is it a typo, or an act line in an unrecognized format?).'); });
    return { stages: stages, errors: errors, notes: [] };
  }

  // Inverse of the plain-text format (for "copy current schedule" in the import page).
  function toText(stages) {
    return stages.map(function (st) {
      return [st.stage + (st.href ? ' | ' + st.href : '')].concat(st.acts.map(function (a) { return a[0] + '  ' + a[1]; })).join('\n');
    }).join('\n\n') + '\n';
  }

  // ── Merge + diff ─────────────────────────────────────
  // Pasted stages replace the current stages with the same name. Stream links missing
  // from the paste are kept from current data. Current stages absent from the paste are
  // kept (in their original position) unless keepMissing is false.
  function mergeStages(current, pasted, opts) {
    opts = opts || {};
    var keepMissing = opts.keepMissing !== false, notes = [];
    var byName = {};
    (current || []).forEach(function (st) { byName[st.stage.toLowerCase()] = st; });
    var used = {};
    var merged = pasted.map(function (p) {
      var cur = byName[p.stage.toLowerCase()];
      var st = { stage: p.stage, href: p.href, acts: p.acts.map(function (a) { return [a[0], a[1]]; }) };
      if (cur) {
        used[p.stage.toLowerCase()] = true;
        if (!st.href && cur.href) { st.href = cur.href; notes.push(p.stage + ': kept existing stream link.'); }
      }
      return st;
    });
    (current || []).forEach(function (st, i) {
      if (used[st.stage.toLowerCase()]) return;
      if (keepMissing) {
        merged.splice(Math.min(i, merged.length), 0, JSON.parse(JSON.stringify(st)));
        notes.push(st.stage + ': not in paste — kept unchanged.');
      } else {
        notes.push(st.stage + ': not in paste — REMOVED.');
      }
    });
    return { stages: merged, notes: notes };
  }

  // Rows: {stage, kind: 'stage-added'|'stage-removed'|'href'|'added'|'removed'|'time'|'same', ...}
  function diffStages(oldStages, newStages) {
    var rows = [], oldBy = {}, newBy = {};
    (oldStages || []).forEach(function (s) { oldBy[s.stage.toLowerCase()] = s; });
    (newStages || []).forEach(function (s) { newBy[s.stage.toLowerCase()] = s; });
    (newStages || []).forEach(function (ns) {
      var os = oldBy[ns.stage.toLowerCase()];
      if (!os) { rows.push({ stage: ns.stage, kind: 'stage-added' }); ns.acts.forEach(function (a) { rows.push({ stage: ns.stage, kind: 'added', time: a[0], name: a[1] }); }); return; }
      if ((os.href || '') !== (ns.href || '')) rows.push({ stage: ns.stage, kind: 'href', from: os.href || '', to: ns.href || '' });
      var oa = {}; os.acts.forEach(function (a) { oa[a[1].toLowerCase()] = a; });
      var seen = {};
      ns.acts.forEach(function (a) {
        var k = a[1].toLowerCase(), o = oa[k]; seen[k] = true;
        if (!o) rows.push({ stage: ns.stage, kind: 'added', time: a[0], name: a[1] });
        else if (o[0] !== a[0] || o[1] !== a[1]) rows.push({ stage: ns.stage, kind: 'time', time: a[0], from: o[0], name: a[1], fromName: o[1] });
        else rows.push({ stage: ns.stage, kind: 'same', time: a[0], name: a[1] });
      });
      os.acts.forEach(function (a) { if (!seen[a[1].toLowerCase()]) rows.push({ stage: ns.stage, kind: 'removed', time: a[0], name: a[1] }); });
    });
    (oldStages || []).forEach(function (os) { if (!newBy[os.stage.toLowerCase()]) rows.push({ stage: os.stage, kind: 'stage-removed' }); });
    return rows;
  }

  // ── Serialization ────────────────────────────────────
  function q(s) { return JSON.stringify(s); }
  function serialize(key, sched) {
    var wks = Object.keys(sched.weekends).sort();
    var year = sched.weekends[wks[0]].showDate.slice(0, 4);
    var L = [];
    L.push('// ' + cap(festivalOf(key)) + ' ' + year + ' — ' + cap(dayOf(key)) + ' livestream schedule.');
    L.push('// Edit with tools/import.html, then check with `node tools/check-schedules.js`.');
    L.push('// Times are Eastern (ET) wall-clock; 12:00–6:59 AM acts belong to the previous evening.');
    L.push('(window.SCHEDULES = window.SCHEDULES || {})[' + q(key) + '] = {');
    L.push('  "weekends": {');
    wks.forEach(function (wk, wi) {
      var w = sched.weekends[wk];
      L.push('    ' + q(wk) + ': {');
      L.push('      "showDate": ' + q(w.showDate) + ',');
      L.push('      "stages": [');
      w.stages.forEach(function (st, si) {
        L.push('        {');
        L.push('          "stage": ' + q(st.stage) + ',');
        L.push('          "href": ' + q(st.href || '') + ',');
        L.push('          "acts": [');
        st.acts.forEach(function (a, ai) {
          L.push('            [' + q(a[0]) + ', ' + q(a[1]) + ']' + (ai < st.acts.length - 1 ? ',' : ''));
        });
        L.push('          ]');
        L.push('        }' + (si < w.stages.length - 1 ? ',' : ''));
      });
      L.push('      ]');
      L.push('    }' + (wi < wks.length - 1 ? ',' : ''));
    });
    L.push('  }');
    L.push('};');
    return L.join('\n') + '\n';
  }

  var api = {
    KEYS: KEYS, MAX_STAGES: MAX_STAGES,
    parseTime: parseTime, showMinute: showMinute, shiftHours: shiftHours, dateLabel: dateLabel,
    validateWeekend: validateWeekend, validateSchedule: validateSchedule,
    parsePaste: parsePaste, toText: toText, mergeStages: mergeStages, diffStages: diffStages, serialize: serialize,
    festivalOf: festivalOf, dayOf: dayOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScheduleLib = api;
})(this);
