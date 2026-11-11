(function () {
  "use strict";

  var RED = "#b91c1c";
  var BLUE = "#1d4ed8";
  var INK = "#374151";
  var MUTED = "#9ca3af";
  var CALLOUT = { tip: 1, bonus: 1, pattern: 1, tone: 1, note: 1 };
  var BANNER = { info: 1, success: 1, warn: 1 };
  var MAX_SECONDS = 20;
  var AUDIO_BITRATE = 24000;
  var lesson = null;
  var lessonId = "";
  var recorders = {}; // n -> {blob, mime, url}

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function nl(s) { return esc(s).replace(/\n/g, "<br>"); }

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function pairHtml(en, py, sizeClass) {
    var out = '<span class="en">' + esc(en) + "</span>";
    if (py) {
      out += ' <span class="bar">|</span> <span class="py">' + esc(py) + "</span>";
    }
    return '<span class="pair ' + (sizeClass || "") + '">' + out + "</span>";
  }

  function bilingual(en, py) {
    var out = '<div class="bilingual">';
    if (en) out += '<p class="' + (py ? "" : "solo") + '">' + nl(en) + "</p>";
    if (py) out += '<p class="py-line">' + nl(py) + "</p>";
    out += "</div>";
    return en || py ? out : "";
  }

  function audioSrc(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url) || url.charAt(0) === "/" || url.indexOf("lessons/") === 0) return url;
    return "lessons/" + encodeURIComponent(lessonId) + "/" + url.split("/").map(encodeURIComponent).join("/");
  }

  var LISTEN_ICONS =
    '<span class="listen-icon" aria-hidden="true">' +
      '<svg class="listen-ico listen-ico-play" viewBox="0 0 12 12" width="12" height="12" focusable="false">' +
        '<path d="M3.2 1.6v8.8L10.4 6 3.2 1.6z" fill="currentColor"></path>' +
      "</svg>" +
      '<svg class="listen-ico listen-ico-wave" viewBox="0 0 14 12" width="14" height="12" focusable="false">' +
        '<rect class="w1" x="1" y="4" width="2.2" height="4" rx="1" fill="currentColor"></rect>' +
        '<rect class="w2" x="5.4" y="2" width="2.2" height="8" rx="1" fill="currentColor"></rect>' +
        '<rect class="w3" x="9.8" y="3.2" width="2.2" height="5.6" rx="1" fill="currentColor"></rect>' +
      "</svg>" +
    "</span>";

  function spokenLabel(text) {
    if (!text) return "";
    var t = String(text).trim();
    if (!t || t === "?") return "";
    return t;
  }

  function listenBtn(url, opts) {
    if (!url) return "";
    if (typeof opts === "string") opts = { text: opts };
    opts = opts || {};
    var src = audioSrc(url);
    var text = spokenLabel(opts.text);
    var compact = !!opts.compact || !text;
    var aria = text ? "Listen: " + text : "Listen";
    var cls = "listen" + (compact ? " compact" : "");
    var tail = '<svg class="listen-tail" viewBox="0 0 36 20" width="36" height="20" aria-hidden="true" focusable="false">' +
      '<path d="M8 0 L23 0 L23 7 C18.5 11 10.5 14.6 2.1 16.6 C1.05 16.95 0.95 15.55 2.3 15.15 C8.2 13 9.2 9 8 0 Z"></path>' +
      "</svg>";
    var bubble = '<span class="listen-shape">' +
      '<span class="listen-bubble">' + LISTEN_ICONS +
      (compact ? "" : '<span class="listen-text">' + esc(text) + "</span>") +
      "</span>" + tail + "</span>";
    return '<button type="button" class="' + cls + '" data-src="' + esc(src) +
      '" aria-label="' + esc(aria) + '">' +
      bubble +
      '<img class="listen-avatar" src="assets/logo.png" alt="" width="20" height="20">' +
      "</button>";
  }

  function ensureListenFilters() {
    if (document.getElementById("listen-outline")) return;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "listen-filters");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.innerHTML =
      "<defs>" +
        '<filter id="listen-outline" x="-50%" y="-80%" width="200%" height="260%" color-interpolation-filters="sRGB">' +
          '<feMorphology in="SourceAlpha" operator="dilate" radius="1" result="dilated"></feMorphology>' +
          '<feFlood flood-color="#b07848" result="color"></feFlood>' +
          '<feComposite in="color" in2="dilated" operator="in" result="outline"></feComposite>' +
          "<feMerge><feMergeNode in=\"outline\"></feMergeNode><feMergeNode in=\"SourceGraphic\"></feMergeNode></feMerge>" +
        "</filter>" +
        '<filter id="listen-outline-mint" x="-80%" y="-80%" width="260%" height="280%" color-interpolation-filters="sRGB">' +
          '<feMorphology in="SourceAlpha" operator="dilate" radius="1" result="dilated"></feMorphology>' +
          '<feFlood flood-color="#4cf0a0" result="color"></feFlood>' +
          '<feComposite in="color" in2="dilated" operator="in" result="outline"></feComposite>' +
          "<feMerge><feMergeNode in=\"outline\"></feMergeNode><feMergeNode in=\"SourceGraphic\"></feMergeNode></feMerge>" +
        "</filter>" +
      "</defs>";
    document.body.insertBefore(svg, document.body.firstChild);
  }

  function callout(block, fallbackKind) {
    var kind = block.kind || fallbackKind || "note";
    if (!CALLOUT[kind]) kind = "note";
    var inner = "";
    if (block.title) inner += '<div class="boxtitle" style="color:inherit;">' + esc(block.title) + "</div>";
    inner += bilingual(block.body_en, block.body_py);
    (block.pairs || []).forEach(function (p) {
      inner += '<div style="margin:4px 0;">' + pairHtml(p.en, p.py, "pair-sm") + listenBtn(p.listen_url, { text: p.py }) + "</div>";
    });
    return '<div class="box ' + kind + '">' + inner + "</div>";
  }

  function blockHtml(block) {
    var t = block.type;
    if (t === "heading") return '<h2 class="block-h">' + esc(block.text) + "</h2>";
    if (t === "vocab_card") {
      var inner = "<div>" + pairHtml(block.en, block.py, "pair-lg") + listenBtn(block.listen_url, { text: block.py }) + "</div>";
      if (block.note_en || block.note_py) {
        inner += '<div class="notes">' + bilingual(block.note_en, block.note_py) + "</div>";
      }
      return '<div class="vocab">' + inner + "</div>";
    }
    if (t === "callout") return callout(block);
    if (t === "paragraph") return bilingual(block.en, block.py);
    if (t === "example") {
      var label = block.n != null ? '<span class="ex-n">' + esc(block.n) + ".</span> " : "";
      return '<div class="example">' + label + pairHtml(block.en, block.py) + listenBtn(block.listen_url, { text: block.py }) + "</div>";
    }
    if (t === "review_table") {
      var rows = (block.rows || []).map(function (row) {
        return "<tr><td>" + pairHtml(row.en, row.py, "pair-sm") + "</td>" +
          '<td class="tip">' + esc(row.tip) + "</td>" +
          '<td class="listen">' + listenBtn(row.listen_url, { text: row.py, compact: true }) + "</td></tr>";
      }).join("");
      return '<table class="review" role="presentation">' + rows + "</table>";
    }
    return "";
  }

  function pictureHtml(picture) {
    if (!picture) return "";
    var inner = '<div class="boxtitle" style="color:#15803d;">📷 ' + esc(picture.title || "Open today’s picture") + "</div>";
    if (picture.drive_url) {
      inner += '<div style="margin-top:4px;"><a href="' + esc(picture.drive_url) + '" style="color:' + BLUE + ';">' +
        esc(picture.filename || picture.drive_url) + "</a></div>";
    } else if (picture.filename) {
      inner += '<div style="margin-top:4px;">' + esc(picture.filename) + "</div>";
    }
    if (picture.caption) {
      inner += '<div style="font-size:14px;color:#6b7280;margin-top:4px;">' + esc(picture.caption) + "</div>";
    }
    return '<div class="box note">' + inner + "</div>";
  }

  function headerHtml(L) {
    var h = "<h1>Lesson " + esc(L.lesson_number) + " · " + esc(L.title_en) + "</h1>";
    if (L.title_py) h += '<div class="title-py">' + esc(L.title_py) + "</div>";
    var meta = [];
    if (L.category) meta.push(String(L.category));
    if (L.hsk != null) meta.push("HSK " + L.hsk);
    if (meta.length) h += '<div class="meta">' + esc(meta.join(" · ")) + "</div>";
    if (L.auditory_note) h += '<div class="auditory">🔊 ' + esc(L.auditory_note) + "</div>";
    return h;
  }

  function isSay(item) {
    return item.type === "say" || (item.n && /^s\d+$/i.test(String(item.n)));
  }

  function itemHtml(item) {
    var n = item.n;
    var say = isSay(item);
    var prompt = '<div class="item-prompt"><span class="item-n">' + esc(n) + ".</span> ";
    if (say) prompt += "🎤 ";
    prompt += pairHtml(item.prompt_en, item.prompt_py) + listenBtn(item.listen_url, { text: item.prompt_py || item.prompt_en }) + "</div>";
    var parts = ['<div class="item" data-n="' + esc(n) + '" id="item-' + esc(n) + '">', prompt];
    if (item.unscramble) parts.push('<div class="unscramble">' + esc(item.unscramble) + "</div>");
    if (item.hint) parts.push('<div class="hint">' + esc(item.hint) + "</div>");
    if (say) {
      parts.push(
        '<div class="recorder" data-n="' + esc(n) + '">' +
          '<div class="row">' +
            '<button type="button" class="rec-btn rec-start">Record</button>' +
            '<button type="button" class="rec-btn secondary rec-stop" disabled>Stop</button>' +
            '<button type="button" class="rec-btn secondary rec-play" disabled>Play</button>' +
            '<button type="button" class="rec-btn secondary rec-redo" disabled>Re-record</button>' +
            '<span class="rec-timer">0s</span>' +
          "</div>" +
          '<div class="rec-status">Each clip stops at ' + MAX_SECONDS + " seconds. Voice is not auto-graded.</div>" +
        "</div>"
      );
    } else {
      var longForm = item.type === "unscramble" || item.type === "about_you" || item.type === "sentence";
      parts.push('<div class="answer-box"><label for="ans-' + esc(n) + '">Your answer</label>');
      if (longForm) {
        parts.push('<textarea id="ans-' + esc(n) + '" name="ans-' + esc(n) + '" rows="2" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>');
      } else {
        parts.push('<input id="ans-' + esc(n) + '" name="ans-' + esc(n) + '" type="text" autocomplete="off" autocapitalize="off" spellcheck="false">');
      }
      parts.push("</div>");
    }
    parts.push('<div class="item-feedback" hidden></div>');
    parts.push("</div>");
    return parts.join("");
  }

  function bodyHtml(L) {
    var html = "";
    if (L.banner) {
      var k = L.banner.kind || "info";
      if (!BANNER[k]) k = "info";
      var inner = L.banner.title_en ? '<div class="boxtitle">' + esc(L.banner.title_en) + "</div>" : "";
      html += '<div class="box ' + k + '">' + inner + bilingual(L.banner.body_en, L.banner.body_py) + "</div>";
    }
    var teach = L.teach || {};
    html += '<h2 class="teach">📖 Teach</h2>';
    html += bilingual((teach.intro || {}).en, (teach.intro || {}).py);
    (teach.blocks || []).forEach(function (b) { html += blockHtml(b); });

    var practice = L.practice || {};
    if (practice && (practice.sections || []).length) {
      html += '<h2 class="practice">✏️ Practice</h2>';
      var how = practice.how_to || "Type your answers in the boxes, record the 🎤 items, then tap Submit.";
      html += '<div class="box pattern"><div class="boxtitle" style="color:' + BLUE + ';">How to answer</div>' + nl(how) + "</div>";
      var pictureDone = false;
      (practice.sections || []).forEach(function (section) {
        html += "<h3>" + esc(section.title || "") + "</h3>";
        if (section.intro_callout) {
          var ic = Object.assign({ kind: "pattern" }, section.intro_callout);
          html += callout(ic, "pattern");
        }
        if (section.options_line) html += '<div class="options-line">' + esc(section.options_line) + "</div>";
        (section.items || []).forEach(function (item) {
          if (item.type === "picture" && L.picture_note && !pictureDone) {
            html += pictureHtml(L.picture_note);
            pictureDone = true;
          }
          html += itemHtml(item);
        });
      });
      if (L.picture_note && !pictureDone) html += pictureHtml(L.picture_note);
    }
    html += '<div class="submit-row">' +
      '<button type="button" class="primary" id="submit-btn">Submit</button>' +
      '<button type="button" class="linkish" id="download-btn" hidden>Download submission.json</button>' +
      "</div>";
    html += '<div id="results" class="results" hidden></div>';
    html += '<div id="submit-msg" class="submit-msg" hidden></div>';
    if (L.closing) {
      html += '<div class="closing">' + bilingual(L.closing.en, L.closing.py) + "</div>";
    }
    html += '<div class="signoff">— Mei</div>';
    return html;
  }

  function collectPracticeItems(L) {
    var out = [];
    (((L.practice || {}).sections) || []).forEach(function (s) {
      (s.items || []).forEach(function (it) { out.push(it); });
    });
    return out;
  }

  function setListenState(btn, playing) {
    btn.classList.toggle("playing", playing);
    var idle = btn.getAttribute("data-idle-label") || btn.getAttribute("aria-label") || "Listen";
    if (!btn.getAttribute("data-idle-label")) btn.setAttribute("data-idle-label", idle);
    if (playing) {
      btn.setAttribute("aria-label", idle.replace(/^Listen/, "Stop"));
    } else {
      btn.setAttribute("aria-label", idle);
    }
  }

  function bindListen(root) {
    var current = null;
    root.querySelectorAll("button.listen").forEach(function (btn) {
      if (!btn.getAttribute("data-idle-label")) {
        btn.setAttribute("data-idle-label", btn.getAttribute("aria-label") || "Listen");
      }
      var audio = new Audio();
      audio.preload = "none";
      audio.src = btn.getAttribute("data-src");
      audio.addEventListener("ended", function () {
        setListenState(btn, false);
        if (current === audio) current = null;
      });
      btn.addEventListener("click", function () {
        if (current && current !== audio) {
          current.pause();
          current.currentTime = 0;
          root.querySelectorAll("button.listen.playing").forEach(function (b) {
            setListenState(b, false);
          });
        }
        if (btn.classList.contains("playing")) {
          audio.pause();
          audio.currentTime = 0;
          setListenState(btn, false);
          current = null;
        } else {
          audio.play().catch(function () {
            setListenState(btn, false);
            btn.setAttribute(
              "aria-label",
              (btn.getAttribute("data-idle-label") || "Listen") + " (couldn't play)"
            );
          });
          setListenState(btn, true);
          current = audio;
        }
      });
    });
  }

  function pickMime() {
    if (typeof MediaRecorder === "undefined") return "";
    var candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg"
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return "";
  }

  function bindRecorders(root) {
    root.querySelectorAll(".recorder").forEach(function (el) {
      var n = el.getAttribute("data-n");
      var start = el.querySelector(".rec-start");
      var stop = el.querySelector(".rec-stop");
      var play = el.querySelector(".rec-play");
      var redo = el.querySelector(".rec-redo");
      var timer = el.querySelector(".rec-timer");
      var status = el.querySelector(".rec-status");
      var playback = document.createElement("audio");
      playback.controls = true;
      playback.hidden = true;
      el.appendChild(playback);

      var rec = null, chunks = [], tick = null, startedAt = 0, stream = null;

      function setIdle(hasClip) {
        start.disabled = hasClip;
        stop.disabled = true;
        play.disabled = !hasClip;
        redo.disabled = !hasClip;
        start.textContent = "Record";
      }

      function clearTick() {
        if (tick) { window.clearInterval(tick); tick = null; }
      }

      function stopRec() {
        if (rec && rec.state !== "inactive") rec.stop();
      }

      start.addEventListener("click", async function () {
        if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
          status.textContent = "Recording isn’t available in this browser. Try Chrome or Safari on your phone.";
          return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          status.textContent = "Microphone permission was denied.";
          return;
        }
        chunks = [];
        var mime = pickMime();
        var opts = { audioBitsPerSecond: AUDIO_BITRATE };
        if (mime) opts.mimeType = mime;
        rec = mime ? new MediaRecorder(stream, opts) : new MediaRecorder(stream, { audioBitsPerSecond: AUDIO_BITRATE });
        rec.addEventListener("dataavailable", function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); });
        rec.addEventListener("stop", function () {
          clearTick();
          if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
          stream = null;
          var type = rec.mimeType || mime || "audio/webm";
          var blob = new Blob(chunks, { type: type });
          if (recorders[n] && recorders[n].url) URL.revokeObjectURL(recorders[n].url);
          var url = URL.createObjectURL(blob);
          recorders[n] = { blob: blob, mime: type, url: url };
          playback.src = url;
          playback.hidden = false;
          timer.textContent = "…";
          // show actual duration once metadata loads
          playback.onloadedmetadata = function () {
            if (isFinite(playback.duration)) timer.textContent = Math.round(playback.duration) + "s";
          };
          status.textContent = "Saved. You can play it back or re-record.";
          setIdle(true);
        });
        startedAt = Date.now();
        rec.start();
        start.disabled = true;
        stop.disabled = false;
        play.disabled = true;
        redo.disabled = true;
        start.textContent = "Recording…";
        status.textContent = "Recording… tap Stop when you’re done.";
        clearTick();
        tick = window.setInterval(function () {
          var s = Math.floor((Date.now() - startedAt) / 1000);
          timer.textContent = s + "s";
          if (s >= MAX_SECONDS) stopRec();
        }, 200);
      });

      stop.addEventListener("click", stopRec);
      play.addEventListener("click", function () {
        if (playback.src) {
          playback.hidden = false;
          playback.play();
        }
      });
      redo.addEventListener("click", function () {
        if (recorders[n] && recorders[n].url) URL.revokeObjectURL(recorders[n].url);
        delete recorders[n];
        playback.removeAttribute("src");
        playback.hidden = true;
        timer.textContent = "0s";
        status.textContent = "Ready to record again.";
        setIdle(false);
      });
    });
  }

  function collectAnswers() {
    var answers = {};
    collectPracticeItems(lesson).forEach(function (it) {
      if (isSay(it)) return;
      var el = document.getElementById("ans-" + it.n);
      answers[String(it.n)] = el ? el.value : "";
    });
    return answers;
  }

  function showItemFeedback(resultItems) {
    (resultItems || []).forEach(function (r) {
      var box = document.getElementById("item-" + r.n);
      if (!box) return;
      box.classList.remove("correct", "partial", "wrong", "skipped", "needs_voice", "voice_graded");
      var cls = r.status === "needs_voice" || r.status === "voice_graded" ? r.status : r.status;
      if (r.status) box.classList.add(r.status);
      var fb = box.querySelector(".item-feedback");
      if (!fb) return;
      var label = {
        correct: "✅ Correct (+15)",
        partial: "🟡 Partial (+8)" + (r.note ? " — " + r.note : ""),
        wrong: "❌ Wrong (−12)" + (r.note ? " — " + r.note : ""),
        skipped: "⏭ Skipped (−5)",
        needs_voice: "🎤 Saved for Mei (not auto-graded)",
        voice_graded: "🎤 Graded (" + (r.points > 0 ? "+" : "") + r.points + ")"
      }[r.status] || r.status;
      if (r.status === "needs_voice") {
        label = recorders[r.n]
          ? "🎤 Recorded — Mei will grade this"
          : "🎤 No clip yet — you can still submit; Mei will see it as pending";
      }
      fb.textContent = label;
      fb.hidden = false;
      fb.className = "item-feedback " + r.status;
    });
  }

  function resultsCard(out) {
    var el = document.getElementById("results");
    var c = { correct: 0, partial: 0, wrong: 0, skipped: 0 };
    (out.items || []).forEach(function (r) { if (c[r.status] != null) c[r.status] += 1; });
    var voice = out.needs_voice || [];
    el.hidden = false;
    el.innerHTML =
      "<h2>Lesson " + esc(out.lesson_number) + " Practice — " + esc(out.score) + " / " + esc(out.max) + "</h2>" +
      '<div class="tally">✅ ' + c.correct + " correct · 🟡 " + c.partial + " partial · ❌ " +
      c.wrong + " wrong · ⏭ " + c.skipped + " skipped</div>" +
      (voice.length
        ? "<p>🎤 Voice items (not in the written score): " + esc(voice.join(", ")) +
          (Object.keys(recorders).length ? " — clips attached." : " — no clips recorded yet.") + "</p>"
        : "") +
      "<p>Written answers are scored instantly. Mei reviews the voice memos separately.</p>";
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function setMsg(text, kind) {
    var el = document.getElementById("submit-msg");
    el.hidden = !text;
    el.textContent = text || "";
    el.className = "submit-msg" + (kind ? " " + kind : "");
  }

  function lastPayload() { return window.__mandarinLastPayload || null; }

  function downloadJson(obj, name) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name || "submission.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var s = String(reader.result || "");
        var i = s.indexOf(",");
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function buildPayload(out, answers) {
    var audio = {};
    var mimeTypes = {};
    var keys = Object.keys(recorders);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      audio[k] = await blobToBase64(recorders[k].blob);
      mimeTypes[k] = recorders[k].mime;
    }
    return {
      lessonId: lessonId,
      lesson_number: lesson.lesson_number,
      answers: answers,
      clientGrade: {
        score: out.score,
        max: out.max,
        items: out.items,
        sheet_patches: out.sheet_patches,
        needs_voice: out.needs_voice,
        summary_md: out.summary_md
      },
      sheet_ops: out.sheet_patches,
      audio: audio,
      mimeTypes: mimeTypes
    };
  }

  async function submitToServer(payload) {
    var cfg = window.MANDARIN_CONFIG || {};
    var url = (cfg.SUBMIT_URL || "").trim();
    if (!url) return { skipped: true };
    try {
      var res = await fetch(url, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      // Readable if the script returns text/plain and CORS happens to allow it.
      var text = await res.text();
      try {
        return { skipped: false, delivered: true, body: JSON.parse(text), status: res.status };
      } catch (e) {
        return { skipped: false, delivered: true, body: null, status: res.status, text: text };
      }
    } catch (err) {
      // text/plain POSTs are "simple" requests: the server may have received
      // the body even when the browser hides a cross-origin response.
      return { skipped: false, delivered: "maybe", error: err && err.message ? err.message : String(err) };
    }
  }

  async function onSubmit() {
    var btn = document.getElementById("submit-btn");
    var dl = document.getElementById("download-btn");
    btn.disabled = true;
    setMsg("Scoring…", "");
    try {
      var answers = collectAnswers();
      var out = window.MandarinGrade.gradeLesson(lesson, answers);
      window.__mandarinLastGrade = out;
      showItemFeedback(out.items);
      resultsCard(out);
      var payload = await buildPayload(out, answers);
      // Keep audio out of the downloaded JSON by default? Include a flag but
      // drop huge base64 from the fallback file; attach a note instead.
      var downloadable = Object.assign({}, payload, {
        audio: Object.keys(payload.audio).reduce(function (acc, k) {
          acc[k] = { included: true, mime: payload.mimeTypes[k], bytes: recorders[k].blob.size };
          return acc;
        }, {})
      });
      window.__mandarinLastPayload = payload;
      window.__mandarinDownload = downloadable;
      dl.hidden = false;

      var sent = await submitToServer(payload);
      if (sent.skipped) {
        setMsg("Scored on this device. Submission upload isn’t set up yet, so use “Download submission.json” if you want a copy.", "");
      } else if (sent.body && sent.body.ok === false) {
        setMsg("Scored locally, but the server said: " + (sent.body.error || "error") + ". You can still download a copy.", "error");
      } else if (sent.delivered === true && sent.body && sent.body.ok) {
        setMsg("Submitted. Written score is above; Mei will review any voice clips.", "ok");
      } else if (sent.delivered) {
        setMsg("Submitted (the server doesn’t return a readable response in the browser). Download a copy if you want a backup.", "ok");
      } else {
        setMsg("Scored locally. Upload may not have gone through (" + sent.error + "). Please download a copy.", "error");
      }
    } catch (err) {
      setMsg("Could not score this lesson: " + (err && err.message ? err.message : err), "error");
    } finally {
      btn.disabled = false;
    }
  }

  function applyGradedLesson(grade, root) {
    var byN = {};
    (grade.items || []).forEach(function (it) { byN[String(it.n)] = it; });
    collectPracticeItems(lesson).forEach(function (it) {
      var g = byN[String(it.n)];
      var box = document.getElementById("item-" + it.n);
      if (g && g.status && box) box.classList.add(g.status);
      if (isSay(it)) {
        var rec = root.querySelector('.recorder[data-n="' + it.n + '"]');
        if (rec) {
          rec.querySelectorAll("button").forEach(function (btn) { btn.disabled = true; });
          var st = rec.querySelector(".rec-status");
          if (st && g) st.textContent = "Voice graded — see report card above.";
        }
        return;
      }
      if (!g) return;
      var el = document.getElementById("ans-" + it.n);
      if (el) {
        el.value = g.answer == null ? "" : String(g.answer);
        el.disabled = true;
        el.setAttribute("readonly", "readonly");
      }
    });
    var submitRow = root.querySelector(".submit-row");
    if (submitRow) submitRow.hidden = true;
    var practiceHdr = root.querySelector("h2.practice");
    if (practiceHdr && grade.graded_at) {
      var note = document.createElement("p");
      note.className = "graded-practice-note";
      note.textContent = "This lesson was graded on " + grade.graded_at + ". Practice is read-only; your scored answers are in the report card.";
      practiceHdr.insertAdjacentElement("afterend", note);
    }
  }

  async function loadLesson() {
    lessonId = qs("id") || "";
    var header = document.getElementById("header");
    var body = document.getElementById("body");
    var idEl = document.getElementById("lesson-id");
    if (!lessonId) {
      header.innerHTML = "";
      body.innerHTML = '<div class="error-banner">Missing lesson id. Go back to the <a href="index.html">lesson list</a>.</div>';
      return;
    }
    try {
      var res = await fetch("lessons/" + encodeURIComponent(lessonId) + "/lesson.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Lesson “" + lessonId + "” was not found (" + res.status + ").");
      lesson = await res.json();
      var publishedGrade = null;
      if (window.MandarinReport && window.MandarinReport.fetchGrade) {
        try {
          publishedGrade = await window.MandarinReport.fetchGrade(lessonId);
        } catch (gradeErr) {
          /* leave practice interactive if grade fetch fails */
        }
      }
      document.title = "Lesson " + lesson.lesson_number + " · " + (lesson.title_en || "") + " · Mei";
      idEl.textContent = "[L" + lesson.lesson_number + "]";
      header.innerHTML = headerHtml(lesson);
      body.innerHTML = bodyHtml(lesson);
      if (publishedGrade && window.MandarinReport.renderReportCard) {
        body.insertAdjacentHTML("afterbegin", window.MandarinReport.renderReportCard(publishedGrade));
        applyGradedLesson(publishedGrade, body);
      }
      bindListen(body);
      bindRecorders(body);
      var submitBtn = document.getElementById("submit-btn");
      if (submitBtn) submitBtn.addEventListener("click", onSubmit);
      var dlBtn = document.getElementById("download-btn");
      if (dlBtn) {
        dlBtn.addEventListener("click", function () {
          var data = window.__mandarinDownload || lastPayload();
          if (data) downloadJson(data, (lessonId || "lesson") + "-submission.json");
        });
      }
    } catch (e) {
      body.innerHTML = '<div class="error-banner">' + esc(e.message || e) + "</div>";
    }
  }

  ensureListenFilters();

  if (window.MandarinLock) {
    window.MandarinLock.setup({ onUnlock: loadLesson });
  } else {
    document.getElementById("app").hidden = false;
    loadLesson();
  }
})();
