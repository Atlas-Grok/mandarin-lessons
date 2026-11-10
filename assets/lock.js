/**
 * Android-style 3x3 pattern lock.
 * Dots are numbered 1-9 row-wise. Only a SHA-256 hash of the hyphenated
 * sequence is stored here (obfuscation, not real security).
 *
 * To change the pattern, run: python3 tools/hash_pattern.py 1-2-3-6-9
 * and paste the hex below. Default is the L-shape 1-4-7-8-9.
 */
(function (global) {
  "use strict";

  const PATTERN_HASH = "464fc72ba5a0d147f2afd3ea7a7fa94431783db27d9e1b18790691aa6ceab955";
  const STORAGE_KEY = "mei-mandarin-unlock-hash";
  const MIN_DOTS = 4;
  const MID = {
    "1-3": 2, "3-1": 2,
    "1-7": 4, "7-1": 4,
    "1-9": 5, "9-1": 5,
    "2-8": 5, "8-2": 5,
    "3-7": 5, "7-3": 5,
    "3-9": 6, "9-3": 6,
    "4-6": 5, "6-4": 5,
    "7-9": 8, "9-7": 8
  };

  function hex(buf) {
    return Array.from(new Uint8Array(buf))
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  async function hashPattern(dots) {
    const text = dots.join("-");
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return hex(digest);
  }

  function alreadyUnlocked() {
    try {
      return localStorage.getItem(STORAGE_KEY) === PATTERN_HASH;
    } catch (e) {
      return false;
    }
  }

  function rememberUnlock() {
    try {
      localStorage.setItem(STORAGE_KEY, PATTERN_HASH);
    } catch (e) { /* private mode */ }
  }

  function setup(options) {
    const overlay = document.getElementById("lock-screen");
    const canvas = document.getElementById("lock-canvas");
    const status = document.getElementById("lock-status");
    const app = document.getElementById("app");
    if (!overlay || !canvas) return;

    const reveal = function () {
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      if (app) app.hidden = false;
      if (options && typeof options.onUnlock === "function") options.onUnlock();
    };

    if (alreadyUnlocked()) {
      reveal();
      return;
    }

    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    if (app) app.hidden = true;

    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let cssSize = 0;
    const nodes = [];
    let pattern = [];
    let drawing = false;
    let pointer = null;

    function layout() {
      const wrap = canvas.parentElement;
      const size = Math.min(280, Math.max(220, (wrap ? wrap.clientWidth : 280) - 16));
      cssSize = size;
      canvas.style.width = size + "px";
      canvas.style.height = size + "px";
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodes.length = 0;
      const pad = size * 0.18;
      const gap = (size - pad * 2) / 2;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          nodes.push({
            n: r * 3 + c + 1,
            x: pad + c * gap,
            y: pad + r * gap,
            r: Math.max(10, size * 0.028)
          });
        }
      }
      draw();
    }

    function hit(x, y) {
      const reach = cssSize * 0.11;
      let best = null, bestD = reach;
      for (let i = 0; i < nodes.length; i++) {
        const dx = nodes[i].x - x, dy = nodes[i].y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestD) {
          bestD = d;
          best = nodes[i];
        }
      }
      return best;
    }

    function addDot(node) {
      if (!node || pattern.indexOf(node.n) !== -1) return;
      if (pattern.length) {
        const key = pattern[pattern.length - 1] + "-" + node.n;
        const mid = MID[key];
        if (mid && pattern.indexOf(mid) === -1) pattern.push(mid);
      }
      if (pattern.indexOf(node.n) === -1) pattern.push(node.n);
    }

    function localPoint(ev) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ev.clientX - rect.left,
        y: ev.clientY - rect.top
      };
    }

    function draw() {
      ctx.clearRect(0, 0, cssSize, cssSize);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (pattern.length) {
        ctx.strokeStyle = "#b91c1c";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < pattern.length; i++) {
          const n = nodes[pattern[i] - 1];
          if (i === 0) ctx.moveTo(n.x, n.y);
          else ctx.lineTo(n.x, n.y);
        }
        if (drawing && pointer) ctx.lineTo(pointer.x, pointer.y);
        ctx.stroke();
      }
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const on = pattern.indexOf(n.n) !== -1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, on ? n.r + 2 : n.r, 0, Math.PI * 2);
        ctx.fillStyle = on ? "#b91c1c" : "#d6c4a8";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(3, n.r * 0.35), 0, Math.PI * 2);
        ctx.fillStyle = on ? "#fffdf8" : "#7a6450";
        ctx.fill();
      }
    }

    function setStatus(text, kind) {
      if (!status) return;
      status.textContent = text;
      status.className = "lock-status" + (kind ? " " + kind : "");
    }

    async function finish() {
      drawing = false;
      pointer = null;
      draw();
      if (pattern.length < MIN_DOTS) {
        setStatus("Connect at least four dots.", "error");
        pattern = [];
        draw();
        return;
      }
      if (!global.crypto || !crypto.subtle) {
        setStatus("This page needs HTTPS to unlock.", "error");
        pattern = [];
        draw();
        return;
      }
      try {
        const digest = await hashPattern(pattern);
        if (digest === PATTERN_HASH) {
          rememberUnlock();
          setStatus("Unlocked.", "ok");
          window.setTimeout(reveal, 180);
        } else {
          setStatus("Not quite — try again.", "error");
          overlay.classList.add("shake");
          window.setTimeout(function () { overlay.classList.remove("shake"); }, 400);
          pattern = [];
          draw();
        }
      } catch (e) {
        setStatus("Could not check the pattern.", "error");
        pattern = [];
        draw();
      }
    }

    function onDown(ev) {
      ev.preventDefault();
      canvas.setPointerCapture(ev.pointerId);
      drawing = true;
      pattern = [];
      pointer = localPoint(ev);
      const n = hit(pointer.x, pointer.y);
      if (n) addDot(n);
      setStatus("Draw the pattern", "");
      draw();
    }

    function onMove(ev) {
      if (!drawing) return;
      ev.preventDefault();
      pointer = localPoint(ev);
      const n = hit(pointer.x, pointer.y);
      if (n) addDot(n);
      draw();
    }

    function onUp(ev) {
      if (!drawing) return;
      ev.preventDefault();
      finish();
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    window.addEventListener("resize", layout);
    layout();
    setStatus("Draw the pattern", "");
  }

  global.MandarinLock = {
    PATTERN_HASH: PATTERN_HASH,
    setup: setup,
    alreadyUnlocked: alreadyUnlocked,
    hashPattern: hashPattern
  };
})(typeof window !== "undefined" ? window : globalThis);
