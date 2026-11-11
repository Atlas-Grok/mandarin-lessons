/**
 * Published grade report (lessons/<id>/grade.json) — render + fetch helpers.
 * Works in the browser (MandarinReport) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MandarinReport = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STATUS_LABEL = {
    correct: "Correct",
    partial: "Partial",
    wrong: "Wrong",
    skipped: "Skipped",
    voice_graded: "Voice graded"
  };

  var STATUS_POINTS = {
    correct: "+15",
    partial: "+8",
    wrong: "−12",
    skipped: "−5"
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatPoints(pts) {
    if (pts == null || pts !== pts) return "";
    return (pts > 0 ? "+" : "") + pts;
  }

  function statusDisplay(status, points) {
    var label = STATUS_LABEL[status] || status;
    var band = STATUS_POINTS[status];
    var pts = formatPoints(points);
    if (status === "voice_graded") {
      return label + (pts ? " (" + pts + ")" : "");
    }
    if (band && pts) return label + " (" + band + " · " + pts + " pts)";
    if (pts) return label + " (" + pts + " pts)";
    return label;
  }

  function answerDisplay(item) {
    if (item.kind === "voice") return "—";
    var a = item.answer;
    if (a == null || !String(a).trim()) return "—";
    return String(a);
  }

  function promptHtml(item) {
    var en = item.prompt_en;
    var py = item.prompt_py;
    var out = '<span class="rc-prompt-en">' + esc(en || "") + "</span>";
    if (py) {
      out += ' <span class="rc-prompt-bar">|</span> <span class="rc-prompt-py">' + esc(py) + "</span>";
    }
    return out;
  }

  function groupBySection(items) {
    var sections = [];
    var map = Object.create(null);
    (items || []).forEach(function (it) {
      var key = it.section || "";
      if (!map[key]) {
        map[key] = { title: key, items: [] };
        sections.push(map[key]);
      }
      map[key].items.push(it);
    });
    return sections;
  }

  function sortItems(items) {
    return (items || []).slice().sort(function (a, b) {
      function rank(n) {
        var s = String(n == null ? "" : n);
        var m = /^s(\d+)$/i.exec(s);
        if (m) return [1, parseInt(m[1], 10)];
        var num = parseInt(s, 10);
        if (!isNaN(num)) return [0, num];
        return [2, s];
      }
      var ra = rank(a.n), rb = rank(b.n);
      if (ra[0] !== rb[0]) return ra[0] - rb[0];
      if (ra[1] < rb[1]) return -1;
      if (ra[1] > rb[1]) return 1;
      return 0;
    });
  }

  function renderReportItem(item) {
    var st = item.status || "";
    var needsCorrection = item.correction != null && String(item.correction).trim() !== "";
    var parts = [
      '<div class="rc-item rc-status-' + esc(st) + '" data-n="' + esc(item.n) + '">',
      '<div class="rc-item-head">',
      '<span class="rc-n">' + esc(item.n) + ".</span>",
      '<span class="rc-prompt">' + promptHtml(item) + "</span>",
      "</div>",
      '<div class="rc-row"><span class="rc-lbl">Your answer</span> <span class="rc-val rc-answer">' +
        esc(answerDisplay(item)) + "</span></div>",
      '<div class="rc-row"><span class="rc-lbl">Status</span> <span class="rc-val rc-st ' + esc(st) + '">' +
        esc(statusDisplay(st, item.points)) + "</span></div>"
    ];
    if (needsCorrection) {
      parts.push(
        '<div class="rc-row rc-correction"><span class="rc-lbl">Correction</span> <span class="rc-val">' +
          esc(item.correction) + "</span></div>"
      );
    }
    if (item.note) {
      parts.push(
        '<div class="rc-row rc-note"><span class="rc-lbl">Note</span> <span class="rc-val">' +
          esc(item.note) + "</span></div>"
      );
    }
    parts.push("</div>");
    return parts.join("");
  }

  function renderReportCard(grade) {
    if (!grade || !grade.items) return "";
    var items = sortItems(grade.items);
    var sections = groupBySection(items);
    var title =
      "Report card · Lesson " + esc(grade.lesson_number) +
      (grade.title_en ? " · " + esc(grade.title_en) : "");
    var when = grade.graded_at
      ? '<div class="rc-meta">Graded ' + esc(grade.graded_at) + "</div>"
      : "";
    var overall =
      '<div class="rc-totals">' +
      '<div class="rc-score-main">' + esc(grade.score) + " / " + esc(grade.max) + "</div>" +
      '<div class="rc-score-breakdown">' +
      "Written " + esc(grade.written_score) + " / " + esc(grade.written_max) +
      " · Voice " + esc(grade.voice_score) + " / " + esc(grade.voice_max) +
      "</div></div>";
    var body = sections.map(function (sec) {
      var inner = (sec.items || []).map(renderReportItem).join("");
      var h = sec.title
        ? '<h3 class="rc-section-title">' + esc(sec.title) + "</h3>"
        : "";
      return '<div class="rc-section">' + h + inner + "</div>";
    }).join("");

    return (
      '<section class="report-card" aria-labelledby="report-card-title">' +
      '<h2 id="report-card-title" class="report-card-title">' + title + "</h2>" +
      when + overall + body +
      "</section>"
    );
  }

  function gradeUrl(lessonId, base) {
    var prefix = base == null ? "lessons/" : base;
    return prefix + encodeURIComponent(lessonId) + "/grade.json";
  }

  async function fetchGrade(lessonId, opts) {
    opts = opts || {};
    var url = opts.url || gradeUrl(lessonId, opts.base);
    var init = { cache: "no-store" };
    if (opts.signal) init.signal = opts.signal;
    var res = await fetch(url, init);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Could not load grade (" + res.status + ")");
    return res.json();
  }

  async function lessonHasGrade(lessonId, opts) {
    try {
      var g = await fetchGrade(lessonId, opts);
      return g != null;
    } catch (e) {
      return false;
    }
  }

  return {
    esc: esc,
    STATUS_LABEL: STATUS_LABEL,
    statusDisplay: statusDisplay,
    answerDisplay: answerDisplay,
    sortItems: sortItems,
    renderReportItem: renderReportItem,
    renderReportCard: renderReportCard,
    gradeUrl: gradeUrl,
    fetchGrade: fetchGrade,
    lessonHasGrade: lessonHasGrade
  };
});
