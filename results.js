const PER_PAGE = 100;
const VERDICTS = {
  consensus_yes: "Consensus yes",
  consensus_no: "Consensus no",
  disputed: "Disputed",
  single_vote: "Only one vote",
  unswiped: "No votes yet",
};

let decks = [], deck = null, rows = [], users = [], comments = new Map();
let page = 0;
const f = { user: "", direction: "", verdict: "" };

const controls = el("div", { class: "row" });
const summary = el("div", { class: "row" });
const tableBox = el("div");
const dialog = el("dialog");

function select(label, options, value, onchange) {
  const s = el("select", { "aria-label": label, onchange: (e) => onchange(e.target.value) },
    options.map(([v, text]) => el("option", { value: v }, text)));
  s.value = value;
  return s;
}

async function init() {
  decks = must(await db.from("decks").select("*").order("created_at", { ascending: false }));
  if (!decks.length) {
    return fill(tableBox, el("p", { class: "empty" }, "No decks yet. ", el("a", { href: "admin.html" }, "Create one on the Admin page.")));
  }
  const wanted = new URLSearchParams(location.search).get("deck");
  await loadDeck((decks.find((d) => d.id === wanted) || decks[0]).id);
}

async function loadDeck(id, keepFilters) {
  deck = decks.find((d) => d.id === id);
  fill(tableBox, el("p", { class: "empty" }, "Loading…"));
  const [r, c] = await Promise.all([
    fetchAll(() => db.from("item_results").select("*").eq("deck_id", id).order("position")),
    fetchAll(() => db.from("comments").select("*").eq("deck_id", id).order("id")),
  ]);
  if (deck.id !== id) return; // a newer selection won
  rows = r;
  comments = new Map();
  for (const m of c) addComment(m);
  users = [...new Set(rows.flatMap((x) => Object.keys(x.votes)))].sort();
  if (!keepFilters || (f.user && !users.includes(f.user))) { f.user = f.direction = f.verdict = ""; page = 0; }
  history.replaceState(null, "", "?deck=" + id);
  renderControls();
  renderTable();
}

function addComment(m) {
  if (!comments.has(m.item_id)) comments.set(m.item_id, []);
  comments.get(m.item_id).push(m);
}

function filtered() {
  return rows.filter((r) => {
    if (f.verdict && r.verdict !== f.verdict) return false;
    const votes = f.user ? [r.votes[f.user]].filter(Boolean) : Object.values(r.votes);
    if (f.user && !votes.length) return false;
    if (f.direction && !votes.includes(f.direction)) return false;
    return true;
  });
}

function setFilter(key, value) {
  f[key] = value;
  page = 0;
  renderControls();
  renderTable();
}

function renderControls() {
  const who = f.user ? shortName(f.user) : "Anyone";
  fill(controls, 
    select("Deck", decks.map((d) => [d.id, d.name + (d.status === "archived" ? " (archived)" : "")]), deck.id, (id) => run(() => loadDeck(id))),
    select("User", [["", "Everyone"], ...users.map((u) => [u, shortName(u) + " only"])], f.user, (v) => setFilter("user", v)),
    select("Vote", [["", "Any vote"], ["yes", `${who} voted yes`], ["no", `${who} voted no`]], f.direction, (v) => setFilter("direction", v)),
    select("Verdict", [["", "All verdicts"], ...Object.entries(VERDICTS)], f.verdict, (v) => setFilter("verdict", v)),
    f.user || f.direction || f.verdict
      ? el("button", { class: "link", onclick: () => { f.user = f.direction = f.verdict = ""; setFilter("verdict", ""); } }, "Clear filters") : null,
    el("button", { style: "margin-left:auto", title: "Reload the latest swipes", onclick: () => run(() => loadDeck(deck.id, true)) }, "Refresh"),
    el("button", { onclick: exportCsv }, "Export CSV"));

  // Verdict counts double as one-click filters.
  const n = (v) => rows.filter((r) => r.verdict === v).length;
  fill(summary, 
    ...Object.entries(VERDICTS).map(([v, label]) =>
      el("button", { class: `tag chip ${v}${f.verdict === v ? " picked" : ""}`, onclick: () => setFilter("verdict", f.verdict === v ? "" : v) },
        `${label}: ${n(v).toLocaleString()}`)),
    el("span", { class: "muted", style: "margin-left:auto" },
      users.length
        ? users.map((u) => `${shortName(u)} ${rows.filter((r) => r.votes[u]).length.toLocaleString()}/${rows.length.toLocaleString()}`).join(" · ")
        : "Nobody has swiped this deck yet"));
}

function renderTable() {
  const list = filtered();
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  page = Math.min(page, pages - 1);
  const slice = list.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const mark = (v) => (v === "yes" ? el("span", { class: "yes" }, "✓ Yes") : v === "no" ? el("span", { class: "no" }, "✗ No") : el("span", { class: "muted" }, "—"));
  const details = (deck.detail_fields || []).filter((d) => d !== deck.title_field);

  fill(tableBox, 
    list.length ? el("div", { class: "scroll" }, el("table", null,
      el("tr", null, ["#", deck.title_field, ...details, ...users.map(shortName), "Verdict", "Comments"].map((h) => el("th", null, h))),
      slice.map((r) => {
        const count = (comments.get(r.item_id) || []).length;
        return el("tr", null,
          el("td", { class: "muted" }, r.position + 1),
          el("td", null, el("b", null, titleOf(deck, r.fields))),
          details.map((d) => el("td", null, linkify(r.fields[d] || ""))),
          users.map((u) => el("td", null, mark(r.votes[u]))),
          el("td", null, el("span", { class: "tag " + r.verdict }, VERDICTS[r.verdict])),
          el("td", null, el("button", { class: "link", onclick: () => openThread(r) }, count ? `💬 ${count}` : "Add comment")));
      })))
      : el("p", { class: "empty" }, rows.length ? "Nothing matches these filters." : "This deck has no cards."),
    list.length > PER_PAGE ? el("div", { class: "row center", style: "margin-top:14px" },
      el("button", { disabled: page === 0, onclick: () => { page--; renderTable(); scrollTo(0, 0); } }, "← Prev"),
      el("span", { class: "muted" }, `Page ${page + 1} of ${pages}`),
      el("button", { disabled: page >= pages - 1, onclick: () => { page++; renderTable(); scrollTo(0, 0); } }, "Next →")) : null,
    el("p", { class: "muted", style: "text-align:center" }, `Showing ${list.length.toLocaleString()} of ${rows.length.toLocaleString()} cards`));
}

function openThread(r) {
  const thread = el("div", { class: "thread" });
  const draw = () => {
    const list = comments.get(r.item_id) || [];
    fill(thread, ...(list.length
      ? list.map((m) => el("div", { class: "msg" },
          el("b", null, shortName(m.user_name)), " ",
          el("span", { class: "muted" }, new Date(m.timestamp).toLocaleString()),
          el("div", null, m.message)))
      : [el("p", { class: "muted" }, "No comments yet.")]));
    thread.scrollTop = thread.scrollHeight;
  };
  const input = el("input", { placeholder: "Write a comment…", "aria-label": "Comment", style: "flex:1;min-width:0", maxlength: 2000 });
  const send = el("button", { class: "primary" }, "Post");
  const post = (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return input.focus();
    send.disabled = true;
    run(async () => {
      try {
        const saved = must(await db.from("comments")
          .insert({ deck_id: deck.id, item_id: r.item_id, user_name: me, message }).select().single());
        addComment(saved);
        input.value = "";
        draw();
        renderTable();
      } finally {
        send.disabled = false;
      }
    });
  };
  draw();
  const votes = Object.entries(r.votes).map(([u, v]) => `${shortName(u)}: ${v}`).join(" · ");
  fill(dialog, 
    el("div", { class: "row" },
      el("b", { style: "margin-right:auto" }, titleOf(deck, r.fields)),
      el("button", { class: "link", onclick: () => dialog.close() }, "Close")),
    el("p", { class: "muted", style: "margin-top:0" }, el("span", { class: "tag " + r.verdict }, VERDICTS[r.verdict]), votes ? " " + votes : ""),
    thread,
    el("form", { class: "row", style: "margin:14px 0 0;flex-wrap:nowrap", onsubmit: post }, input, send));
  dialog.showModal();
  input.focus();
}
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); }); // click outside to close

function exportCsv() {
  const list = filtered();
  if (!list.length) return showError(new Error("Nothing to export with these filters."));
  const data = list.map((r) => ({
    ...r.fields,
    ...Object.fromEntries(users.map((u) => ["vote_" + shortName(u), r.votes[u] || ""])),
    yes_count: r.yes_count,
    no_count: r.no_count,
    verdict: r.verdict,
    comments: (comments.get(r.item_id) || []).map((m) => `${shortName(m.user_name)}: ${m.message}`).join(" | "),
  }));
  // ﻿ = BOM so Excel reads accented characters correctly.
  const url = URL.createObjectURL(new Blob(["﻿" + Papa.unparse(data)], { type: "text/csv;charset=utf-8" }));
  const a = el("a", { href: url, download: deck.name.replace(/[^\w-]+/g, "_") + "_results.csv" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

start(() => {
  fill(app, el("h2", null, "Results"), controls, summary, tableBox, dialog);
  return init();
});
