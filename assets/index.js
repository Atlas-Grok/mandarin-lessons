(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadIndex() {
    const list = document.getElementById("lesson-list");
    const err = document.getElementById("index-error");
    try {
      const res = await fetch("lessons/index.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load lessons/index.json (" + res.status + ")");
      const data = await res.json();
      const lessons = (data && data.lessons) || [];
      if (!lessons.length) {
        list.innerHTML = "<li class='meta'>No lessons have been published yet.</li>";
        return;
      }
      list.innerHTML = lessons.map(function (L) {
        const title = "Lesson " + esc(L.lesson_number) + " · " + esc(L.title_en);
        const py = L.title_py ? "<div class='title-py' style='font-size:15px;'>" + esc(L.title_py) + "</div>" : "";
        const when = L.date ? "<div class='when'>" + esc(L.date) + "</div>" : "";
        return "<li><a href='lesson.html?id=" + encodeURIComponent(L.id) + "'>" +
          "<div class='en'>" + title + "</div>" + py + when + "</a></li>";
      }).join("");
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message || String(e);
    }
  }

  if (window.MandarinLock) {
    window.MandarinLock.setup({ onUnlock: loadIndex });
  } else {
    document.getElementById("app").hidden = false;
    loadIndex();
  }
})();
