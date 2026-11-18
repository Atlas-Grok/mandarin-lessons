#!/usr/bin/env node
/**
 * Extra grading cases (tone + regex, ü/v, open items) beyond vectors.json.
 *   node tests/grade_extra.test.js
 */
"use strict";

const grade = require("../assets/grade.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const l14_14 = {
  n: "14",
  kind: "sentence",
  expected: ["Wǒ chī píngguǒ."],
  regex: "wǒ\\s*chī\\s*\\S.*",
  words: ["chī"],
};

const l14_15 = {
  n: "15",
  kind: "sentence",
  expected: ["Wǒ hē shuǐ."],
  regex: "wǒ\\s*hē\\s*\\S.*",
  words: ["hē"],
};

function testL14ToneRegex() {
  const missingPing = grade.gradeItem(l14_14, "wǒ chī pingguǒ");
  assert(missingPing.status === "partial", "missing tone on píng: " + missingPing.status);
  assert(missingPing.points === 8, "points " + missingPing.points);

  const wrongShui = grade.gradeItem(l14_15, "wǒ hē shuí");
  assert(wrongShui.status === "partial", "wrong tone shuí: " + wrongShui.status);

  const full = grade.gradeItem(l14_14, "Wǒ  chī  píngguǒ.");
  assert(full.status === "correct", "spacing only: " + full.status);
  assert(full.points === 15, "full credit spacing");

  const correct = grade.gradeItem(l14_14, "Wǒ chī píngguǒ.");
  assert(correct.status === "correct", "exact match");
}

function testUv() {
  const item = { n: "1", kind: "pinyin", expected: ["nǚ"] };
  assert(grade.gradeItem(item, "nǚ").status === "correct", "ü literal");
  assert(grade.gradeItem(item, "nv").status === "partial", "v ≡ ü but tone required");
  assert(grade.norm("Nu:") === grade.norm("nü"), "u: ≡ ü in normalization");
  assert(grade.gradeItem(item, "nǘ").status === "partial", "wrong tone on ü");
}

function testOpenItem() {
  const key = {
    items: [
      { n: "7", kind: "open", model_answer_en: "I like cats.", model_answer_py: "Wǒ xǐhuan māo." },
      { n: "S1", kind: "voice", words: ["māo"] },
    ],
  };
  const sub = { lesson_number: 1, answers: { 7: "Wǒ xǐhuan gǒu." } };
  const g = grade.grade(key, sub);
  const row = g.items.find((r) => r.n === "7");
  assert(row.status === "pending_mei", "open pending");
  assert(row.points === 0, "open not auto-scored");
  assert(g.score === 0, "score excludes open");
  assert(g.max === 0, "max excludes open and voice");

  const blank = grade.gradeItem(key.items[0], "");
  assert(blank.status === "skipped", "blank open skipped");
}

function main() {
  const tests = [
    ["l14_tone_regex", testL14ToneRegex],
    ["uv", testUv],
    ["open", testOpenItem],
  ];
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      fn();
      console.log("ok", name);
    } catch (err) {
      failed += 1;
      console.error("FAIL", name, err.message);
    }
  }
  console.log(failed ? failed + " failed" : "all passed");
  if (failed) process.exit(1);
}

if (require.main === module) main();

module.exports = { testL14ToneRegex, testUv, testOpenItem };