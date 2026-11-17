const configured = !!window.SUPABASE_URL && !window.SUPABASE_URL.includes("YOUR-PROJECT");
const db = configured && window.supabase ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY) : null;
const app = document.getElementById("app");

function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "class") n.className = v;
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k);
  return n;
}

// Replace a node's contents; accepts nested arrays and skips null/false.
function fill(node, ...kids) {
  node.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}

function must({ data, error }) {
  if (error) throw error;
  return data;
}

// Supabase caps responses at 1000 rows; page through until done.
async function fetchAll(buildQuery) {
  const out = [], size = 1000;
  for (let from = 0; ; from += size) {
    const rows = must(await buildQuery().range(from, from + size - 1));
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

function showError(e) {
  console.error(e);
  const box = document.getElementById("error");
  box.textContent = "Error: " + (e.message || e);
  box.hidden = false;
  clearTimeout(showError.t);
  showError.t = setTimeout(() => (box.hidden = true), 8000);
}

function getUser() {
  try { return localStorage.getItem("swipe_user") || ""; } catch { return ""; }
}
function setUser(name) {
  try { localStorage.setItem("swipe_user", name); } catch {}
}
function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
  return null;
}

const titleOf = (deck, fields) => fields[deck.title_field] || "(untitled)";
const detailsOf = (deck, fields) =>
  (deck.detail_fields || []).filter((f) => fields[f]).map((f) => ({ label: f, value: fields[f] }));

// Values that are clearly web addresses become links (opens in a new tab).
function linkify(value) {
  const s = String(value).trim();
  const isUrl = /^https?:\/\/\S+$/i.test(s) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|co|ai|edu|gov|us|biz|info)(\/\S*)?$/i.test(s);
  if (!isUrl) return s;
  return el("a", { href: /^https?:\/\//i.test(s) ? s : "https://" + s, target: "_blank", rel: "noopener" }, s);
}

function run(fn) {
  if (!configured) {
    fill(app, el("p", { class: "empty" }, "Set your Supabase URL and key in config.js first."));
    return;
  }
  if (!db) {
    fill(app, el("p", { class: "empty" }, "Couldn't load the Supabase library. Check your connection and reload."));
    return;
  }
  Promise.resolve().then(fn).catch(showError);
}
