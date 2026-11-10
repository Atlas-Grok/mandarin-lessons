/**
 * Faithful port of /workspace/mandarin/grader/grade_practice.py
 * Works in the browser and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MandarinGrade = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PTS = { correct: 15, partial: 8, wrong: -12, skipped: -5 };
  var PUNCT = /[?!.。？！]+$/u;
  var TONE_FROM = "āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ";
  var TONE_TO = "aaaaeeeeiiiioooouuuuvvvvvaaaaeeeeiiiioooouuuuvvvvv";
  var TONE_MAP = Object.create(null);
  for (var ti = 0; ti < TONE_FROM.length; ti++) TONE_MAP[TONE_FROM[ti]] = TONE_TO[ti];
  var TONE_MARKS = { "\u0304": 1, "\u0301": 1, "\u030c": 1, "\u0300": 1 };
  var BOUNDARY = /[\s'’-]/g;
  var NUMBER_SYL = "líng,yí,liǎng,sān,sì,wǔ,liù,qī,bā,jiǔ,shí".split(",");
  var WS_SYL = /([a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+)/g;

  function InputError(message) {
    var err = new Error(message);
    err.name = "InputError";
    err.message = message;
    return err;
  }

  function norm(s) {
    s = String(s).normalize("NFC").trim();
    s = s.replace(/\s+/g, " ").replace(PUNCT, "").trim().toLowerCase();
    return s.replace(/u:/g, "ü").replace(/v/g, "ü");
  }

  function translateTones(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) out += TONE_MAP[s[i]] || s[i];
    return out;
  }

  function stripTones(s) {
    s = translateTones(norm(s)).replace(/ü/g, "v");
    s = s.replace(/[1-5]/g, "");
    return s.replace(BOUNDARY, "");
  }

  function compact(s) {
    return norm(s).replace(BOUNDARY, "");
  }

  function isCombining(ch) {
    return /\p{M}/u.test(ch);
  }

  function toneSignature(s) {
    var out = Object.create(null);
    var pos = -1;
    var nfd = compact(s).normalize("NFD");
    for (var i = 0; i < nfd.length; i++) {
      var ch = nfd[i];
      if (isCombining(ch)) {
        if (TONE_MARKS[ch]) out[pos] = ch;
      } else {
        pos += 1;
      }
    }
    return out;
  }

  function expectedList(it) {
    var ex = it.expected !== undefined ? it.expected : it.expected_any;
    if (ex === undefined || ex === null) return [];
    return (Array.isArray(ex) ? ex : [ex]).map(function (x) { return String(x); });
  }

  function compilePatterns(patterns) {
    try {
      return patterns.map(function (pattern) {
        return new RegExp("^" + "(?:" + pattern + ")$", "i");
      });
    } catch (exc) {
      throw InputError("invalid answer regex: " + exc.message);
    }
  }

  // Use a full-match test that does not wrap patterns already written as
  // a complete expression. Python re.fullmatch is used instead; we emulate
  // it without wrapping so a pattern with ^/$ still works, and so does one
  // without anchors.
  function compilePatternsFull(patterns) {
    try {
      return patterns.map(function (pattern) {
        return new RegExp(pattern, "i");
      });
    } catch (exc) {
      throw InputError("invalid answer regex: " + exc.message);
    }
  }

  function fullmatch(re, s) {
    var m = re.exec(s);
    return !!(m && m.index === 0 && m[0].length === s.length);
  }

  function anyPatterns(it) {
    var rule = it.accept_any;
    var regex = it.regex !== undefined ? it.regex : it.accept_regex;
    if (rule && typeof rule === "object" && !Array.isArray(rule)) {
      if (rule.regex !== undefined) regex = rule.regex;
    }
    if (rule === undefined && typeof it.note === "string" && it.note.toLowerCase().indexOf("any true number") !== -1) {
      rule = "number";
    }
    var variants = Array.isArray(rule) ? rule.map(function (x) { return String(x); }) : [];
    if (rule === "number") {
      var numbers = NUMBER_SYL;
      var templates = expectedList(it);
      templates.forEach(function (template) {
        if (template.indexOf("___") === -1) {
          throw InputError("accept_any: number requires ___ in expected");
        }
        numbers.forEach(function (number) {
          variants.push(template.replace("___", number));
        });
        var digit = "(?:yī|èr|sān|sì|wǔ|liù|qī|bā|jiǔ)";
        var nonone = "(?:èr|sān|sì|wǔ|liù|qī|bā|jiǔ)";
        var ten = "(?:shí(?:" + digit + ")?|" + nonone + "shí(?:" + digit + ")?|" + digit + ")";
        var hundred = "(?:(?:" + digit + "|liǎng)bǎi(?:(?:líng" + digit + ")|" + ten + ")?|" + ten + ")";
        var thousand = "(?:(?:" + digit + "|liǎng)qiān(?:(?:líng" + ten + ")|" + hundred + ")?|" + hundred + ")";
        var wan = "(?:" + thousand + "wàn(?:(?:líng)?" + thousand + "|" + thousand + ")?|" + thousand + ")";
        var count = "(?:líng|yí|liǎng|" + wan + "yì(?:(?:líng)?" + wan + "|" + wan + ")?|" + wan + ")";
        count = count.replace(WS_SYL, "$1\\s*");
        var parts = norm(template).split("___");
        var before = parts[0], after = parts.slice(1).join("___");
        var prefix = before.split(/\s+/).filter(Boolean).map(escapeRe).join("\\s*");
        var suffix = after.split(/\s+/).filter(Boolean).map(escapeRe).join("\\s*");
        if (after.trim().indexOf("gè") === 0) {
          count = "(?!yī\\s*gè|èr\\s*gè)" + count;
        }
        var generated = prefix + "\\s*" + count + "\\s*" + suffix;
        var list = regex === undefined || regex === null ? [] : (typeof regex === "string" ? [regex] : regex.slice());
        list.push(generated);
        regex = list;
      });
    }
    if (rule === true) {
      throw InputError("accept_any: true is unsafe; supply an enum, number, or {regex: ...}");
    }
    var patternSrc = regex === undefined || regex === null ? [] : (Array.isArray(regex) ? regex : [regex]);
    return { variants: variants, patterns: compilePatternsFull(patternSrc) };
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function gradeItem(it, ans, voice) {
    var n = String(it.n);
    var kind = it.kind === undefined ? "free" : it.kind;
    if (kind === "voice") {
      var v = voice && voice[n];
      if (v !== undefined && v !== null) {
        return { n: n, status: "voice_graded", points: v.points, note: v.note === undefined ? null : v.note };
      }
      return { n: n, status: "needs_voice", points: 0, note: "say-it-aloud; not auto-graded" };
    }
    var ap = anyPatterns(it);
    var exp = expectedList(it).filter(function (e) { return e.indexOf("___") === -1; }).concat(ap.variants);
    if (!exp.length && !ap.patterns.length) {
      throw InputError("item " + n + " has no expected");
    }
    if (ans === undefined || ans === null || !String(ans).trim()) {
      return { n: n, status: "skipped", points: PTS.skipped, note: "blank" };
    }
    var a = norm(ans);
    var exps;
    if (kind === "choice") {
      a = a.replace(/^[()\s]+|[()\s]+$/g, "");
      exps = exp.map(function (e) { return norm(e).replace(/^[()\s]+|[()\s]+$/g, ""); });
    } else {
      exps = exp.map(norm);
    }
    var isPinyin = kind !== "choice" && kind !== "english";
    var compactExps = isPinyin ? exps.map(compact) : [];
    var regexHit = ap.patterns.some(function (p) { return fullmatch(p, a); });
    if (exps.indexOf(a) !== -1 || (isPinyin && compactExps.indexOf(compact(a)) !== -1) || regexHit) {
      return { n: n, status: "correct", points: PTS.correct, note: null };
    }
    var matches = [];
    if (isPinyin) {
      var sa = stripTones(a);
      matches = exp.filter(function (e) { return sa === stripTones(e); });
    }
    if (matches.length) {
      var given = toneSignature(a);
      var givenKeys = Object.keys(given);
      var missing = matches.some(function (e) {
        var sig = toneSignature(e);
        var marksOk = givenKeys.every(function (pos) { return sig[pos] === given[pos]; });
        return marksOk && !/[1-5]/.test(a);
      });
      var error = missing ? "missing_tones" : "tone_error";
      return {
        n: n,
        status: "partial",
        points: PTS.partial,
        error: error,
        note: missing ? "missing tones" : "tone_error: wrong or misplaced tone mark"
      };
    }
    return { n: n, status: "wrong", points: PTS.wrong, note: "expected: " + (exp.join(" / ") || "key regex") };
  }

  function loadVoice(v) {
    if (v === undefined || v === null) return {};
    if (typeof v === "object" && Array.isArray(v.items)) {
      var mapped = {};
      v.items.forEach(function (x) {
        if (x && typeof x === "object") mapped[String(x.n)] = x;
      });
      v = mapped;
    }
    if (typeof v !== "object" || Array.isArray(v)) {
      throw InputError("voice results must be a mapping or {items: [...]}");
    }
    var out = {};
    Object.keys(v).forEach(function (k) {
      var x = v[k];
      if (!x || typeof x !== "object" || typeof x.points !== "number" || x.points !== x.points) {
        throw InputError("voice result " + k + " needs numeric points");
      }
      out[String(k)] = x;
    });
    return out;
  }

  function grade(key, sub, vres) {
    var items = (key && key.items) || [];
    var answers = {};
    var raw = (sub && sub.answers) || {};
    Object.keys(raw).forEach(function (k) { answers[String(k)] = raw[k]; });
    var res = [], patches = [], voice = [];
    items.forEach(function (it) {
      var r = gradeItem(it, answers[String(it.n)], vres);
      res.push(r);
      if (r.status === "needs_voice") {
        voice.push(r.n);
        return;
      }
      var words = it.words;
      if (r.status === "voice_graded") {
        (words || []).forEach(function (w) {
          patches.push({
            id_or_word: w,
            delta_points: r.points,
            times_correct_inc: r.points >= PTS.correct ? 1 : 0
          });
        });
        return;
      }
      if (words === undefined && it.kind === "pinyin") {
        words = expectedList(it).slice(0, 1);
      }
      (words || []).forEach(function (w) {
        patches.push({
          id_or_word: w,
          delta_points: r.points,
          times_correct_inc: r.status === "correct" ? 1 : 0
        });
      });
    });
    var scored = res.filter(function (r) { return r.status !== "needs_voice"; });
    var score = 0;
    scored.forEach(function (r) { score += r.points; });
    var mx = PTS.correct * scored.length;
    return { items: res, sheet_patches: patches, needs_voice: voice, score: score, max: mx };
  }

  function summary(ln, score, mx, res, voice) {
    var c = { correct: 0, partial: 0, wrong: 0, skipped: 0 };
    res.forEach(function (r) { if (c[r.status] !== undefined) c[r.status] += 1; });
    var L = [
      "**Lesson " + ln + " Practice — " + score + " / " + mx + "**",
      "✅ " + c.correct + " correct · 🟡 " + c.partial + " partial · ❌ " + c.wrong + " wrong · ⏭ " + c.skipped + " skipped",
      ""
    ];
    res.forEach(function (r) {
      if (r.status === "partial" || r.status === "wrong" || r.status === "skipped") {
        L.push("- #" + r.n + " " + r.status + " (" + (r.points > 0 ? "+" : "") + r.points + ")" + (r.note ? " — " + r.note : ""));
      }
    });
    var vg = res.filter(function (r) { return r.status === "voice_graded"; });
    if (vg.length || (voice && voice.length)) {
      L.push("\n**🎤 Voice**");
      vg.forEach(function (r) {
        L.push("- #" + r.n + " " + (r.points > 0 ? "+" : "") + r.points + (r.note ? " — " + r.note : ""));
      });
      if (voice && voice.length) {
        L.push("- Not yet graded (excluded from score): " + voice.join(", "));
      }
    }
    return L.join("\n").replace(/\s+$/, "") + "\n";
  }

  function gradeLesson(lesson, answers, vres) {
    var key = lesson && lesson.answer_key;
    if (!key || typeof key !== "object") throw InputError("no answer_key mapping in lesson");
    var sub = { lesson_number: lesson.lesson_number, answers: answers || {} };
    var voice = vres ? loadVoice(vres) : undefined;
    var out = grade(key, sub, voice);
    out.lesson_number = sub.lesson_number;
    out.summary_md = summary(out.lesson_number, out.score, out.max, out.items, out.needs_voice);
    return out;
  }

  return {
    PTS: PTS,
    InputError: InputError,
    norm: norm,
    stripTones: stripTones,
    compact: compact,
    toneSignature: toneSignature,
    expectedList: expectedList,
    anyPatterns: anyPatterns,
    gradeItem: gradeItem,
    loadVoice: loadVoice,
    grade: grade,
    summary: summary,
    gradeLesson: gradeLesson
  };
});
