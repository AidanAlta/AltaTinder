const PAGE = 50;          // items fetched per request
const REFILL_AT = 20;     // fetch more when the local queue drops to this

let user = null;          // signed-in email (set on start)
let deck = null, queue = [], total = 0, done = 0;
let last = null;              // last swiped item, for undo
let exhausted = false, loadFailed = false;
const swiped = new Set();     // ids swiped this session (guards against refetch races)
const pending = new Set();    // in-flight swipe writes

const TOUCH = matchMedia("(pointer: coarse)").matches;
const pct = (n, of) => `width:${of ? Math.min(100, (100 * n) / of) : 0}%`;

async function showDecks() {
  deck = null;
  store("swipe_deck", null);
  const decks = must(await db.rpc("deck_progress", { p_user: user }));
  fill(app, 
    el("h2", null, "Pick a deck"),
    ...(decks.length ? decks.map((d) =>
      el("button", { class: "deck", onclick: () => run(() => openDeck(d.id)) },
        el("div", { class: "row", style: "margin:0" },
          el("b", { style: "margin-right:auto" }, d.name),
          el("span", { class: "muted" }, d.total && d.done >= d.total ? "Done ✓" : `${d.done} / ${d.total}`)),
        el("div", { class: "bar" }, el("div", { style: pct(d.done, d.total) }))))
      : [el("p", { class: "empty" }, "No active decks yet. ", el("a", { href: "admin.html" }, "Create one on the Admin page."))])
  );
}

async function openDeck(id) {
  const d = must(await db.from("decks").select("*").eq("id", id).eq("status", "active").maybeSingle());
  if (!d) return showDecks();
  const countRows = async (table, extra = (q) => q) => {
    const { count, error } = await extra(db.from(table).select("id", { count: "exact", head: true }).eq("deck_id", id));
    if (error) throw error;
    return count;
  };
  total = await countRows("items");
  done = await countRows("swipes", (q) => q.eq("user_name", user));
  deck = d; queue = []; last = null; exhausted = false; loadFailed = false; swiped.clear();
  store("swipe_deck", id);
  await refill();
  render();
}

// Single-flight: concurrent callers share the one in-flight request.
let refilling = null;
function refill() {
  if (exhausted || !deck) return Promise.resolve();
  return (refilling ||= fetchMore().finally(() => (refilling = null)));
}

async function fetchMore() {
  const id = deck.id;
  await Promise.allSettled([...pending]);
  const rows = must(await db.rpc("next_items", { p_deck: id, p_user: user, p_limit: PAGE }));
  if (deck?.id !== id) return; // user switched decks mid-request
  const have = new Set(queue.map((i) => i.id));
  for (const r of rows) if (!have.has(r.id) && !swiped.has(r.id)) queue.push(r);
  if (rows.length < PAGE) exhausted = true;
}

function swipe(direction) {
  const item = queue.shift();
  if (!item) return;
  const deckId = deck.id;
  swiped.add(item.id);
  done++;
  last = item;
  const write = db.from("swipes")
    .upsert({ deck_id: deckId, item_id: item.id, user_name: user, direction }, { onConflict: "item_id,user_name" })
    .then(({ error }) => {
      if (!error) return;
      showError(error);
      if (deck?.id !== deckId) return;
      // Write failed: put the card back so the vote isn't silently lost.
      swiped.delete(item.id);
      done--;
      if (last === item) last = null;
      queue.unshift(item);
      render();
    })
    .finally(() => pending.delete(write));
  pending.add(write);
  render();
  // Top up in the background; only redraw if we were waiting on it (never under a card mid-drag).
  if (queue.length <= REFILL_AT) refill().then(() => { if (!queue.length || !app.querySelector(".card")) render(); }, showError);
}

async function undo() {
  const item = last;
  if (!deck || !item || !swiped.has(item.id)) return;
  last = null;
  render();
  await Promise.allSettled([...pending]);
  if (!swiped.has(item.id)) return;
  const { error } = await db.from("swipes").delete().eq("item_id", item.id).eq("user_name", user);
  if (error) { last = item; render(); return showError(error); }
  swiped.delete(item.id);
  done--;
  queue.unshift(item);
  render();
}

function render() {
  if (!deck) return;
  const item = queue[0];
  const head = [
    el("div", { class: "row" },
      el("button", { class: "link", onclick: () => run(showDecks) }, "← All decks"),
      el("b", { style: "margin:0 auto" }, deck.name),
      el("span", { class: "muted" }, `${done} / ${total}`)),
    el("div", { class: "bar" }, el("div", { style: pct(done, total) })),
  ];
  const undoBtn = last ? el("button", { class: "link", onclick: undo }, "Undo last swipe") : null;

  if (!item) {
    let body;
    if (loadFailed) {
      body = [el("p", { class: "empty" }, "Couldn't load the next cards."),
        el("div", { class: "row center" }, el("button", { class: "primary", onclick: () => { loadFailed = false; render(); } }, "Try again"))];
    } else if (exhausted) {
      body = [el("p", { class: "empty" }, "All done — you've swiped everything in this deck."),
        el("div", { class: "row center" },
          el("a", { class: "btn", href: "results.html?deck=" + deck.id }, "See results"),
          el("button", { onclick: () => run(showDecks) }, "Pick another deck")),
        el("div", { class: "row center" }, undoBtn)];
    } else {
      body = [el("p", { class: "empty" }, "Loading…")];
      refill().then(render, (e) => { showError(e); loadFailed = true; render(); });
    }
    fill(app, ...head, ...body);
    return;
  }

  const card = el("div", { class: "card" },
    el("h1", null, titleOf(deck, item.fields)),
    el("dl", null, detailsOf(deck, item.fields).map((d) => [el("dt", null, d.label), el("dd", null, linkify(d.value))])));
  drag(card);
  fill(app, ...head, card,
    el("div", { class: "actions" },
      el("button", { class: "no", onclick: () => swipe("no") }, "← No"),
      el("button", { class: "yes", onclick: () => swipe("yes") }, "Yes →")),
    el("p", { class: "muted hint" },
      TOUCH ? "Tap a button or drag the card. " : "Arrow keys, buttons, or drag the card. ",
      last && !TOUCH ? "Z to undo. " : null, undoBtn));
}

// Touch/mouse drag: pull the card past 100px to vote.
function drag(card) {
  let startX = null;
  card.addEventListener("pointerdown", (e) => {
    if (e.target.closest("a")) return; // let links be clicked
    startX = e.clientX;
    card.setPointerCapture(e.pointerId);
  });
  card.addEventListener("pointermove", (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)`;
    card.classList.toggle("going-yes", dx > 100);
    card.classList.toggle("going-no", dx < -100);
  });
  const end = (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (e.type === "pointerup" && Math.abs(dx) > 100) return swipe(dx > 0 ? "yes" : "no");
    card.style.transform = "";
    card.classList.remove("going-yes", "going-no");
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}

document.addEventListener("keydown", (e) => {
  // e.repeat: holding a key down must not machine-gun through the deck.
  if (!deck || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.target.matches?.("input, textarea, select")) return;
  if (e.key === "ArrowRight") swipe("yes");
  else if (e.key === "ArrowLeft") swipe("no");
  else if (e.key === "z" || e.key === "Z" || e.key === "Backspace") undo();
  else return;
  e.preventDefault();
});

start(() => {
  user = me;
  const resume = store("swipe_deck");
  return resume ? openDeck(resume) : showDecks();
});
