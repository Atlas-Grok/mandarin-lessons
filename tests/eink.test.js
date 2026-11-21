#!/usr/bin/env node
/**
 * E-ink mode persistence + URL override tests
 *   node tests/eink.test.js
 */
"use strict";

const eink = require("../assets/eink.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testParseParam() {
  assert(eink.parseEinkParam("?eink=1") === true);
  assert(eink.parseEinkParam("?eink=0") === false);
  assert(eink.parseEinkParam("?eink=true") === true);
  assert(eink.parseEinkParam("?foo=1") === null);
  assert(eink.parseEinkParam("") === null);
}

function testResolveEnabled() {
  assert(eink.resolveEnabled("?eink=1", false) === true);
  assert(eink.resolveEnabled("?eink=0", true) === false);
  assert(eink.resolveEnabled("", true) === true);
  assert(eink.resolveEnabled("?x=1", false) === false);
}

function testNormalizeNfc() {
  // NFD (decomposed) ü -> NFC precomposed
  const nfd = "nu\u0308"; // combining diaeresis
  const nfc = "n\u00FC";
  assert(eink.normalizeNfc(nfd) === nfc, "NFC normalize ü");
  assert(eink.normalizeNfc("g\u01CE") === "g\u01CE"); // ǎ precomposed
  assert(eink.normalizeNfc(null) === "");
}

function testStorageKey() {
  assert(eink.STORAGE_KEY === "mandarin-eink-mode");
  assert(eink.EINK_CLASS === "eink-mode");
}

function main() {
  const tests = [
    ["parseParam", testParseParam],
    ["resolveEnabled", testResolveEnabled],
    ["normalizeNfc", testNormalizeNfc],
    ["storageKey", testStorageKey],
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

module.exports = { testParseParam, testResolveEnabled, testNormalizeNfc };