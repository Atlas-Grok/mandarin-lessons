#!/usr/bin/env node
/**
 * Compare the JS grade port with vectors.json produced by the Python grader.
 *   node tests/grade.test.js
 * Or: node --test tests/grade.test.js  (same script, node:test optional)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const grade = require("../assets/grade.js");

const vectors = JSON.parse(
  fs.readFileSync(path.join(__dirname, "vectors.json"), "utf8")
);

function unstableError(msg) {
  return (
    typeof msg === "string" &&
    (/^invalid answer regex:/.test(msg) ||
      /^voice result /.test(msg) ||
      /^voice results must be/.test(msg))
  );
}

function sameError(py, js) {
  if (py === js) return true;
  if (unstableError(py) && unstableError(js)) {
    return py.split(":")[0] === js.split(":")[0] || py.slice(0, 20) === js.slice(0, 20);
  }
  // Python "invalid answer regex: ..." vs JS equivalent prefix
  if (/^invalid answer regex:/.test(py) && /^invalid answer regex:/.test(js)) return true;
  return false;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fail(name, detail) {
  return { name, ok: false, detail };
}

function checkItem(vec) {
  let got;
  try {
    got = { ok: true, value: grade.gradeItem(vec.item, vec.answer, vec.voice) };
  } catch (err) {
    got = { ok: false, error: err && err.message ? err.message : String(err) };
  }
  if (vec.ok !== got.ok) {
    return fail(vec.name, `ok mismatch: python=${vec.ok} js=${got.ok} py=${JSON.stringify(vec.error || vec.value)} js=${JSON.stringify(got.error || got.value)}`);
  }
  if (!vec.ok) {
    if (!sameError(vec.error, got.error)) {
      return fail(vec.name, `error mismatch:\n  py: ${vec.error}\n  js: ${got.error}`);
    }
    return { name: vec.name, ok: true };
  }
  if (!deepEqual(vec.value, got.value)) {
    return fail(vec.name, `value mismatch:\n  py: ${JSON.stringify(vec.value)}\n  js: ${JSON.stringify(got.value)}`);
  }
  return { name: vec.name, ok: true };
}

function checkGrade(vec) {
  let got;
  try {
    const voice = vec.vres != null ? grade.loadVoice(vec.vres) : undefined;
    const g = grade.grade(vec.key, vec.sub, voice);
    const md = grade.summary(
      (vec.sub && vec.sub.lesson_number) || (vec.key && vec.key.lesson_number),
      g.score,
      g.max,
      g.items,
      g.needs_voice
    );
    got = {
      ok: true,
      value: {
        items: g.items,
        sheet_patches: g.sheet_patches,
        needs_voice: g.needs_voice,
        score: g.score,
        max: g.max,
        summary_md: md,
      },
    };
  } catch (err) {
    got = { ok: false, error: err && err.message ? err.message : String(err) };
  }
  if (vec.ok !== got.ok) {
    return fail(vec.name, `ok mismatch: python=${vec.ok} js=${got.ok} py=${JSON.stringify(vec.error || vec.value)} js=${JSON.stringify(got.error || got.value)}`);
  }
  if (!vec.ok) {
    if (!sameError(vec.error, got.error)) {
      return fail(vec.name, `error mismatch:\n  py: ${vec.error}\n  js: ${got.error}`);
    }
    return { name: vec.name, ok: true };
  }
  if (!deepEqual(vec.value, got.value)) {
    return fail(vec.name, `value mismatch:\n  py: ${JSON.stringify(vec.value, null, 2)}\n  js: ${JSON.stringify(got.value, null, 2)}`);
  }
  return { name: vec.name, ok: true };
}

function main() {
  const results = [];
  for (const vec of vectors.grade_item) results.push(checkItem(vec));
  for (const vec of vectors.grade) results.push(checkGrade(vec));
  const failed = results.filter((r) => !r.ok);
  const passed = results.length - failed.length;
  for (const f of failed) {
    console.error("FAIL", f.name);
    console.error(f.detail);
    console.error("");
  }
  console.log(`${passed} passed, ${failed.length} failed, ${results.length} total`);
  if (failed.length) process.exit(1);
}

if (require.main === module) main();

module.exports = { checkItem, checkGrade, main };
