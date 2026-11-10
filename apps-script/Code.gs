/**
 * Mei Mandarin lesson submissions.
 *
 * Deploy as a web app (see DEPLOY.md). doPost accepts a JSON body sent as
 * text/plain (so the GitHub Pages frontend can avoid a CORS preflight).
 *
 * Payload:
 *   { lessonId, answers, clientGrade, sheet_ops, audio:{S1:base64,...}, mimeTypes }
 *
 * Saves Drive/Mandarin/submissions/<lessonId>/<timestamp>/{submission.json, audio, status.json}
 * and applies written-score mastery updates to the progress Sheet, idempotently
 * keyed on sha256(lessonId + canonical answers).
 *
 * There is no shared secret in the public page. This endpoint is a mailbox,
 * not a security boundary: size limits and light validation only.
 */
var SHEET_ID = "1zeFTbheaUaBwP2R1szWImfVOX0jWhN_YN1rct3UIKcM";
var SHEET_TAB = "progress";
var COLUMNS = ["id", "pinyin", "meaning", "hsk", "mastery", "times_seen", "times_correct", "last_practiced", "next_due", "notes"];
var UPDATED = ["mastery", "times_seen", "times_correct", "last_practiced", "next_due"];
var MAX_BYTES = 45 * 1024 * 1024;
var MAX_CLIP_BYTES = 8 * 1024 * 1024;
var ROOT_FOLDER = "Mandarin";
var SUBMISSIONS_FOLDER = "submissions";
var APPLIED_FILE = "_applied.json";

function doGet() {
  return text_({ ok: true, service: "mei-mandarin-submissions" });
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || "";
    if (raw.length > MAX_BYTES) return text_({ ok: false, error: "payload too large" });
    var body = JSON.parse(raw);
    return text_(handleSubmission_(body));
  } catch (err) {
    return text_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function text_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.TEXT);
}

function handleSubmission_(body) {
  if (!body || typeof body !== "object") throw new Error("body must be a JSON object");
  var lessonId = sanitizeId_(body.lessonId || body.lesson_id || "");
  if (!lessonId) throw new Error("lessonId is required");
  var answers = body.answers && typeof body.answers === "object" ? body.answers : {};
  var audio = body.audio && typeof body.audio === "object" ? body.audio : {};
  var mimeTypes = body.mimeTypes && typeof body.mimeTypes === "object" ? body.mimeTypes : {};
  var audioKeys = Object.keys(audio);
  if (audioKeys.length > 12) throw new Error("too many audio clips");
  audioKeys.forEach(function (k) {
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(k)) throw new Error("bad audio key: " + k);
    if (typeof audio[k] !== "string") throw new Error("audio." + k + " must be base64 text");
    // base64 expands ~4/3; reject obviously oversized clips early
    if (audio[k].length > Math.ceil(MAX_CLIP_BYTES * 1.4) + 128) throw new Error("audio." + k + " is too large");
  });

  var patches = extractPatches_(body);
  var idem = idempotencyKey_(lessonId, answers);
  var stamp = Utilities.formatDate(new Date(), "America/New_York", "yyyy-MM-dd'T'HH-mm-ss");
  // Avoid colliding if two posts land in the same second.
  stamp = stamp + "-" + idem.slice(0, 8);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var folder = createSubmissionFolder_(lessonId, stamp);
    var savedAudio = writeAudio_(folder, audio, mimeTypes);

    var withoutAudio = {
      lessonId: lessonId,
      lesson_number: body.lesson_number || (body.clientGrade && body.clientGrade.lesson_number) || null,
      answers: answers,
      clientGrade: body.clientGrade || null,
      sheet_ops: patches,
      audioFiles: savedAudio,
      mimeTypes: mimeTypes,
      receivedAt: new Date().toISOString(),
      idempotency_key: idem
    };
    folder.createFile(Utilities.newBlob(JSON.stringify(withoutAudio, null, 2), "application/json", "submission.json"));

    var already = alreadyApplied_(idem);
    var sheetResult = { applied: false, reason: already ? "duplicate" : "no_patches", unmatched: [] };
    if (!already && patches.length) {
      sheetResult = applyPatches_(patches);
      sheetResult.applied = true;
      rememberApplied_(idem, { lessonId: lessonId, at: new Date().toISOString(), folder: folder.getUrl() });
    } else if (already) {
      sheetResult = { applied: false, reason: "duplicate", unmatched: [] };
    }

    var needsVoice = (body.clientGrade && body.clientGrade.needs_voice) || [];
    var voicePending = needsVoice.length > 0 || savedAudio.length > 0;
    var status = {
      lessonId: lessonId,
      timestamp: stamp,
      voice_pending: voicePending,
      has_audio: savedAudio,
      written_score: body.clientGrade ? { score: body.clientGrade.score, max: body.clientGrade.max } : null,
      sheet_applied: !!sheetResult.applied,
      sheet_reason: sheetResult.reason || (sheetResult.applied ? "ok" : ""),
      unmatched_words: sheetResult.unmatched || [],
      idempotency_key: idem
    };
    folder.createFile(Utilities.newBlob(JSON.stringify(status, null, 2), "application/json", "status.json"));
    return { ok: true, status: status, folderUrl: folder.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

function extractPatches_(body) {
  var list = [];
  if (body.clientGrade && Array.isArray(body.clientGrade.sheet_patches)) list = body.clientGrade.sheet_patches;
  else if (Array.isArray(body.sheet_ops) && body.sheet_ops.length && body.sheet_ops[0] && body.sheet_ops[0].id_or_word) list = body.sheet_ops;
  // Range-style ops from the offline tracker cannot be applied safely as
  // absolute cell writes (row numbers go stale). Ignore those and wait for patches.
  var out = [];
  list.forEach(function (p, i) {
    if (!p || typeof p !== "object") return;
    var id = String(p.id_or_word || "").trim();
    if (!id) return;
    var delta = p.delta_points;
    var inc = p.times_correct_inc;
    if (typeof delta !== "number" || !isFinite(delta)) throw new Error("patch " + i + " bad delta_points");
    if (typeof inc !== "number" || !isFinite(inc)) inc = 0;
    out.push({ id_or_word: id, delta_points: delta, times_correct_inc: inc });
  });
  return out;
}

function sanitizeId_(s) {
  s = String(s || "").trim();
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(s)) return "";
  return s;
}

function idempotencyKey_(lessonId, answers) {
  var keys = Object.keys(answers || {}).sort();
  var canon = keys.map(function (k) { return [k, answers[k] == null ? "" : String(answers[k])]; });
  var raw = lessonId + "\n" + JSON.stringify(canon);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8)
    .map(function (b) { var v = (b + 256) % 256; return ("0" + v.toString(16)).slice(-2); })
    .join("");
}

function getOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function mandarinRoot_() {
  var it = DriveApp.getFoldersByName(ROOT_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_FOLDER);
}

function submissionsRoot_() {
  return getOrCreateFolder_(mandarinRoot_(), SUBMISSIONS_FOLDER);
}

function createSubmissionFolder_(lessonId, stamp) {
  var lessonFolder = getOrCreateFolder_(submissionsRoot_(), lessonId);
  return getOrCreateFolder_(lessonFolder, stamp);
}

function writeAudio_(folder, audio, mimeTypes) {
  var saved = [];
  Object.keys(audio).forEach(function (k) {
    var raw = audio[k];
    // Tolerate a data: URL prefix if the client sent one.
    var comma = raw.indexOf(",");
    if (raw.slice(0, 5) === "data:" && comma !== -1) raw = raw.slice(comma + 1);
    var bytes = Utilities.base64Decode(raw);
    if (bytes.length > MAX_CLIP_BYTES) throw new Error("audio." + k + " is too large");
    var mime = String(mimeTypes[k] || "audio/webm").split(";")[0];
    if (!/^audio\//.test(mime) && mime !== "video/webm") mime = "audio/webm";
    var ext = mimeExt_(mime);
    folder.createFile(Utilities.newBlob(bytes, mime, k + ext));
    saved.push(k);
  });
  return saved;
}

function mimeExt_(mime) {
  if (mime.indexOf("mp4") !== -1 || mime.indexOf("m4a") !== -1 || mime.indexOf("aac") !== -1) return ".m4a";
  if (mime.indexOf("ogg") !== -1) return ".ogg";
  if (mime.indexOf("mpeg") !== -1 || mime.indexOf("mp3") !== -1) return ".mp3";
  if (mime.indexOf("wav") !== -1) return ".wav";
  return ".webm";
}

function appliedMap_() {
  var root = submissionsRoot_();
  var it = root.getFilesByName(APPLIED_FILE);
  if (!it.hasNext()) return { file: null, map: {} };
  var file = it.next();
  try {
    var map = JSON.parse(file.getBlob().getDataAsString());
    if (!map || typeof map !== "object") map = {};
    return { file: file, map: map };
  } catch (e) {
    return { file: file, map: {} };
  }
}

function alreadyApplied_(key) {
  var rec = appliedMap_();
  return !!(rec.map && rec.map[key]);
}

function rememberApplied_(key, meta) {
  var rec = appliedMap_();
  rec.map[key] = meta;
  var blob = Utilities.newBlob(JSON.stringify(rec.map, null, 2), "application/json", APPLIED_FILE);
  if (rec.file) rec.file.setContent(blob.getDataAsString());
  else submissionsRoot_().createFile(blob);
}

function norm_(s) {
  return String(s || "").replace(/^\s+|\s+$/g, "").toLowerCase();
}

function num_(v, field, rid) {
  if (v === "" || v === null || v === undefined) return 0;
  var f = Number(v);
  if (!isFinite(f)) throw new Error("row " + rid + ": non-numeric " + field + "=" + v);
  return f === Math.floor(f) ? f : f;
}

function schedule_(mastery, today) {
  var halfLife = 1 + (mastery / 100) * 20;
  var effective = mastery; // days_since_practice = 0 at grade time
  var days = Math.max(1, Math.round(halfLife * (effective / 100 + 0.25)));
  var due = new Date(today.getTime());
  due.setDate(due.getDate() + days);
  var iso = Utilities.formatDate(due, "America/New_York", "yyyy-MM-dd");
  return { halfLife: halfLife, days: days, due: iso };
}

function applyPatches_(patches) {
  // Match update_tracker.py: aggregate per unique word, match id then pinyin,
  // clamp mastery, bump seen/correct, set last_practiced and next_due.
  var agg = {};
  var order = [];
  patches.forEach(function (p) {
    var k = norm_(p.id_or_word);
    if (!agg[k]) {
      agg[k] = { word: String(p.id_or_word).replace(/^\s+|\s+$/g, ""), n: 0, delta: 0, correct: 0 };
      order.push(k);
    }
    agg[k].n += 1;
    agg[k].delta += p.delta_points;
    agg[k].correct += p.times_correct_inc;
  });

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_TAB);
  if (!sheet) throw new Error("missing tab " + SHEET_TAB);
  var range = sheet.getDataRange();
  var values = range.getValues();
  if (!values.length) throw new Error("progress sheet is empty");
  var header = values[0].map(function (h) { return String(h); });
  var col = {};
  COLUMNS.forEach(function (c) {
    var i = header.indexOf(c);
    if (i < 0) throw new Error("progress sheet missing column: " + c);
    col[c] = i;
  });

  var today = new Date();
  var unmatched = [];
  order.forEach(function (k) {
    var e = agg[k];
    var idx = -1;
    for (var r = 1; r < values.length; r++) {
      if (norm_(values[r][col.id]) === k) { idx = r; break; }
    }
    if (idx < 0) {
      for (var r2 = 1; r2 < values.length; r2++) {
        if (norm_(values[r2][col.pinyin]) === k) { idx = r2; break; }
      }
    }
    if (idx < 0) {
      unmatched.push(e.word);
      return;
    }
    var row = values[idx];
    var id = row[col.id];
    var before = num_(row[col.mastery], "mastery", id);
    var m = Math.max(0, Math.min(100, before + e.delta));
    m = (m === Math.floor(m)) ? m : Math.round(m * 100) / 100;
    var sched = schedule_(m, today);
    var seen = num_(row[col.times_seen], "times_seen", id) + e.n;
    var correct = num_(row[col.times_correct], "times_correct", id) + e.correct;
    var last = Utilities.formatDate(today, "America/New_York", "yyyy-MM-dd");
    // Write only the updated cells (same set as the tracker).
    sheet.getRange(idx + 1, col.mastery + 1).setValue(String(m));
    sheet.getRange(idx + 1, col.times_seen + 1).setValue(String(seen));
    sheet.getRange(idx + 1, col.times_correct + 1).setValue(String(correct));
    sheet.getRange(idx + 1, col.last_practiced + 1).setValue(last);
    sheet.getRange(idx + 1, col.next_due + 1).setValue(sched.due);
  });
  SpreadsheetApp.flush();
  return { unmatched: unmatched, reason: unmatched.length && order.length === unmatched.length ? "unmatched" : "ok" };
}
