/* Leaders Like Me — single-page app, no build step.
   Sections: storage · data · accounts · favorites & likes · ui helpers · views · router */
(function () {
  "use strict";

  /* ---------------- Storage ---------------- */
  // Every read/write is guarded: private windows and blocked storage must not break the app.
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem("llm." + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("llm." + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
    remove(key) {
      try { localStorage.removeItem("llm." + key); } catch (e) { /* ignore */ }
    }
  };

  /* ---------------- Data ---------------- */
  const REAL = Array.isArray(window.LLM_LEADERS) ? window.LLM_LEADERS : [];
  const SAMPLES = Array.isArray(window.LLM_SAMPLE_LEADERS) ? window.LLM_SAMPLE_LEADERS : [];
  const USING_SAMPLES = REAL.length === 0 && SAMPLES.length > 0;
  const LEADERS = USING_SAMPLES ? SAMPLES : REAL;
  const BY_ID = new Map(LEADERS.map((l) => [l.id, l]));

  const TAGS = window.LLM_TAGS || { identity: [], field: [] };
  const TAG = {};
  TAGS.identity.forEach((t) => (TAG[t.id] = { ...t, kind: "identity" }));
  TAGS.field.forEach((t) => (TAG[t.id] = { ...t, kind: "field" }));

  // Everyday words people type, mapped to tag ids.
  const SYNONYMS = {
    woman: "women", female: "women", girl: "women", girls: "women", she: "women",
    latina: "latine", latino: "latine", latinx: "latine", hispanic: "latine", mexican: "latine",
    asian: "aapi", "pacific": "aapi", chinese: "aapi", japanese: "aapi", korean: "aapi", filipino: "aapi",
    native: "indigenous", "first-nations": "indigenous", cherokee: "indigenous",
    african: "black", "african-american": "black", poc: "bipoc", "people-of-color": "bipoc",
    arab: "mena", "middle-eastern": "mena",
    gay: "lgbtq", lesbian: "lgbtq", bisexual: "lgbtq", queer: "lgbtq",
    trans: "transgender",
    autistic: "neurodivergent", autism: "neurodivergent", adhd: "neurodivergent", dyslexic: "neurodivergent",
    disability: "disabled", deaf: "disabled", blind: "disabled",
    dwarf: "little-people", dwarfism: "little-people", achondroplasia: "little-people",
    maths: "math", mathematics: "math", stem: "science", tech: "technology", computers: "technology",
    art: "arts", artist: "arts", painter: "arts", dancer: "dance", ballet: "dance", singer: "music", composer: "music", writer: "literature", author: "literature", poet: "literature",
    athlete: "sports", astronaut: "space", nasa: "space", doctor: "medicine", civil: "activism", rights: "activism"
  };

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const nameKey = (s) => norm(s).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

  function haystack(l) {
    const tagWords = [...(l.identity || []), ...(l.field || [])].map((id) => id + " " + (TAG[id] ? TAG[id].label : "")).join(" ");
    return {
      name: norm(l.name),
      roles: norm((l.roles || []).join(" ")),
      tags: norm(tagWords),
      bio: norm(l.bio)
    };
  }
  const HAY = new Map(LEADERS.map((l) => [l.id, haystack(l)]));

  function search({ q = "", tags = [], sort = "relevance" }) {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    let results = [];
    for (const l of LEADERS) {
      const all = [...(l.identity || []), ...(l.field || [])];
      if (!tags.every((t) => all.includes(t))) continue;
      const h = HAY.get(l.id);
      let score = 0;
      let ok = true;
      for (const tok of tokens) {
        const alts = [tok, SYNONYMS[tok]].filter(Boolean);
        let s = 0;
        for (const a of alts) {
          if (h.name.includes(a)) s = Math.max(s, 5);
          if (h.tags.includes(a)) s = Math.max(s, 3);
          if (h.roles.includes(a)) s = Math.max(s, 3);
          if (h.bio.includes(a)) s = Math.max(s, 1);
        }
        if (!s) { ok = false; break; }
        score += s;
      }
      if (ok) results.push({ l, score });
    }
    const byName = (a, b) => lastName(a.l).localeCompare(lastName(b.l));
    if (sort === "name" || (sort === "relevance" && !tokens.length)) results.sort(byName);
    else if (sort === "oldest" || sort === "newest") {
      // People without a known birth year always go last, in name order.
      const dir = sort === "oldest" ? 1 : -1;
      results.sort((a, b) => {
        const ya = a.l.born, yb = b.l.born;
        if (ya == null && yb == null) return byName(a, b);
        if (ya == null) return 1;
        if (yb == null) return -1;
        return dir * (ya - yb) || byName(a, b);
      });
    }
    else results.sort((a, b) => b.score - a.score || byName(a, b));
    return results.map((r) => r.l);
  }

  function lastName(l) {
    const parts = l.name.split(" ");
    return parts[parts.length - 1];
  }

  /* ---------------- Saves, likes & game progress ----------------
     Everything is kept in this browser on this device; there are no accounts.
     (The storage key is "guest" for compatibility with earlier versions.) */
  const Prefs = {
    _read() { return { favorites: [], likes: [], game: null, ...store.get("guest", {}) }; },
    _write(patch) { store.set("guest", { ...Prefs._read(), ...patch }); },
    favorites() { return Prefs._read().favorites; },
    isFavorite(id) { return Prefs.favorites().includes(id); },
    toggleFavorite(id) {
      const favs = Prefs.favorites();
      const on = !favs.includes(id);
      Prefs._write({ favorites: on ? [...favs, id] : favs.filter((f) => f !== id) });
      return on;
    },
    likes() { return Prefs._read().likes; },
    setLikes(likes) { Prefs._write({ likes }); },
    game() { return normalizeGame(Prefs._read().game); },
    setGame(game) { Prefs._write({ game }); }
  };

  /* ---------------- Mystery Leader: game state ----------------
     game = {
       days: { "2026-10-08": { leaderId, options, revealed, wrong: [ids], status, classMode, solvedAt } },
       badges: { badgeId: { earnedAt, level? } },
       deepDives: [leaderId],            // opened "Learn more" after solving
       reflections: { leaderId: text }   // "what do we have in common?"
     }
     status is "playing", "solved" or "revealed" (gave up). */
  function normalizeGame(g) {
    g = g || {};
    return { days: { ...(g.days || {}) }, badges: { ...(g.badges || {}) }, deepDives: [...(g.deepDives || [])], reflections: { ...(g.reflections || {}) } };
  }

  /* ---------------- UI helpers ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const app = $("#app");

  // The daily game's name, used everywhere it appears on screen.
  const GAME_NAME = "Guess Who";

  // Outside links. The form is the original 2021 survey, so suggestions land in the same Sheet.
  const LINKS = {
    suggest: "#/suggest",
    donate: "https://ko-fi.com/keeferscreative",
    patreon: "https://www.patreon.com/KeefersCreative",
    // Where people can report an accessibility problem. Leave empty to hide the line.
    accessibilityContact: ""
  };
  // The in-app suggestion form sends answers straight to the original 2021 Google Form,
  // so they land in the same Google Sheet. Field ids come from the form's public page.
  const SUGGEST_FORM = {
    action: "https://docs.google.com/forms/d/e/1FAIpQLScWhSGM1h4NCJngDxzp4n4U00A5_yDlLV_usW--92074JT4jA/formResponse",
    name: "entry.1835170109",
    identity: "entry.407252657",
    field: "entry.1196590454",
    contribution: "entry.1796832001",
    link: "entry.495937089",
    // App tags -> the form's checkbox options. Anything without an exact match is also
    // written into the form's "Other" box so no detail is lost.
    identityOptions: {
      women: "Female", bipoc: "BIPOC", black: "BIPOC", latine: "BIPOC", indigenous: "BIPOC", multiracial: "BIPOC",
      aapi: "AAPI", lgbtq: "LGBTQIA+", transgender: "LGBTQIA+", nonbinary: "LGBTQIA+",
      disabled: "Disabled", neurodivergent: "Neurodivergent"
    },
    fieldOptions: {
      science: "Science", technology: "Technology", engineering: "Engineering", math: "Math",
      arts: "Art/Performing Art", music: "Art/Performing Art", dance: "Art/Performing Art",
      film: "Art/Performing Art", literature: "Art/Performing Art", activism: "Social Justice"
    }
  };

  // Tags whose form option means the same thing, so they don't need repeating in "Other".
  const SAME_MEANING = new Set(["women", "bipoc", "aapi", "lgbtq", "disabled", "neurodivergent",
    "science", "technology", "engineering", "math", "arts", "activism"]);

  // Build the Google Form payload for one checkbox question.
  function appendChoices(params, entry, tagIds, optionMap, extraText) {
    const options = new Set();
    const others = [];
    for (const id of tagIds) {
      const opt = optionMap[id];
      if (opt) options.add(opt);
      // Keep the specific word when the form only has a broader option (e.g. "black" -> BIPOC).
      if (!opt || !SAME_MEANING.has(id)) others.push(TAG[id] ? TAG[id].label : id);
    }
    if (extraText) others.push(extraText);
    options.forEach((o) => params.append(entry, o));
    if (others.length) {
      params.append(entry, "__other_option__");
      params.append(entry + ".other_option_response", others.join(", "));
    }
  }

  async function sendSuggestion({ name, identity = [], field = [], identityOther = "", fieldOther = "", contribution = "", link = "" }) {
    const params = new URLSearchParams();
    params.append(SUGGEST_FORM.name, name);
    appendChoices(params, SUGGEST_FORM.identity, identity, SUGGEST_FORM.identityOptions, identityOther);
    appendChoices(params, SUGGEST_FORM.field, field, SUGGEST_FORM.fieldOptions, fieldOther);
    if (contribution) params.append(SUGGEST_FORM.contribution, contribution);
    if (link) params.append(SUGGEST_FORM.link, link);
    // Google doesn't allow reading the response from another site ("no-cors"), so a
    // network failure is the only error we can detect.
    await fetch(SUGGEST_FORM.action, { method: "POST", mode: "no-cors", body: params });
    store.set("lastSuggestionAt", Date.now());
  }

  const ext = (href, label, cls = "") =>
    `<a class="${cls}" href="${href}" target="_blank" rel="noopener">${label}<span class="visually-hidden"> (opens in a new tab)</span></a>`;

  function suggestCard() {
    return `
      <section class="block suggest-card" aria-labelledby="suggest-h">
        <div>
          <h2 id="suggest-h">Know someone who belongs here?</h2>
          <p>Leaders Like Me grows from suggestions by teachers and students. Tell us who's missing.</p>
        </div>
        <a class="btn" href="#/suggest">Suggest a leader</a>
      </section>`;
  }

  function siteFooter() {
    return `
      <footer class="site-footer">
        <p>Missing someone? <a href="#/suggest">Suggest a leader</a>.</p>
        <p><a href="#/accessibility">Accessibility</a></p>
        <p>Leaders Like Me is free and has no ads. Teachers and families can ${ext(LINKS.donate, "donate on Ko-fi")}.</p>
      </footer>`;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const ICON = {
    mail: '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="2.5" y="5.5" width="23" height="17" rx="1.5"/><path d="m3 6.5 11 9 11-9"/></svg>',
    key: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="18.5" cy="9.5" r="6"/><circle cx="20" cy="8" r="1.4"/><path d="M14 14 4 24m3-3 3 3m-1-6 3 3"/></svg>',
    user: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="9" r="5"/><path d="M4 25c0-5.5 4.5-9 10-9s10 3.5 10 9"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13v7H4V4h7"/><path d="m11 15 1-4 8-8 3 3-8 8z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5 4 12.6A5 5 0 0 1 12 6.3a5 5 0 0 1 8 6.3z"/></svg>',
    device: '<svg class="device-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    lock: '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
    book: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 10c6-2 12-2 18 2v28c-6-4-12-4-18-2zM42 10c-6-2-12-2-18 2v28c6-4 12-4 18-2z"/></svg>',
    google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.5z"/><path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A11.5 11.5 0 0 0 12 23.5z"/><path fill="#FBBC05" d="M5.6 14.2a6.9 6.9 0 0 1 0-4.4v-3H1.8a11.5 11.5 0 0 0 0 10.4z"/><path fill="#EA4335" d="M12 5.1c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.5 11.5 0 0 0 1.8 6.8l3.8 3C6.5 7.1 9 5.1 12 5.1z"/></svg>',
    microsoft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>'
  };

  const PETAL = (color, style) =>
    `<svg class="petal" style="${style}" viewBox="0 0 20 40" aria-hidden="true"><path fill="${color}" d="M10 0C18 14 20 26 14 36c-4 5-10 4-12-2C0 26 4 12 10 0z"/></svg>`;

  function logoInner() {
    return `
      <span class="logo-words"><span>Leaders</span><span>Like</span><span class="me">Me</span></span>
      ${PETAL("#f2a77d", "left:13%;top:-1%;width:7%;transform:rotate(-8deg)")}
      ${PETAL("#c77bb4", "left:1%;top:10%;width:7.5%;transform:rotate(-62deg)")}
      ${PETAL("#e05a4c", "left:86%;top:52%;width:7%;transform:rotate(72deg)")}
      ${PETAL("#c8845f", "left:86%;top:66%;width:7%;transform:rotate(108deg)")}`;
  }

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/);
    return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }

  function avatar(l, cls = "") {
    const variant = ["", "avatar--alt", "avatar--alt2"][[...l.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 3];
    const inner = l.image
      ? `<img src="${esc(l.image)}" alt="" loading="lazy"${l.imagePosition ? ` style="object-position:${esc(l.imagePosition)}"` : ""}>`
      : `<span aria-hidden="true">${esc(initials(l.name))}</span>`;
    return `<div class="avatar ${variant} ${cls}">${inner}</div>`;
  }

  function years(l) {
    if (!l.born) return "";
    const born = (l.bornCirca ? "c. " : "") + l.born;
    return l.died ? `${born} — ${l.died}` : `born ${born}`;
  }

  function tagPill(id, { link = true, small = false } = {}) {
    const t = TAG[id];
    if (!t) return "";
    const cls = `pill pill--${t.kind}${small ? " pill--small" : ""}`;
    return link
      ? `<a class="${cls}" href="#/explore?t=${encodeURIComponent(id)}">${esc(t.label)}</a>`
      : `<span class="${cls}">${esc(t.label)}</span>`;
  }

  // Labeled Identity / Field tags for a profile; each tag links to a search.
  function profileTags(l) {
    const group = (title, ids) => ids.length
      ? `<div class="tag-group"><h2 class="eyebrow">${title}</h2><div class="pill-row">${ids.map((t) => tagPill(t)).join("")}</div></div>`
      : "";
    return `<section class="profile-tags" aria-label="Tags">${group("Identity", l.identity || [])}${group("Field", l.field || [])}</section>`;
  }

  function heartButton(l, extra = "") {
    const on = Prefs.isFavorite(l.id);
    return `<button type="button" class="heart ${extra}" data-fav="${esc(l.id)}" aria-pressed="${on}" aria-label="Save ${esc(l.name)}">${ICON.heart}</button>`;
  }

  function card(l) {
    const tags = [...(l.identity || []), ...(l.field || [])].slice(0, 4);
    return `
      <article class="card">
        ${avatar(l)}
        <div>
          <h3><a class="card-link" href="#/leader/${encodeURIComponent(l.id)}">${esc(l.name)}</a></h3>
          <p class="roles">${esc((l.roles || []).join(", "))}</p>
          <p class="years">${esc(years(l))}</p>
          <div class="pill-row">${tags.map((t) => tagPill(t, { link: false, small: true })).join("")}</div>
        </div>
        ${heartButton(l)}
      </article>`;
  }

  function grid(list, heading) {
    return `${heading ? `<h2 class="visually-hidden">${esc(heading)}</h2>` : ""}<div class="grid">${list.map(card).join("")}</div>`;
  }

  function sampleNotice() {
    return USING_SAMPLES
      ? `<p class="notice"><strong>Preview</strong> These are sample entries. The full repository of leaders hasn't been added yet.</p>`
      : "";
  }

  function emptyRepo() {
    return `
      <div class="empty">
        ${ICON.book}
        <h2>The library is being built</h2>
        <p>No leaders have been added yet. Check back soon.</p>
      </div>`;
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  const sheet = $("#sheet");
  function openSheet(html, bind) {
    sheet.innerHTML = html;
    const heading = sheet.querySelector("h2");
    if (heading) { heading.id = "sheet-title"; sheet.setAttribute("aria-labelledby", "sheet-title"); }
    else sheet.removeAttribute("aria-labelledby");
    $$("[data-close]", sheet).forEach((b) => b.addEventListener("click", () => sheet.close()));
    if (bind) bind(sheet);
    if (typeof sheet.showModal === "function") sheet.showModal();
    else sheet.setAttribute("open", "");
  }
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });

  // One delegated handler for every heart button on every screen.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-fav]");
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.fav;
    const on = Prefs.toggleFavorite(id);
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => b.setAttribute("aria-pressed", String(on)));
    const name = BY_ID.get(id) ? BY_ID.get(id).name : "Leader";
    if (on && !store.get("guestFavHint", false)) {
      store.set("guestFavHint", true);
      toast(`${name} saved. Saves stay in this browser on this device.`);
    } else {
      toast(on ? `${name} saved` : `${name} removed from saves`);
    }
    if (currentRoute === "saves" && !on) render();
  });

  function readQuery(qs) {
    const p = new URLSearchParams(qs || "");
    return {
      q: p.get("q") || "",
      tags: (p.get("t") || "").split(",").filter((t) => TAG[t]),
      sort: p.get("sort") || "relevance",
      letter: /^[A-Z]$/.test(p.get("l") || "") ? p.get("l") : "",
      next: p.get("next") || "",
      day: p.get("day") || ""
    };
  }

  function writeQuery({ q, tags, sort, letter }) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (tags.length) p.set("t", tags.join(","));
    if (sort && sort !== "relevance") p.set("sort", sort);
    if (letter) p.set("l", letter);
    const s = p.toString();
    return s ? "?" + s : "";
  }

  function safeNext(next) {
    return /^\/[a-z]/.test(next) ? "#" + next : "#/home";
  }

  /* ---------------- Views ---------------- */

  function searchForm(value = "") {
    return `
      <form class="searchbox" id="searchform" role="search">
        <label class="visually-hidden" for="q">Search leaders</label>
        <input id="q" type="search" value="${esc(value)}" placeholder="Try “Black women in math”" autocomplete="off">
        <button type="submit" aria-label="Search">${ICON.search}</button>
      </form>`;
  }

  function spotlightFor(list) {
    if (!list.length) return null;
    const day = Math.floor(Date.now() / 86400000);
    return list[day % list.length];
  }

  function viewHome() {
    document.title = "Leaders Like Me";
    const likes = Prefs.likes();
    const todayMystery = mysteryLeaderFor(dayKey());
    const spot = spotlightFor(LEADERS.length > 1 && todayMystery ? LEADERS.filter((l) => l !== Game.leaderFor(dayKey())) : LEADERS);
    const picked = likes.length
      ? LEADERS.filter((l) => l !== spot && [...(l.identity || []), ...(l.field || [])].some((t) => likes.includes(t))).slice(0, 3)
      : [];

    return {
      html: `
        <div class="page-head">
          <h1 class="page-title">Find leaders who look like <em>you</em>.</h1>
          <p class="lede">Scientists, artists, activists and more who aren't the usual faces in the textbook.</p>
          ${searchForm()}
          ${sampleNotice()}
        </div>

        <div class="home-duo">
        ${mysteryTeaser()}

        ${LEADERS.length ? `
        <section class="block" aria-labelledby="spot-h">
          <h2 class="eyebrow" id="spot-h">Today's spotlight</h2>
          <article class="spotlight">
            ${avatar(spot, "avatar--xl")}
            <div>
              <h3><a class="card-link" href="#/leader/${encodeURIComponent(spot.id)}">${esc(spot.name)}</a></h3>
              <p>${esc((spot.roles || []).join(", "))} · ${esc(years(spot))}</p>
              <p class="bio-snip">${esc(spot.bio)}</p>
            </div>
          </article>
        </section>` : emptyRepo()}
        </div>

        ${picked.length ? `
        <section class="block" aria-labelledby="picked-h">
          <h2 class="eyebrow eyebrow--green" id="picked-h">Picked for your likes</h2>
          ${grid(picked)}
        </section>` : ""}

        <div class="home-tags">
        <section class="block" aria-labelledby="id-h">
          <h2 class="eyebrow eyebrow--green" id="id-h">Browse by identity</h2>
          <div class="pill-row">${TAGS.identity.map((t) => tagPill(t.id)).join("")}</div>
        </section>

        <section class="block" aria-labelledby="field-h">
          <h2 class="eyebrow eyebrow--sky" id="field-h">Browse by field</h2>
          <div class="pill-row">${TAGS.field.map((t) => tagPill(t.id)).join("")}</div>
        </section>
        </div>

        ${LEADERS.length ? `
        <section class="block center">
          <button class="btn btn--ghost" type="button" id="surprise">Surprise me</button>
        </section>` : ""}

        ${suggestCard()}`,
      bind() {
        $("#searchform").addEventListener("submit", (e) => {
          e.preventDefault();
          location.hash = "#/explore" + writeQuery({ q: $("#q").value.trim(), tags: [], sort: "relevance" });
        });
        const s = $("#surprise");
        if (s) s.addEventListener("click", () => {
          const l = LEADERS[Math.floor(Math.random() * LEADERS.length)];
          location.hash = "#/leader/" + encodeURIComponent(l.id);
        });
      }
    };
  }

  function viewExplore(params) {
    document.title = "Explore · Leaders Like Me";
    const state = { q: params.q, tags: params.tags, sort: params.sort, letter: params.letter };
    const firstLetter = (l) => norm(lastName(l))[0].toUpperCase();

    const filterGroup = (kind, title) => {
      const selected = state.tags.filter((t) => TAG[t].kind === kind).length;
      return `
        <details ${selected ? "open" : ""}>
          <summary>${title}<span class="count" data-count="${kind}">${selected ? selected : ""}</span></summary>
          <div class="pill-row">
            ${TAGS[kind].map((t) => `<button type="button" class="pill pill-toggle pill--small" data-kind="${kind}" data-tag="${t.id}" aria-pressed="${state.tags.includes(t.id)}">${esc(t.label)}</button>`).join("")}
          </div>
        </details>`;
    };

    return {
      html: `
        <div class="page-head">
          <h1 class="page-title">Explore</h1>
          <p class="lede">Search everyone, or narrow it down by identity, field and name.</p>
          ${searchForm(state.q)}
        </div>
        <div class="filters" aria-label="Filters">
          ${filterGroup("identity", "Identity")}
          ${filterGroup("field", "Field")}
        </div>
        <div class="az" role="group" aria-label="Show last names starting with a letter">
          ${"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => `<button type="button" data-letter="${c}" aria-pressed="${state.letter === c}">${c}</button>`).join("")}
        </div>
        <div class="results-bar">
          <span id="count" aria-live="polite"></span>
          <span>
            <label for="sort" class="visually-hidden">Sort by</label>
            <select id="sort">
              <option value="relevance">Best match</option>
              <option value="name">Name A–Z</option>
              <option value="oldest">Born earliest</option>
              <option value="newest">Born latest</option>
            </select>
          </span>
        </div>
        <div id="results"></div>
        ${suggestCard()}`,
      bind() {
        $("#sort").value = state.sort;
        const update = () => {
          history.replaceState(null, "", "#/explore" + writeQuery(state));
          const matches = search(state);
          // Letters with nobody in the current results can't be picked.
          const available = new Set(matches.map(firstLetter));
          if (state.letter && !available.has(state.letter)) state.letter = "";
          $$("[data-letter]").forEach((btn) => {
            btn.disabled = !available.has(btn.dataset.letter);
            btn.setAttribute("aria-pressed", String(btn.dataset.letter === state.letter));
          });
          const list = state.letter ? matches.filter((l) => firstLetter(l) === state.letter) : matches;
          const filtered = state.q || state.tags.length || state.letter;
          $("#count").textContent = LEADERS.length
            ? `${list.length} ${list.length === 1 ? "leader" : "leaders"}${filtered ? " found" : ""}`
            : "";
          ["identity", "field"].forEach((k) => {
            const n = state.tags.filter((t) => TAG[t].kind === k).length;
            $(`[data-count="${k}"]`).textContent = n ? n : "";
          });
          if (!LEADERS.length) { $("#results").innerHTML = emptyRepo(); return; }
          $("#results").innerHTML = list.length ? grid(list, "Results") : `
            <div class="empty">
              ${ICON.search.replace("<svg", '<svg style="stroke:var(--peach-300)"')}
              <h2>No one matches yet</h2>
              <p>Try fewer filters or a different word. If someone should be here, let us know.</p>
              ${state.tags.length ? '<button class="btn btn--ghost" type="button" id="clear">Clear filters</button>' : ""}
              <a class="btn" href="#/suggest">Suggest a leader</a>
            </div>`;
          const clear = $("#clear");
          if (clear) clear.addEventListener("click", () => {
            state.tags = [];
            $$("[data-tag]").forEach((b) => b.setAttribute("aria-pressed", "false"));
            update();
          });
        };
        let t;
        $("#q").addEventListener("input", () => {
          clearTimeout(t);
          t = setTimeout(() => { state.q = $("#q").value.trim(); update(); }, 150);
        });
        $("#searchform").addEventListener("submit", (e) => {
          e.preventDefault();
          state.q = $("#q").value.trim();
          update();
          $("#q").blur();
        });
        $("#sort").addEventListener("change", () => { state.sort = $("#sort").value; update(); });
        $$("[data-tag]").forEach((b) => b.addEventListener("click", () => {
          const id = b.dataset.tag;
          const on = !state.tags.includes(id);
          state.tags = on ? [...state.tags, id] : state.tags.filter((x) => x !== id);
          b.setAttribute("aria-pressed", String(on));
          update();
        }));
        $$("[data-letter]").forEach((b) => b.addEventListener("click", () => {
          state.letter = state.letter === b.dataset.letter ? "" : b.dataset.letter;
          update();
        }));
        update();
      }
    };
  }

  function viewLeader(id) {
    const l = BY_ID.get(id);
    if (!l) {
      document.title = "Not found · Leaders Like Me";
      return { html: `<div class="empty"><h2>We couldn't find that person</h2><p>They may have been moved or renamed.</p><a class="btn" href="#/explore">Explore everyone</a></div>` };
    }
    document.title = `${l.name} · Leaders Like Me`;
    const learn = (l.links || [])[0];
    return {
      html: `
        <article class="profile">
          <div class="arc" aria-hidden="true"></div>
          <div class="profile-top">
            <div class="profile-photo">
              ${avatar(l, "avatar--xl")}
              ${heartButton(l, "heart--on-photo")}
            </div>
          </div>

          <div class="name-block">
            <h1>${esc(l.name)}</h1>
            ${l.pronouns ? `<p class="pronouns">${esc(l.pronouns)}</p>` : ""}
            <p>${esc((l.roles || []).join(", "))}</p>
            <p>${esc(years(l))}</p>
            <button type="button" class="link-btn" id="suggest">${ICON.edit} Suggest edit</button>
          </div>

          ${profileTags(l)}
          <p class="bio">${esc(l.bio)}</p>
          ${l.imageCredit ? `<p class="credit">Photo: <a href="${esc(l.imageCredit.url)}" target="_blank" rel="noopener">${esc(l.imageCredit.artist)}</a>${l.imageCredit.license ? ", " + esc(l.imageCredit.license) : ""}, via Wikimedia Commons</p>` : ""}

          <div class="profile-actions">
            ${learn ? `<a class="btn btn--block btn--wide" href="${esc(learn.url)}" target="_blank" rel="noopener" data-deepdive="${esc(l.id)}">Learn more<span class="visually-hidden"> about ${esc(l.name)} (opens ${esc(learn.label)} in a new tab)</span></a>` : ""}
            <div class="row">
              <button type="button" class="btn btn--ghost" id="share">Share</button>
              <a class="btn btn--ghost" href="#/explore${writeQuery({ q: "", tags: (l.identity || []).slice(0, 2), sort: "relevance" })}">Find similar</a>
            </div>
          </div>
        </article>`,
      bind() {
        $("#share").addEventListener("click", async () => {
          const url = location.href;
          try {
            if (navigator.share) { await navigator.share({ title: l.name, text: `${l.name} on Leaders Like Me`, url }); return; }
            await navigator.clipboard.writeText(url);
            toast("Link copied");
          } catch (e) { if (e && e.name !== "AbortError") toast("Couldn't copy the link"); }
        });
        $("#suggest").addEventListener("click", () => openSheet(`
          <form method="dialog" id="suggest-form">
            <h2>Suggest an edit for ${esc(l.name)}</h2>
            <p>Spotted something wrong or missing? Tell us what to change and, if you can, where you found it.</p>
            <label class="visually-hidden" for="suggestion">Your suggestion</label>
            <textarea id="suggestion" required></textarea>
            <div class="actions">
              <button type="button" class="btn btn--ghost" data-close>Cancel</button>
              <button type="submit" class="btn">Send</button>
            </div>
          </form>`, (root) => {
          $("#suggestion", root).focus();
          $("#suggest-form", root).addEventListener("submit", async (e) => {
            e.preventDefault();
            const text = $("#suggestion", root).value.trim();
            if (!text) { $("#suggestion", root).focus(); return; }
            const btn = $("button[type=submit]", root);
            btn.disabled = true;
            btn.textContent = "Sending…";
            try {
              // Sent with the leader's current tags so the Sheet row stays readable.
              await sendSuggestion({
                name: l.name, identity: l.identity || [], field: l.field || [],
                contribution: "Suggested edit: " + text
              });
              sheet.close();
              toast("Thanks! Your suggestion was sent.");
            } catch (err) {
              btn.disabled = false;
              btn.textContent = "Send";
              toast("Couldn't send. Check your internet connection and try again.");
            }
          });
        }));
      }
    };
  }

  function viewFavorites() {
    document.title = "Saves · Leaders Like Me";
    const list = Prefs.favorites().map((id) => BY_ID.get(id)).filter(Boolean);
    return {
      html: `
        <div class="page-head">
          <h1 class="page-title">Saves</h1>
          <p class="notice"><span>Your saves are stored only in this browser on this device. They won't appear on other devices, and clearing your browser data erases them. <a href="#/account">More about this</a></span></p>
        </div>
        ${list.length ? grid(list, "Your saves") : `
          <div class="empty">
            ${ICON.heart.replace("<svg", '<svg style="stroke:var(--coral-500)"')}
            <h2>Nothing saved yet</h2>
            <p>Tap the heart on anyone you'd like to come back to.</p>
            <a class="btn" href="#/explore">Find someone</a>
          </div>`}`
    };
  }

  function likesSheet() {
    let likes = Prefs.likes();
    const group = (kind) => TAGS[kind].map((t) =>
      `<button type="button" class="pill pill-toggle pill--small" data-kind="${kind}" data-like="${t.id}" aria-pressed="${likes.includes(t.id)}">${esc(t.label)}</button>`).join("");
    openSheet(`
      <form method="dialog" id="likes-form">
        <h2>What would you like to see more of?</h2>
        <p>We'll use these to pick leaders for you on the home screen.</p>
        <h3>Identity</h3><div class="pill-row">${group("identity")}</div>
        <h3>Field</h3><div class="pill-row">${group("field")}</div>
        <div class="actions">
          <button type="button" class="btn btn--ghost" data-close>Cancel</button>
          <button type="submit" class="btn">Save</button>
        </div>
      </form>`, (root) => {
      $$("[data-like]", root).forEach((b) => b.addEventListener("click", () => {
        const id = b.dataset.like;
        const on = !likes.includes(id);
        likes = on ? [...likes, id] : likes.filter((x) => x !== id);
        b.setAttribute("aria-pressed", String(on));
      }));
      $("#likes-form", root).addEventListener("submit", () => {
        Prefs.setLikes(likes);
        render();
        toast("Likes saved");
      });
    });
  }

  function viewAccount() {
    document.title = "Your page · Leaders Like Me";
    const likes = Prefs.likes();
    const g = Prefs.game();
    const earnedBadges = BADGES.filter((b) => g.badges[b.id]);
    const badgesBlock = `
      <section class="block">
        <h2 class="eyebrow eyebrow--peach"><a href="#/badges">Badges · ${earnedBadges.length} of ${BADGES.length}</a></h2>
        ${earnedBadges.length
          ? `<div class="badge-row">${earnedBadges.map((b) => `<a href="#/badges" title="${esc(b.name)}">${badgeArt(b, true)}<span class="visually-hidden">${esc(b.name)}</span></a>`).join("")}</div>`
          : `<p class="lede">Play <a href="#/mystery">${GAME_NAME}</a> to earn badges.</p>`}
      </section>`;
    const supportBlock = `
      <section class="block support-card">
        <h2 class="eyebrow eyebrow--peach">Support Leaders Like Me</h2>
        <p>Leaders Like Me is made by a former teacher and has no ads. If it's useful in your classroom or at home, you can help keep it going.</p>
        <div class="game-actions">
          ${ext(LINKS.donate, "Donate on Ko-fi", "btn btn--sm")}
          ${ext(LINKS.patreon, "Give monthly on Patreon", "btn btn--ghost btn--sm")}
        </div>
        <p class="support-alt">Know someone who belongs here? <a href="#/suggest">Suggest a leader</a>.</p>
      </section>`;
    const likesBlock = `
      <section class="block">
        <h2 class="eyebrow eyebrow--green">
          <button type="button" class="link-btn" id="edit-likes" style="color:inherit;font-size:inherit;font-weight:inherit">Likes ${ICON.edit.replace("<svg", '<svg style="stroke:currentColor;fill:none;stroke-width:2"')}</button>
        </h2>
        ${likes.length
          ? `<div class="pill-row">${likes.map((t) => tagPill(t)).join("")}</div>`
          : `<p class="lede">Pick a few identities and fields you'd like to see more of.</p>`}
      </section>`;

    const saves = Prefs.favorites().filter((id) => BY_ID.has(id));
    return {
      html: `
        <div class="page-head">
          <h1 class="page-title">Your page</h1>
        </div>
        <section class="device-note" aria-labelledby="device-h">
          <h2 id="device-h">${ICON.device}Everything here stays on this device</h2>
          <p>Your saves, likes, badges and ${GAME_NAME} progress are stored only in this browser on this device. There are no accounts, so:</p>
          <ul>
            <li>They won't show up on your other devices or browsers.</li>
            <li>Clearing your browser's history or site data erases them.</li>
            <li>Anyone else using this browser can see them, which is worth knowing on a shared school computer.</li>
          </ul>
          <button type="button" class="btn btn--ghost btn--sm" id="clear-device">Clear everything on this device</button>
        </section>
        <section class="block">
          <h2 class="eyebrow"><a href="#/saves">Saves · ${saves.length}</a></h2>
          ${saves.length
            ? `<div class="pill-row">${saves.slice(0, 8).map((id) => `<a class="pill pill--small save-chip" href="#/leader/${encodeURIComponent(id)}">${esc(BY_ID.get(id).name)}</a>`).join("")}${saves.length > 8 ? `<a class="link-btn link-btn--plain" href="#/saves">See all</a>` : ""}</div>`
            : `<p class="lede">Tap the heart on anyone you'd like to come back to.</p>`}
        </section>
        ${likesBlock}
        ${badgesBlock}
        ${supportBlock}`,
      bind() {
        $("#edit-likes").addEventListener("click", likesSheet);
        $("#clear-device").addEventListener("click", () => openSheet(`
          <form method="dialog" id="clear-form">
            <h2>Clear everything on this device?</h2>
            <p>This removes your saves, likes, badges and ${GAME_NAME} progress from this browser. It can't be undone.</p>
            <div class="actions">
              <button type="button" class="btn btn--ghost" data-close>Cancel</button>
              <button type="submit" class="btn">Clear everything</button>
            </div>
          </form>`, (root) => {
          $("#clear-form", root).addEventListener("submit", () => {
            try {
              Object.keys(localStorage).filter((k) => k.startsWith("llm.")).forEach((k) => localStorage.removeItem(k));
            } catch (e) { /* storage unavailable */ }
            render();
            toast("Everything on this device was cleared.");
          });
        }));
      }
    };
  }

  /* ---------------- Mystery Leader: daily puzzle ---------------- */
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Everyone with clues, in a fixed shuffled order so consecutive days differ.
  // Each game uses three clues: a leader's last three (clues are written hardest first,
  // so this drops the hardest when there are four).
  const CLUES_PER_GAME = 3;
  const gameClues = (l) => (l.clues || []).slice(-CLUES_PER_GAME);
  const MYSTERY_POOL = LEADERS.filter((l) => gameClues(l).length === CLUES_PER_GAME)
    .sort((a, b) => hashStr(a.id) - hashStr(b.id));

  const pad2 = (n) => String(n).padStart(2, "0");
  function dayKey(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function dayNumber(key) { const [y, m, d] = key.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
  function keyFromNumber(n) { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }
  function formatDay(key, opts) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, opts || { weekday: "long", month: "long", day: "numeric" });
  }
  function mysteryLeaderFor(key) {
    return MYSTERY_POOL.length ? MYSTERY_POOL[dayNumber(key) % MYSTERY_POOL.length] : null;
  }

  const Game = {
    day(key) { return Prefs.game().days[key] || null; },
    leaderFor(key) {
      const d = Game.day(key);
      return (d && BY_ID.get(d.leaderId)) || mysteryLeaderFor(key);
    },
    // Create the day's record on first move, pinning the leader so it can't change mid-game.
    update(key, patch) {
      const g = Prefs.game();
      const leader = Game.leaderFor(key);
      const base = g.days[key] || { leaderId: leader.id, options: Game.optionsFor(key, leader), revealed: 1, wrong: [], status: "playing", classMode: false };
      g.days[key] = { ...base, ...patch };
      Prefs.setGame(g);
      return g.days[key];
    },
    // The four cards: the answer plus three people who share the most tags with them,
    // so the photos alone don't give it away. Seeded by date, so a class sees the same cards.
    optionsFor(key, leader) {
      const d = Game.day(key);
      if (d && Array.isArray(d.options) && d.options.length) return d.options;
      let seed = hashStr(key + leader.id);
      const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9 >>> 0) / 4294967296);
      const tags = new Set([...(leader.identity || []), ...(leader.field || [])]);
      const others = LEADERS.filter((l) => l.id !== leader.id)
        .map((l) => ({ id: l.id, score: [...(l.identity || []), ...(l.field || [])].filter((t) => tags.has(t)).length + rand() }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((o) => o.id);
      const cards = [leader.id, ...others];
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      return cards;
    }
  };

  /* ---------------- Mystery Leader: badges ----------------
     Earned by how you play, never by which identities you uncover. Nothing is ever taken away. */
  function gameStats(g) {
    const solves = Object.entries(g.days)
      .filter(([, d]) => d.status === "solved" && BY_ID.has(d.leaderId))
      .map(([day, d]) => ({ day, ...d }))
      .sort((a, b) => a.solvedAt - b.solvedAt);
    const solvedIds = Array.from(new Set(solves.map((s) => s.leaderId)));
    const solvedSet = new Set(solvedIds);
    const firstPerKey = (keyFn) => {
      const m = new Map();
      solvedIds.forEach((id) => [].concat(keyFn(BY_ID.get(id))).filter(Boolean).forEach((k) => { if (!m.has(k)) m.set(k, id); }));
      return m;
    };
    const fields = firstPerKey((l) => l.field || []);
    const centuries = firstPerKey((l) => (l.born ? Math.floor(l.born / 100) : null));
    const comebacks = solves.filter((s, i) => i > 0 &&
      dayNumber(dayKey(new Date(s.solvedAt))) - dayNumber(dayKey(new Date(solves[i - 1].solvedAt))) >= 3);
    return {
      solves, solvedIds,
      sharp: solves.filter((s) => s.revealed === 1),
      quick: solves.filter((s) => s.revealed <= 2),
      fields, centuries, comebacks,
      deep: g.deepDives.filter((id) => solvedSet.has(id)),
      kindred: Object.keys(g.reflections).filter((id) => solvedSet.has(id) && String(g.reflections[id]).trim()),
      classSolves: solves.filter((s) => s.classMode)
    };
  }

  const ids = (list) => Array.from(new Set(list.map((s) => (typeof s === "string" ? s : s.leaderId))));
  const BADGES = [
    { id: "first-clue", name: "First Clue", how: "Win your first game.", color: "#80d19b",
      glyph: '<circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 6 6"/>',
      progress: (s) => [s.solves.length, 1], leaders: (s) => ids(s.solves.slice(0, 1)) },
    { id: "sharp-eye", name: "Sharp Eye", how: "Pick the right person on the first clue.", color: "#5bc6e8",
      glyph: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
      progress: (s) => [s.sharp.length, 1], leaders: (s) => ids(s.sharp) },
    { id: "detective", name: "Detective", how: "Win 5, 10, 25 and 50 games to level up.", color: "#f2a77d", levels: [5, 10, 25, 50],
      glyph: '<path d="M8.5 9a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.2-1.5 2.3v.5"/><circle cx="12" cy="19" r="0.6"/>',
      progress: (s) => [s.solves.length, 5], leaders: (s) => s.solvedIds },
    { id: "no-peeking", name: "No Peeking", how: "Win 5 games using two clues or fewer.", color: "#c77bb4",
      glyph: '<path d="M2 10s4 6 10 6 10-6 10-6"/><path d="m6 15-2 3M12 16v3.5M18 15l2 3"/>',
      progress: (s) => [s.quick.length, 5], leaders: (s) => ids(s.quick) },
    { id: "wide-net", name: "Wide Net", how: "Solve mysteries about people in 5 different fields.", color: "#5bc6e8",
      glyph: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
      progress: (s) => [s.fields.size, 5], leaders: (s) => ids([...s.fields.values()]) },
    { id: "time-traveler", name: "Time Traveler", how: "Solve mysteries about people born in 4 different centuries.", color: "#f2a77d",
      glyph: '<path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9"/>',
      progress: (s) => [s.centuries.size, 4], leaders: (s) => ids([...s.centuries.values()]) },
    { id: "deep-dive", name: "Deep Dive", how: "Open “Learn more” about someone after you guess who they are.", color: "#80d19b",
      glyph: '<path d="M3 5c3-1 6-1 9 1v14c-3-2-6-2-9-1zM21 5c-3-1-6-1-9 1v14c3-2 6-2 9-1z"/>',
      progress: (s) => [s.deep.length, 1], leaders: (s) => s.deep },
    { id: "kindred-spirit", name: "Kindred Spirit", how: "After solving, write what you have in common with that person.", color: "#e05a4c",
      glyph: '<path d="M12 20.5 4 12.6A5 5 0 0 1 12 6.3a5 5 0 0 1 8 6.3z"/>',
      progress: (s) => [s.kindred.length, 1], leaders: (s) => s.kindred },
    { id: "class-act", name: "Class Act", how: "Win a game together with class mode on.", color: "#c77bb4",
      glyph: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c0-4 2.7-6.5 6-6.5s6 2.5 6 6.5M10 20c0-4 2.7-6.5 6-6.5s6 2.5 6 6.5"/>',
      progress: (s) => [s.classSolves.length, 1], leaders: (s) => ids(s.classSolves) },
    { id: "comeback", name: "Comeback", how: "Win a game after a few days away. Welcome back!", color: "#80d19b",
      glyph: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3.5V8h-4.5"/>',
      progress: (s) => [s.comebacks.length, 1], leaders: (s) => ids(s.comebacks) }
  ];
  const BADGE = Object.fromEntries(BADGES.map((b) => [b.id, b]));

  function badgeLevel(b, stats) {
    return b.levels ? b.levels.filter((n) => stats.solves.length >= n).length : 0;
  }

  // Status of one badge for display: earned?, label, progress toward the next step.
  function badgeStatus(b, g, stats) {
    const rec = g.badges[b.id];
    const [have, need0] = b.progress(stats);
    let need = need0, name = b.name;
    if (b.levels) {
      const level = (rec && rec.level) || 0;
      if (level) name = `${b.name} · Level ${level}`;
      need = b.levels[Math.min(level, b.levels.length - 1)];
    }
    return { earned: !!rec, rec, name, have: Math.min(have, need), need, maxed: b.levels && rec && rec.level >= b.levels.length };
  }

  // Award anything newly earned; returns [{ badge, level }] for the celebration.
  function awardBadges() {
    const g = Prefs.game();
    const stats = gameStats(g);
    const now = Date.now();
    const fresh = [];
    for (const b of BADGES) {
      const rec = g.badges[b.id];
      if (b.levels) {
        const level = badgeLevel(b, stats);
        if (level > ((rec && rec.level) || 0)) {
          g.badges[b.id] = { earnedAt: rec ? rec.earnedAt : now, level, leveledAt: now };
          fresh.push({ badge: b, level });
        }
      } else if (!rec) {
        const [have, need] = b.progress(stats);
        if (have >= need) { g.badges[b.id] = { earnedAt: now }; fresh.push({ badge: b }); }
      }
    }
    if (fresh.length) Prefs.setGame(g);
    return fresh;
  }

  function checkBadges() {
    const fresh = awardBadges();
    if (fresh.length) celebrate(fresh);
    return fresh;
  }

  // Badge art: the logo's petals around a medallion. Locked badges are outlines.
  function badgeArt(b, earned) {
    const petals = [0, 60, 120, 180, 240, 300].map((a, i) => earned
      ? `<path d="M10 0C18 14 20 26 14 36c-4 5-10 4-12-2C0 26 4 12 10 0z" fill="${b.color}" opacity="${i % 2 ? 0.55 : 0.95}" transform="rotate(${a} 32 32) translate(37 21) rotate(180) scale(.5)"/>`
      : `<path d="M10 0C18 14 20 26 14 36c-4 5-10 4-12-2C0 26 4 12 10 0z" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="3" stroke-dasharray="4 4" transform="rotate(${a} 32 32) translate(37 21) rotate(180) scale(.5)"/>`).join("");
    return `
      <svg class="badge-art${earned ? "" : " is-locked"}" viewBox="0 0 64 64" aria-hidden="true">
        ${petals}
        <circle cx="32" cy="32" r="19" fill="${earned ? "#2e3a56" : "rgba(31,35,48,.5)"}" stroke="${earned ? b.color : "rgba(255,255,255,.4)"}" stroke-width="2.5"/>
        <g transform="translate(20 20)" fill="none" stroke="${earned ? "#fff" : "rgba(255,255,255,.45)"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${b.glyph}</g>
      </svg>`;
  }

  function celebrate(fresh) {
    openSheet(`
      <div class="celebrate">
        <h2>${fresh.length === 1 ? "You earned a badge!" : `You earned ${fresh.length} badges!`}</h2>
        <ul class="celebrate-list">
          ${fresh.map(({ badge, level }) => `
            <li>
              ${badgeArt(badge, true)}
              <div>
                <strong>${esc(badge.name)}${level ? ` · Level ${level}` : ""}</strong>
                <span>${esc(badge.how)}</span>
              </div>
            </li>`).join("")}
        </ul>
        <p>Badges are stored in this browser on this device.</p>
        <div class="actions">
          <a class="btn btn--ghost" href="#/badges" data-close>See all badges</a>
          <button type="button" class="btn" data-close>Keep going</button>
        </div>
      </div>`);
  }

  // "Learn more" after solving counts toward Deep Dive (on the result card or the profile).
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-deepdive]");
    if (!a) return;
    const id = a.dataset.deepdive;
    const g = Prefs.game();
    const solved = Object.values(g.days).some((d) => d.status === "solved" && d.leaderId === id);
    if (!solved || g.deepDives.includes(id)) return;
    g.deepDives.push(id);
    Prefs.setGame(g);
    checkBadges();
  });

  /* ---------------- Mystery Leader: screens ---------------- */
  function mysteryTeaser() {
    if (!MYSTERY_POOL.length) return "";
    const key = dayKey();
    const l = Game.leaderFor(key);
    const d = Game.day(key);
    const status = !d ? "New today" : d.status === "solved" ? `Solved with ${d.revealed} ${d.revealed === 1 ? "clue" : "clues"}` : d.status === "revealed" ? "Answer revealed" : "In progress";

    // Once today's game is finished, show who it was instead of the mystery.
    if (d && d.status !== "playing") {
      return `
      <section class="block" aria-labelledby="mys-h">
        <h2 class="eyebrow eyebrow--peach" id="mys-h">Today's ${GAME_NAME}</h2>
        <article class="spotlight">
          ${avatar(l, "avatar--xl")}
          <div>
            <h3><a class="card-link" href="#/leader/${encodeURIComponent(l.id)}">${esc(l.name)}</a></h3>
            <p>${esc((l.roles || []).join(", "))}${years(l) ? " · " + esc(years(l)) : ""}</p>
            <p class="teaser-status">${esc(status)} ✓</p>
          </div>
        </article>
      </section>`;
    }

    return `
      <section class="block" aria-labelledby="mys-h">
        <h2 class="eyebrow eyebrow--peach" id="mys-h">Today's ${GAME_NAME}</h2>
        <article class="spotlight">
          <div class="avatar avatar--xl avatar--mystery" aria-hidden="true"><span>?</span></div>
          <div>
            <h3><a class="card-link" href="#/mystery">Who is it?</a></h3>
            <p class="bio-snip">“${esc(gameClues(l)[0])}”</p>
            <p class="teaser-status">${esc(status)} ${d && d.status !== "playing" ? "✓" : "→"}</p>
          </div>
        </article>
      </section>`;
  }

  function viewMystery(params) {
    document.title = `${GAME_NAME} · Leaders Like Me`;
    if (!MYSTERY_POOL.length) {
      return { html: `<div class="page-head"><h1 class="page-title">${GAME_NAME}</h1></div>
        <div class="empty">${ICON.book}<h2>${GAME_NAME} is on its way</h2><p>Once leaders with clues are added, there'll be a new one every day.</p></div>` };
    }
    const today = dayKey();
    const todayN = dayNumber(today);
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(params.day) && dayNumber(params.day) <= todayN && todayN - dayNumber(params.day) <= 30;
    const key = valid ? params.day : today;
    const isToday = key === today;
    const leader = Game.leaderFor(key);
    const classOn = store.get("classMode", false);
    const archive = [1, 2, 3, 4, 5, 6, 7].map((n) => keyFromNumber(todayN - n));
    if (!isToday) archive.unshift(today);

    return {
      html: `
        <div class="page-head">
          <p class="eyebrow eyebrow--peach">${isToday ? "Today's game" : "Earlier game"} · ${esc(formatDay(key))}</p>
          <h1 class="page-title">${GAME_NAME}</h1>
          <p class="lede">Which of these four leaders matches the clues? You get up to three clues, and every wrong pick unlocks the next one.</p>
          <label class="switch">
            <input type="checkbox" role="switch" id="class-mode" ${classOn ? "checked" : ""}>
            <span class="track" aria-hidden="true"></span>
            <span>Class mode <span class="muted">· bigger text for the whole room</span></span>
          </label>
        </div>
        <div id="game"></div>
        <section class="block" aria-labelledby="mine-h">
          <h2 class="eyebrow" id="mine-h">Your badges · <a href="#/badges">See all</a></h2>
          <div id="badge-preview"></div>
        </section>
        <section class="block" aria-labelledby="arch-h">
          <h2 class="eyebrow" id="arch-h">${isToday ? "Earlier games" : "Other games"}</h2>
          <ul class="archive">
            ${archive.map((k) => {
              const d = Game.day(k);
              const st = !d ? "Not played" : d.status === "solved" ? "Solved ✓" : d.status === "revealed" ? "Revealed" : "In progress";
              return `<li><a href="#/mystery${k === today ? "" : "?day=" + k}"><span>${k === today ? "Today" : esc(formatDay(k, { weekday: "short", month: "short", day: "numeric" }))}</span><span class="st${d && d.status === "solved" ? " st--done" : ""}">${st}</span></a></li>`;
            }).join("")}
          </ul>
        </section>`,
      bind() {
        let feedback = "";
        let newClue = -1;

        const paintBadges = () => {
          const g = Prefs.game();
          const earned = BADGES.filter((b) => g.badges[b.id]);
          $("#badge-preview").innerHTML = earned.length
            ? `<div class="badge-row">${earned.map((b) => `<a href="#/badges" title="${esc(badgeStatus(b, g, gameStats(g)).name)}">${badgeArt(b, true)}<span class="visually-hidden">${esc(b.name)}</span></a>`).join("")}</div>`
            : `<p class="lede">Win a game to earn your first badge.</p>`;
        };

        const paint = (focusGuess) => {
          const d = Game.day(key) || { revealed: 1, wrong: [], status: "playing" };
          const done = d.status !== "playing";
          const clues = gameClues(leader);
          const shown = done ? clues.length : Math.min(d.revealed, clues.length);
          const solved = d.status === "solved";
          const learn = (leader.links || [])[0];
          const first = leader.name.split(" ")[0];

          $("#game").innerHTML = `
            ${done ? `
              <div class="result" tabindex="-1" id="result">
                <p class="eyebrow eyebrow--green">${solved ? `You got it with ${d.revealed} ${d.revealed === 1 ? "clue" : "clues"}!` : "Here's who it was"}</p>
                <div class="result-person">
                  ${avatar(leader, "avatar--xl")}
                  <div>
                    <h2>${esc(leader.name)}</h2>
                    <p>${esc((leader.roles || []).join(", "))}</p>
                    <p class="muted">${esc(years(leader))}</p>
                  </div>
                </div>
                ${profileTags(leader)}
                <p class="bio">${esc(leader.bio)}</p>
                <div class="game-actions">
                  <a class="btn btn--sm" href="#/leader/${encodeURIComponent(leader.id)}">Read profile</a>
                  ${learn ? `<a class="btn btn--ghost btn--sm" href="${esc(learn.url)}" target="_blank" rel="noopener" data-deepdive="${esc(leader.id)}">Learn more<span class="visually-hidden"> (opens ${esc(learn.label)} in a new tab)</span></a>` : ""}
                  ${heartButton(leader)}
                </div>
                ${solved ? `
                  <form class="reflect" id="reflect">
                    <label for="reflection">What do you have in common with ${esc(first)}?</label>
                    <textarea id="reflection" placeholder="A goal, an interest, something you've faced…">${esc(Prefs.game().reflections[leader.id] || "")}</textarea>
                    <div class="reflect-foot">
                      <span class="muted">Only you can see this.</span>
                      <button class="btn btn--sm" type="submit">Save</button>
                    </div>
                  </form>` : `<p class="lede">No badge this time, but there's a new game every day. Try an earlier one below.</p>`}
              </div>` : `
              <p class="feedback" id="feedback" role="status">${esc(feedback)}</p>
              <div class="cards" role="group" aria-label="Who is it? Pick one">
                ${Game.optionsFor(key, leader).map((id) => {
                  const p = BY_ID.get(id);
                  if (!p) return "";
                  const out = d.wrong.includes(id);
                  return `
                    <button type="button" class="pick${out ? " is-out" : ""}" data-pick="${esc(id)}" ${out ? 'aria-disabled="true"' : ""}>
                      ${avatar(p)}
                      <span class="pick-name">${esc(p.name)}</span>
                      ${out ? `<span class="pick-note">Not them</span>` : ""}
                    </button>`;
                }).join("")}
              </div>`}
            <ol class="clues">
              ${clues.map((c, i) => i < shown
                ? `<li class="clue${i === newClue ? " clue--new" : ""}"><span class="n">Clue ${i + 1}</span><p>${esc(c)}</p></li>`
                : `<li class="clue clue--locked">
                    <span class="n">${ICON.lock}Clue ${i + 1} · Locked</span>
                    <p>${i === shown ? "A wrong pick unlocks this clue." : "Unlocks after another wrong pick."}</p>
                    <span class="redacted" aria-hidden="true"><i></i><i></i></span>
                  </li>`).join("")}
            </ol>
            `;

          newClue = -1;
          if (!done) {
            $$("[data-pick]").forEach((b) => b.addEventListener("click", () => onPick(b.dataset.pick)));
            if (focusGuess) {
              const firstOpen = $(".pick:not(.is-out)");
              if (firstOpen) firstOpen.focus();
            }
          } else if (solved) {
            $("#reflect").addEventListener("submit", (e) => {
              e.preventDefault();
              const g = Prefs.game();
              const text = $("#reflection").value.trim();
              if (text) g.reflections[leader.id] = text; else delete g.reflections[leader.id];
              Prefs.setGame(g);
              if (!checkBadges().length) toast(text ? "Saved" : "Cleared");
              paintBadges();
            });
          }
        };

        const onPick = (id) => {
          const d = Game.day(key) || { revealed: 1, wrong: [] };
          if (d.wrong.includes(id)) return;
          if (id === leader.id) {
            Game.update(key, { status: "solved", solvedAt: Date.now(), classMode: store.get("classMode", false) });
            paint();
            $("#result").focus();
            checkBadges();
            paintBadges();
            return;
          }
          const name = BY_ID.get(id).name;
          const more = d.revealed < CLUES_PER_GAME;
          Game.update(key, { wrong: [...d.wrong, id], revealed: more ? d.revealed + 1 : d.revealed });
          if (more) newClue = d.revealed;
          feedback = more ? `Not ${name}. Here's another clue.` : `Not ${name}. Try another card.`;
          paint(true);
        };

        $("#class-mode").addEventListener("change", (e) => {
          store.set("classMode", e.target.checked);
          document.body.classList.toggle("class-mode", e.target.checked);
        });

        paint();
        paintBadges();
      }
    };
  }

  function viewBadges() {
    document.title = "Badges · Leaders Like Me";
    const g = Prefs.game();
    const stats = gameStats(g);
    const earned = BADGES.filter((b) => g.badges[b.id]).length;
    return {
      html: `
        <div class="page-head">
          <p class="eyebrow eyebrow--peach"><a href="#/mystery">${GAME_NAME}</a></p>
          <h1 class="page-title">Badges</h1>
          <p class="lede">${earned} of ${BADGES.length} earned. You earn badges by how you play, and you never lose one.</p>
          <p class="notice"><span>Badges are stored only in this browser on this device.</span></p>
        </div>
        <div class="badge-grid">
          ${BADGES.map((b) => {
            const st = badgeStatus(b, g, stats);
            const sub = st.earned
              ? (b.levels && !st.maxed ? `Next level: ${st.have} of ${st.need}` : `Earned ${new Date(st.rec.leveledAt || st.rec.earnedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`)
              : st.need > 1 ? `${st.have} of ${st.need}` : "Not yet";
            const pct = Math.round((st.have / st.need) * 100);
            return `
              <button type="button" class="badge${st.earned ? " is-earned" : ""}" data-badge="${b.id}">
                ${badgeArt(b, st.earned)}
                <span class="badge-name">${esc(st.name)}</span>
                <span class="badge-sub">${esc(sub)}</span>
                ${(!st.earned || (b.levels && !st.maxed)) && st.need > 1 ? `<span class="meter" aria-hidden="true"><span style="width:${pct}%"></span></span>` : ""}
              </button>`;
          }).join("")}
        </div>`,
      bind() {
        $$("[data-badge]").forEach((btn) => btn.addEventListener("click", () => {
          const b = BADGE[btn.dataset.badge];
          const st = badgeStatus(b, g, stats);
          const people = st.earned ? b.leaders(stats).map((id) => BY_ID.get(id)).filter(Boolean) : [];
          openSheet(`
            <div class="badge-detail">
              ${badgeArt(b, st.earned)}
              <h2>${esc(st.name)}</h2>
              <p>${esc(b.how)}</p>
              ${st.earned
                ? `<p class="muted">Earned ${esc(new Date(st.rec.earnedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }))}</p>`
                : `<p class="muted">Progress: ${st.have} of ${st.need}</p>`}
              ${people.length ? `<h3>Earned with</h3><ul class="people-list">${people.map((l) => `<li><a href="#/leader/${encodeURIComponent(l.id)}" data-close>${esc(l.name)}</a></li>`).join("")}</ul>` : ""}
              <div class="actions">
                ${st.earned ? "" : `<a class="btn btn--ghost" href="#/mystery" data-close>Play today's ${GAME_NAME}</a>`}
                <button type="button" class="btn" data-close>Close</button>
              </div>
            </div>`);
        }));
      }
    };
  }

  /* ---------------- Collections ---------------- */
  const COLLECTIONS = (Array.isArray(window.LLM_COLLECTIONS) ? window.LLM_COLLECTIONS : []).map((c) => {
    const m = c.match || {};
    const members = LEADERS.filter((l) => {
      const tags = [...(l.identity || []), ...(l.field || [])];
      if (m.all && !m.all.every((t) => tags.includes(t))) return false;
      if (m.any && !m.any.some((t) => tags.includes(t))) return false;
      if (m.bornFrom && !(l.born >= m.bornFrom)) return false;
      return true;
    }).sort((a, b) => lastName(a).localeCompare(lastName(b)));
    return { ...c, members };
  }).filter((c) => c.members.length);
  const COLLECTION = Object.fromEntries(COLLECTIONS.map((c) => [c.id, c]));

  function isFeatured(c, key = dayKey()) {
    const md = key.slice(5);
    return (c.windows || []).some(([from, to]) => md >= from && md <= to);
  }

  const ACCENTS = ["var(--green-400)", "var(--sky-400)", "var(--peach-300)", "var(--plum-400)"];
  function collectionCard(c, i) {
    const faces = c.members.filter((l) => l.image).slice(0, 4);
    return `
      <article class="collection-card" style="--accent:${ACCENTS[i % ACCENTS.length]}">
        <div class="face-stack" aria-hidden="true">${faces.map((l) => avatar(l)).join("")}</div>
        <h3><a class="card-link" href="#/collections/${encodeURIComponent(c.id)}">${esc(c.title)}</a></h3>
        <p class="collection-meta">${c.when ? esc(c.when) + " · " : ""}${c.members.length} ${c.members.length === 1 ? "leader" : "leaders"}</p>
      </article>`;
  }

  function viewCollections() {
    document.title = "Collections · Leaders Like Me";
    const featured = COLLECTIONS.filter((c) => isFeatured(c));
    const months = COLLECTIONS.filter((c) => c.windows);
    const topics = COLLECTIONS.filter((c) => !c.windows);
    const section = (id, title, list, offset) => list.length ? `
      <section class="block" aria-labelledby="${id}">
        <h2 class="eyebrow ${id === "now-h" ? "eyebrow--peach" : ""}" id="${id}">${title}</h2>
        <div class="collection-grid">${list.map((c, i) => collectionCard(c, i + offset)).join("")}</div>
      </section>` : "";
    return {
      html: `
        <div class="page-head">
          <h1 class="page-title">Collections</h1>
          <p class="lede">Ready-made sets of leaders for heritage months, lessons and topics. They grow as new leaders are added.</p>
        </div>
        ${COLLECTIONS.length ? `
          ${section("now-h", "This month", featured, 0)}
          ${section("months-h", "Heritage & awareness months", months, 1)}
          ${section("topics-h", "Topics", topics, 2)}` : emptyRepo()}`
    };
  }

  function viewCollection(id, params = {}) {
    const c = COLLECTION[id];
    if (!c) {
      document.title = "Not found · Leaders Like Me";
      return { html: `<div class="empty"><h2>We couldn't find that collection</h2><a class="btn" href="#/collections">All collections</a></div>` };
    }
    document.title = `${c.title} · Leaders Like Me`;
    // Field pills for the fields that actually appear in this collection, in tag order.
    const fieldCount = (f) => c.members.filter((l) => (l.field || []).includes(f)).length;
    const fields = TAGS.field.map((t) => t.id).filter((f) => fieldCount(f) > 0);
    let picked = (params.tags || []).filter((t) => fields.includes(t));
    return {
      html: `
        <div class="page-head">
          <p class="eyebrow eyebrow--peach"><a href="#/collections">Collections</a>${c.when ? " · " + esc(c.when) : ""}</p>
          <h1 class="page-title">${esc(c.title)}</h1>
          <p class="lede">${esc(c.intro || "")}</p>
          ${isFeatured(c) ? `<p class="notice"><strong>This month</strong> This collection is featured right now.</p>` : ""}
        </div>
        ${fields.length > 1 ? `
          <div class="collection-filter" role="group" aria-labelledby="cf-label">
            <h2 class="eyebrow eyebrow--sky" id="cf-label">Show people in</h2>
            <div class="pill-row">
              ${fields.map((f) => `<button type="button" class="pill pill-toggle pill--small" data-kind="field" data-cfield="${f}" aria-pressed="${picked.includes(f)}">${esc(TAG[f].label)} <span class="pill-count">${fieldCount(f)}</span></button>`).join("")}
              <button type="button" class="link-btn link-btn--plain" id="cf-clear" ${picked.length ? "" : "hidden"}>Show everyone</button>
            </div>
          </div>` : ""}
        <div class="results-bar"><span id="count" aria-live="polite"></span></div>
        <div id="collection-list"></div>
        ${suggestCard()}`,
      bind() {
        const update = () => {
          const qs = picked.length ? "?t=" + picked.join(",") : "";
          history.replaceState(null, "", `#/collections/${encodeURIComponent(c.id)}${qs}`);
          // Any of the picked fields counts, so picking two shows both groups.
          const list = picked.length ? c.members.filter((l) => (l.field || []).some((f) => picked.includes(f))) : c.members;
          $("#count").textContent = `${list.length} ${list.length === 1 ? "leader" : "leaders"}${picked.length ? ` in ${picked.map((f) => TAG[f].label).join(" or ")}` : ""}`;
          $("#collection-list").innerHTML = grid(list, "Leaders in this collection");
          $$("[data-cfield]").forEach((b) => b.setAttribute("aria-pressed", String(picked.includes(b.dataset.cfield))));
          const clear = $("#cf-clear");
          if (clear) clear.hidden = !picked.length;
        };
        $$("[data-cfield]").forEach((b) => b.addEventListener("click", () => {
          const f = b.dataset.cfield;
          picked = picked.includes(f) ? picked.filter((x) => x !== f) : [...picked, f];
          update();
        }));
        const clear = $("#cf-clear");
        if (clear) clear.addEventListener("click", () => { picked = []; update(); $("[data-cfield]").focus(); });
        update();
      }
    };
  }

  function viewSuggest() {
    document.title = "Suggest a leader · Leaders Like Me";
    const chips = (kind) => TAGS[kind].map((t) => `
      <label class="check-pill" data-kind="${kind}">
        <input type="checkbox" name="${kind}" value="${t.id}">
        <span>${esc(t.label)}</span>
      </label>`).join("");
    const formHTML = `
      <form id="suggest-leader" class="suggest-form" novalidate>
        <div id="sg-errors" class="form-errors" role="alert" tabindex="-1" hidden></div>

        <div class="form-row">
          <label for="sg-name">Their name <span class="req">(required)</span></label>
          <input id="sg-name" class="text-input" type="text" autocomplete="off" aria-describedby="sg-dup" required>
          <p id="sg-dup" class="hint-text" aria-live="polite"></p>
        </div>

        <fieldset class="form-row" id="sg-identity-set">
          <legend>How do they identify? <span class="req">(choose at least one)</span></legend>
          <div class="check-pills">${chips("identity")}</div>
          <label for="sg-identity-other" class="sub-label">Something else? (optional)</label>
          <input id="sg-identity-other" class="text-input" type="text" autocomplete="off">
        </fieldset>

        <fieldset class="form-row" id="sg-field-set">
          <legend>What field are they in? <span class="req">(choose at least one)</span></legend>
          <div class="check-pills">${chips("field")}</div>
          <label for="sg-field-other" class="sub-label">Something else? (optional)</label>
          <input id="sg-field-other" class="text-input" type="text" autocomplete="off">
        </fieldset>

        <div class="form-row">
          <label for="sg-contribution">What did they do? <span class="req">(optional, but it helps)</span></label>
          <textarea id="sg-contribution" class="text-input" rows="4"></textarea>
        </div>

        <div class="form-row">
          <label for="sg-link">A link to learn more <span class="req">(optional)</span></label>
          <input id="sg-link" class="text-input" type="url" inputmode="url" placeholder="https://" autocomplete="off">
        </div>

        <div class="hp" aria-hidden="true">
          <label for="sg-website">Leave this empty</label>
          <input id="sg-website" type="text" tabindex="-1" autocomplete="off">
        </div>

        <p class="hint-text form-row">Please don't include your own name or other personal information.</p>
        <button class="btn" type="submit">Send suggestion</button>
      </form>`;

    return {
      html: `
        <div class="page-head">
          <h1 class="page-title">Suggest a leader</h1>
          <p class="lede">Know someone who belongs in Leaders Like Me? Tell us about them. Every suggestion is reviewed before anyone is added.</p>
        </div>
        <div id="suggest-area">${formHTML}</div>`,
      bind() {
        const area = $("#suggest-area");
        const wire = () => {
          const form = $("#suggest-leader");
          const nameInput = $("#sg-name");

          // Let people know if the person is already here.
          let t;
          nameInput.addEventListener("input", () => {
            clearTimeout(t);
            t = setTimeout(() => {
              const q = nameKey(nameInput.value);
              const hits = q.length >= 4 ? LEADERS.filter((l) => nameKey(l.name).includes(q)).slice(0, 3) : [];
              $("#sg-dup").innerHTML = hits.length
                ? `Already in Leaders Like Me: ${hits.map((l) => `<a href="#/leader/${encodeURIComponent(l.id)}">${esc(l.name)}</a>`).join(", ")}`
                : "";
            }, 250);
          });

          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const checked = (kind) => $$(`input[name=${kind}]:checked`, form).map((i) => i.value);
            const data = {
              name: nameInput.value.trim(),
              identity: checked("identity"),
              field: checked("field"),
              identityOther: $("#sg-identity-other").value.trim(),
              fieldOther: $("#sg-field-other").value.trim(),
              contribution: $("#sg-contribution").value.trim(),
              link: $("#sg-link").value.trim()
            };

            const errors = [];
            const mark = (el, bad) => el.setAttribute("aria-invalid", bad ? "true" : "false");
            mark(nameInput, !data.name);
            if (!data.name) errors.push(["sg-name", "Add the person's name."]);
            const noIdentity = !data.identity.length && !data.identityOther;
            mark($("#sg-identity-set"), noIdentity);
            if (noIdentity) errors.push(["sg-identity-set", "Choose at least one way they identify."]);
            const noField = !data.field.length && !data.fieldOther;
            mark($("#sg-field-set"), noField);
            if (noField) errors.push(["sg-field-set", "Choose at least one field."]);
            const badLink = data.link && !/^https?:\/\/\S+\.\S+/i.test(data.link);
            mark($("#sg-link"), !!badLink);
            if (badLink) errors.push(["sg-link", "Links need to start with https:// (or leave it blank)."]);

            const box = $("#sg-errors");
            if (errors.length) {
              box.innerHTML = `<p><strong>Please fix ${errors.length === 1 ? "this" : "these"}:</strong></p><ul>${errors.map(([id, msg]) => `<li><a href="#${id}" data-jump="${id}">${esc(msg)}</a></li>`).join("")}</ul>`;
              box.hidden = false;
              $$("[data-jump]", box).forEach((a) => a.addEventListener("click", (ev) => {
                ev.preventDefault();
                const target = document.getElementById(a.dataset.jump);
                (target.matches("fieldset") ? $("input", target) : target).focus();
              }));
              box.focus();
              return;
            }
            box.hidden = true;

            const done = () => {
              area.innerHTML = `
                <div class="empty" tabindex="-1" id="sg-thanks">
                  ${ICON.heart.replace("<svg", '<svg style="stroke:var(--peach-text)"')}
                  <h2>Thank you!</h2>
                  <p>Your suggestion for ${esc(data.name)} was sent. Every suggestion is reviewed before anyone is added.</p>
                  <div class="game-actions" style="justify-content:center">
                    <button type="button" class="btn" id="sg-again">Suggest someone else</button>
                    <a class="btn btn--ghost" href="#/home">Back to home</a>
                  </div>
                </div>`;
              $("#sg-thanks").focus();
              $("#sg-again").addEventListener("click", () => { area.innerHTML = formHTML; wire(); $("#sg-name").focus(); });
            };

            // A filled hidden field means a bot; pretend it worked.
            if ($("#sg-website").value) { done(); return; }
            if (Date.now() - store.get("lastSuggestionAt", 0) < 15000) {
              box.innerHTML = "<p>Thanks for all the suggestions! Please wait a few seconds before sending another.</p>";
              box.hidden = false;
              box.focus();
              return;
            }

            const btn = $("button[type=submit]", form);
            btn.disabled = true;
            btn.textContent = "Sending…";
            try {
              await sendSuggestion(data);
              done();
            } catch (err) {
              btn.disabled = false;
              btn.textContent = "Send suggestion";
              box.innerHTML = "<p>Your suggestion couldn't be sent. Check your internet connection and try again.</p>";
              box.hidden = false;
              box.focus();
            }
          });
        };
        wire();
      }
    };
  }

  function viewAccessibility() {
    document.title = "Accessibility · Leaders Like Me";
    return {
      html: `
        <div class="page-head">
          <h1 class="page-title">Accessibility</h1>
          <p class="lede">Leaders Like Me is for every student, so it's built to work for everyone, including people who use screen readers, keyboards, switch controls or zoom.</p>
        </div>
        <section class="block prose">
          <h2>Our standard</h2>
          <p>We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at Level AA, the standard schools and districts use.</p>
          <h2>What we've done</h2>
          <ul>
            <li>All text meets WCAG contrast requirements across the whole background.</li>
            <li>Everything works with a keyboard, with a clear focus outline on every control.</li>
            <li>Pages, buttons, forms and the Guess Who game are labeled for screen readers, and results and game feedback are announced.</li>
            <li>When you move to a new page, focus moves to its heading.</li>
            <li>Layouts reflow down to small phone widths and stay usable when zoomed to 200%.</li>
            <li>Animation is minimal and turns off if your device asks for reduced motion.</li>
            <li>Class mode enlarges the game's text for projecting.</li>
          </ul>
          <h2>Known limitations</h2>
          <ul>
            <li>“Learn more” links go to other websites, such as Wikipedia, which we don't control.</li>
            <li>Leader photos are treated as decorative because each one appears next to the person's name.</li>
          </ul>
          ${LINKS.accessibilityContact ? `<h2>Tell us about a problem</h2><p>If something doesn't work for you, please <a href="${esc(LINKS.accessibilityContact)}">let us know</a>.</p>` : ""}
        </section>`
    };
  }

  /* ---------------- Router ---------------- */
  let currentRoute = "";
  let firstRender = true;

  function parseHash() {
    const raw = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    return { name: parts[0] || "", arg: decodeURIComponent(parts[1] || ""), params: readQuery(qs) };
  }

  function render() {
    const { name, arg, params } = parseHash();

    // First visit: show the log-in screen, which also offers "continue without an account".
    if (!name) {
      location.replace("#/home");
      return;
    }

    const routes = {
      home: viewHome,
      explore: () => viewExplore(params),
      search: () => viewExplore(params),   // old links
      browse: () => viewExplore(params),   // old links
      collections: () => (arg ? viewCollection(arg, params) : viewCollections()),
      leader: () => viewLeader(arg),
      saves: viewFavorites,
      favorites: viewFavorites, // old links
      account: viewAccount,
      mystery: () => viewMystery(params),
      badges: viewBadges,
      accessibility: viewAccessibility,
      suggest: viewSuggest
    };
    const make = routes[name] || viewHome;
    const ALIASES = { favorites: "saves", search: "explore", browse: "explore", welcome: "home", signup: "home", me: "account" };
    currentRoute = ALIASES[name] || (routes[name] ? name : "home");

    $("#topbar").hidden = false;
    $("#tabbar").hidden = false;

    document.body.classList.toggle("class-mode", currentRoute === "mystery" && store.get("classMode", false));
    const navKey = currentRoute === "badges" ? "mystery" : currentRoute;
    $$("[data-nav]").forEach((a) => {
      if (a.dataset.nav === navKey) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    $("#account-chip").innerHTML = `${ICON.user}<span>You</span>`;

    const view = make();
    app.innerHTML = view.html + siteFooter();
    if (view.bind) view.bind();

    if (!firstRender) {
      window.scrollTo(0, 0);
      const h1 = app.querySelector("h1");
      if (h1) {
        h1.setAttribute("tabindex", "-1");
        h1.focus({ preventScroll: true });
      } else {
        app.focus({ preventScroll: true });
      }
    }
    firstRender = false;
  }

  $(".logo--small").innerHTML = logoInner();
  window.addEventListener("hashchange", render);
  render();
})();
