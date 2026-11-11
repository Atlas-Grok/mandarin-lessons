#!/usr/bin/env node
/**
 * Report card rendering tests against tests/fixtures/grade-l11.json
 *   node tests/report.test.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const report = require("../assets/report.js");

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "grade-l11.json"), "utf8")
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testAnswerDisplay() {
  assert(report.answerDisplay({ kind: "pinyin", answer: "black" }) === "black");
  assert(report.answerDisplay({ kind: "pinyin", answer: "" }) === "—");
  assert(report.answerDisplay({ kind: "pinyin", answer: "  " }) === "—");
  assert(report.answerDisplay({ kind: "voice", answer: null }) === "—");
}

function testSortItems() {
  const sorted = report.sortItems(fixture.items).map((x) => x.n);
  assert(JSON.stringify(sorted) === JSON.stringify(["1", "7", "8", "13", "S1"]), sorted);
}

function testRenderReportCard() {
  const html = report.renderReportCard(fixture);
  assert(html.includes("report-card"), "missing report-card");
  assert(html.includes("152 / 315"), "missing overall score");
  assert(html.includes("Written 128 / 270"), "missing written");
  assert(html.includes("Voice 24 / 45"), "missing voice");
  assert(html.includes("A · Matching"), "missing section");
  assert(html.includes("Your answer"), "missing answer label");
  assert(html.includes("black"), "missing answer text");
  assert(html.includes("Correction"), "missing correction label");
  assert(html.includes("báisè"), "missing correction text");
  assert(html.includes("tone: first instead of second"), "missing note");
  assert(html.includes("rc-status-correct"), "missing correct class");
  assert(!html.includes("<script"), "unexpected script");
  const m = html.match(/data-n="1"[\s\S]*?<\/div>\s*<\/div>/);
  assert(m && !m[0].includes("rc-correction"), "correct item should not show correction row");
}

function testStatusDisplay() {
  assert(report.statusDisplay("correct", 15).includes("Correct"));
  assert(report.statusDisplay("voice_graded", 8).includes("Voice graded"));
}

function main() {
  const tests = [
    ["answerDisplay", testAnswerDisplay],
    ["sortItems", testSortItems],
    ["renderReportCard", testRenderReportCard],
    ["statusDisplay", testStatusDisplay],
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

module.exports = { testAnswerDisplay, testSortItems, testRenderReportCard };
