(function () {
  "use strict";

  const feedEl = document.getElementById("feed");
  const tickerEl = document.getElementById("tickerTrack");
  const moversEl = document.getElementById("moversList");
  const watchlistEl = document.getElementById("watchlistList");
  const watchlistForm = document.getElementById("watchlistForm");
  const watchlistInput = document.getElementById("watchlistInput");
  const signupForm = document.getElementById("signupForm");
  const signupNote = document.getElementById("signupNote");
  const navButtons = document.querySelectorAll(".nav__item");
  const todayDateEl = document.getElementById("todayDate");
  const yearEl = document.getElementById("year");
  const refreshSelect = document.getElementById("refreshInterval");
  const refreshNowBtn = document.getElementById("refreshNowBtn");
  const refreshStatus = document.getElementById("refreshStatus");

  const WATCHLIST_KEY = "brandswatch_watchlist";
  const REFRESH_KEY = "brandswatch_refresh_interval";
  const MIN_BRANDS_REQUIRED = 50;
  let stories = [];
  let activeCategory = "all";
  let refreshTimer = null;

  // --- Header date/year ---
  const now = new Date();
  todayDateEl.textContent = now.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  yearEl.textContent = now.getFullYear();

  // --- Load stories ---
  function loadStories(isManual) {
    // cache-bust so scheduled/manual refreshes actually pick up a rewritten file
    // instead of a cached copy of data/stories.json
    fetch("data/stories.json?t=" + Date.now())
      .then((r) => r.json())
      .then((data) => {
        stories = data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        renderTicker();
        renderMovers();
        renderFeed();
        checkBrandCoverage();
        setRefreshStatus("Updated " + new Date().toLocaleTimeString());
      })
      .catch(() => {
        feedEl.innerHTML = '<p class="empty-state">Couldn\'t load today\'s stories. Check that data/stories.json is reachable.</p>';
        setRefreshStatus("Refresh failed");
      });
  }

  function checkBrandCoverage() {
    const uniqueBrands = new Set(stories.map((s) => s.brand)).size;
    if (uniqueBrands < MIN_BRANDS_REQUIRED) {
      console.warn(
        "Brands Watch coverage check: only " + uniqueBrands +
        " distinct brands in data/stories.json (minimum required: " + MIN_BRANDS_REQUIRED + "). " +
        "Update the feed source so each refresh covers at least " + MIN_BRANDS_REQUIRED + " top global brands."
      );
    }
  }

  function setRefreshStatus(msg) {
    if (refreshStatus) refreshStatus.textContent = msg;
  }

  // --- Refresh interval control ---
  function applyRefreshInterval(minutes) {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (minutes > 0) {
      refreshTimer = setInterval(() => loadStories(false), minutes * 60 * 1000);
      setRefreshStatus("Auto-refresh: every " + minutes + " min");
    } else {
      setRefreshStatus("Manual refresh");
    }
  }

  const savedInterval = Number(localStorage.getItem(REFRESH_KEY)) || 0;
  if (refreshSelect) {
    refreshSelect.value = String(savedInterval);
    refreshSelect.addEventListener("change", () => {
      const minutes = Number(refreshSelect.value);
      localStorage.setItem(REFRESH_KEY, String(minutes));
      applyRefreshInterval(minutes);
    });
  }
  if (refreshNowBtn) {
    refreshNowBtn.addEventListener("click", () => loadStories(true));
  }

  loadStories(false);
  applyRefreshInterval(savedInterval);

  function timeAgo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    return days + "d ago";
  }

  function renderFeed() {
    const filtered = activeCategory === "all"
      ? stories
      : stories.filter((s) => s.category === activeCategory);

    if (!filtered.length) {
      feedEl.innerHTML = '<p class="empty-state">No stories in this category yet.</p>';
      return;
    }

    feedEl.innerHTML = filtered.map((s) => `
      <article class="story">
        <div class="story__meta">
          <span class="story__brand">${escapeHtml(s.brand)}</span>
          <span class="story__category">${escapeHtml(s.category)}</span>
          <span class="story__time">${timeAgo(s.timestamp)}</span>
        </div>
        <div class="story__body">
          <h3>${escapeHtml(s.headline)}</h3>
          <p class="story__brief">${escapeHtml(s.summary)}</p>
          <div class="story__footer">
            <span class="story__source">${escapeHtml(s.source)}</span>
            <a class="story__link" href="${escapeAttr(s.url)}" target="_blank" rel="noopener">Read full story →</a>
          </div>
        </div>
      </article>
    `).join("");
  }

  function renderTicker() {
    const items = stories.slice(0, 8).map(
      (s) => `<span class="ticker__item"><b>${escapeHtml(s.brand)}</b> — ${escapeHtml(s.headline)}</span>`
    ).join("");
    // duplicate content so the CSS animation can loop seamlessly
    tickerEl.innerHTML = items + items;
  }

  function renderMovers() {
    // Deterministic sample "movers" derived from the brand list, purely illustrative.
    const brands = [...new Set(stories.map((s) => s.brand))].slice(0, 5);
    moversEl.innerHTML = brands.map((b, i) => {
      const up = i % 2 === 0;
      const pct = ((i + 1) * 1.3).toFixed(1);
      return `<li><span>${escapeHtml(b)}</span><span class="${up ? "up" : "down"}">${up ? "▲" : "▼"} ${pct}%</span></li>`;
    }).join("");
  }

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      navButtons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      activeCategory = btn.dataset.cat;
      renderFeed();
    });
  });

  // --- Watchlist (persisted locally in the visitor's browser) ---
  function loadWatchlist() {
    try {
      return JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveWatchlist(list) {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
    } catch (e) { /* storage unavailable, ignore */ }
  }
  function renderWatchlist() {
    const list = loadWatchlist();
    if (!list.length) {
      watchlistEl.innerHTML = '<li style="opacity:.6">No brands pinned yet.</li>';
      return;
    }
    watchlistEl.innerHTML = list.map((b, i) =>
      `<li>${escapeHtml(b)} <button data-i="${i}" aria-label="Remove ${escapeHtml(b)}">×</button></li>`
    ).join("");
    watchlistEl.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const l = loadWatchlist();
        l.splice(Number(btn.dataset.i), 1);
        saveWatchlist(l);
        renderWatchlist();
      });
    });
  }
  watchlistForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = watchlistInput.value.trim();
    if (!val) return;
    const list = loadWatchlist();
    if (!list.includes(val)) list.push(val);
    saveWatchlist(list);
    watchlistInput.value = "";
    renderWatchlist();
  });
  renderWatchlist();

  // --- Newsletter signup (front-end only placeholder) ---
  signupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    signupNote.textContent = "Saved locally — wire this form up to your email provider to go live.";
    signupForm.reset();
  });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }
})();
