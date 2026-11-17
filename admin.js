const CHUNK = 500;
const uploadBox = el("section");
const deckBox = el("section");
app.append(el("h2", null, "New deck"), uploadBox, el("h2", { style: "margin-top:36px" }, "Decks"), deckBox);

function resetUpload() {
  fill(uploadBox, 
    el("div", { class: "row" },
      el("input", { type: "file", accept: ".csv,text/csv", onchange: (e) => e.target.files[0] && parse(e.target.files[0]) })),
    el("p", { class: "muted" }, "Upload any CSV with a header row. Every column is kept; next you choose which ones show on the card."));
}

function parse(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: "greedy",
    complete: (res) => {
      const cols = (res.meta.fields || []).filter((c) => c && c.trim());
      // Keep only named columns (drops blank headers and Papa's __parsed_extra overflow).
      const rows = res.data.map((r) => Object.fromEntries(cols.map((c) => [c, (r[c] ?? "").toString().trim()])));
      if (!cols.length || !rows.length) return showError(new Error("That CSV has no header row or no data rows."));
      configure(file.name.replace(/\.csv$/i, ""), cols, rows);
    },
    error: showError,
  });
}

function configure(defaultName, cols, rows) {
  const pick = (selected, optional) => {
    const s = el("select", null, optional ? el("option", { value: "" }, "(none)") : null, cols.map((c) => el("option", { value: c }, c)));
    s.value = selected || "";
    return s;
  };
  const name = el("input", { value: defaultName, size: 30, maxlength: 80 });
  const title = pick(cols[0]);
  const d1 = pick(cols[1], true);
  const d2 = pick(cols[2], true);
  const preview = el("div", { class: "card", style: "max-width:520px;cursor:default" });
  const status = el("span", { class: "muted" });
  const create = el("button", { class: "primary" }, `Create deck (${rows.length.toLocaleString()} cards)`);
  const cancel = el("button", { onclick: resetUpload }, "Cancel");

  const details = () => [...new Set([d1.value, d2.value].filter((v) => v && v !== title.value))];
  const draw = () => {
    const r = rows[0];
    fill(preview, 
      el("h1", null, r[title.value] || "(untitled)"),
      el("dl", null, details().filter((f) => r[f]).map((f) => [el("dt", null, f), el("dd", null, r[f])])));
    const blank = rows.filter((x) => !x[title.value]).length;
    status.textContent = blank ? `Heads up: ${blank.toLocaleString()} ${blank === 1 ? "row has" : "rows have"} no "${title.value}" and will show as "(untitled)".` : "";
  };
  [title, d1, d2].forEach((s) => s.addEventListener("change", draw));
  draw();

  create.addEventListener("click", async () => {
    if (!name.value.trim()) { name.focus(); return showError(new Error("Give the deck a name.")); }
    create.disabled = cancel.disabled = true;
    let deck;
    try {
      deck = must(await db.from("decks")
        .insert({ name: name.value.trim(), title_field: title.value, detail_fields: details() })
        .select().single());
      for (let i = 0; i < rows.length; i += CHUNK) {
        status.textContent = `Uploading ${Math.min(i + CHUNK, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}…`;
        must(await db.from("items").insert(
          rows.slice(i, i + CHUNK).map((fields, j) => ({ deck_id: deck.id, fields, position: i + j }))));
      }
      resetUpload();
      await loadDecks();
    } catch (e) {
      showError(e);
      // Don't leave a half-uploaded deck where people can swipe it.
      if (deck) await db.from("decks").update({ status: "archived", name: deck.name + " (failed upload)" }).eq("id", deck.id);
      status.textContent = deck ? "Upload failed partway. The partial deck was archived — choose the file again to retry." : "Couldn't create the deck — try again.";
      cancel.disabled = false;
      cancel.textContent = "Start over";
      if (!deck) create.disabled = false;
      loadDecks().catch(showError);
    }
  });

  const field = (label, control) => el("label", { class: "field" }, el("span", { class: "muted" }, label), control);
  fill(uploadBox, 
    el("div", { class: "row" }, field("Deck name", name)),
    el("div", { class: "row" },
      field("Card title column", title),
      field("Detail column (optional)", d1),
      field("Second detail (optional)", d2)),
    el("p", { class: "muted" }, "Preview of the first card:"), preview,
    el("div", { class: "row" }, create, cancel, status));
}

async function loadDecks() {
  const decks = must(await db.from("deck_overview").select("*").order("created_at", { ascending: false }));
  if (!decks.length) return fill(deckBox, el("p", { class: "empty" }, "No decks yet. Upload a CSV above to create the first one."));
  fill(deckBox, el("div", { class: "scroll" }, el("table", null,
    el("tr", null, ["Name", "Cards", "Swiped so far", "Created", "Status", "", ""].map((h) => el("th", null, h))),
    decks.map((d) => el("tr", null,
      el("td", null, el("b", null, d.name)),
      el("td", null, d.item_count.toLocaleString()),
      el("td", null, Object.entries(d.progress).map(([u, n]) => el("div", null, `${u}: ${n.toLocaleString()}`)), Object.keys(d.progress).length ? null : "—"),
      el("td", null, new Date(d.created_at).toLocaleDateString()),
      el("td", null, el("span", { class: "tag " + d.status }, d.status)),
      el("td", null, el("a", { href: "results.html?deck=" + d.id }, "Results")),
      el("td", null, el("button", {
        title: d.status === "active" ? "Hide from the swipe page. Nothing is deleted." : "Show on the swipe page again.",
        onclick: () => run(async () => {
          must(await db.from("decks").update({ status: d.status === "active" ? "archived" : "active" }).eq("id", d.id));
          await loadDecks();
        }),
      }, d.status === "active" ? "Archive" : "Unarchive")))))),
    el("p", { class: "muted" }, "Archived decks are hidden from the swipe page. Their swipes and comments are kept and still show in Results."));
}

resetUpload();
run(loadDecks);
