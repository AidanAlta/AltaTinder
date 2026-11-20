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

function ready() {
  if (!configured) {
    fill(app, el("p", { class: "empty" }, "Set your Supabase URL and key in config.js first."));
    return false;
  }
  if (!db) {
    fill(app, el("p", { class: "empty" }, "Couldn't load the Supabase library. Check your connection and reload."));
    return false;
  }
  return true;
}

function run(fn) {
  if (ready()) Promise.resolve().then(fn).catch(showError);
}

// ---------- Sign-in (Alta email only) ----------

const DOMAIN = "@altatechnologies.com";
let me = null; // signed-in email, lowercase
const shortName = (email) => String(email || "").split("@")[0];

// Page entry point: make sure someone is signed in, then run the page.
function start(fn) {
  if (!ready()) return;
  (async () => {
    me = (await currentEmail()) || (await signIn());
    showWho();
    db.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") location.reload(); });
    await fn();
  })().catch(showError);
}

async function currentEmail() {
  const { data } = await db.auth.getSession();
  const email = data.session?.user?.email?.toLowerCase();
  return email && email.endsWith(DOMAIN) ? email : null;
}

function showWho() {
  document.querySelector("header .who")?.remove();
  document.querySelector("header").append(
    el("span", { class: "who muted" }, shortName(me), " · ",
      el("button", { class: "link", onclick: changePassword }, "Change password"), " · ",
      el("button", { class: "link", onclick: () => signOut() }, "Sign out")));
}

async function signOut() {
  store("swipe_deck", null);
  await db.auth.signOut();
  location.reload();
}

function authMessage(e) {
  const code = e?.code || "", msg = e?.message || String(e);
  if (/database error|altatechnologies/i.test(msg)) return "Only @altatechnologies.com accounts can sign in.";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (code === "email_not_confirmed" || /not confirmed/i.test(msg)) return "This login isn't active yet. Ask the app admin to confirm it.";
  if (code === "weak_password" || /password should be/i.test(msg)) return "Pick a longer password (at least 8 characters).";
  if (code === "same_password" || /different from the old/i.test(msg)) return "That's your current password. Pick a new one.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Wait a few minutes and try again.";
  return msg;
}

// Email + password. Logins are created by the app admin in Supabase (Authentication → Users → Add user).
function signIn() {
  return new Promise((resolve) => {
    const note = el("p", { class: "form-error", role: "alert" });
    const email = el("input", { type: "email", placeholder: "you" + DOMAIN, value: store("last_email") || "", autocomplete: "username", "aria-label": "Email" });
    const password = el("input", { type: "password", placeholder: "Password", autocomplete: "current-password", "aria-label": "Password" });
    const go = el("button", { class: "primary" }, "Sign in");
    const submit = async (e) => {
      e.preventDefault();
      const addr = email.value.trim().toLowerCase();
      if (!addr) return email.focus();
      if (!addr.endsWith(DOMAIN)) { note.textContent = "Use your " + DOMAIN + " email."; return email.focus(); }
      if (!password.value) return password.focus();
      note.textContent = "";
      go.disabled = true;
      go.textContent = "Signing in…";
      const { error } = await db.auth.signInWithPassword({ email: addr, password: password.value });
      go.disabled = false;
      go.textContent = "Sign in";
      if (error) { note.textContent = authMessage(error); return password.select(); }
      store("last_email", addr);
      resolve(addr);
    };
    fill(app,
      el("h2", null, "Sign in"),
      el("form", { class: "stack", onsubmit: submit }, email, password, go),
      note,
      el("p", { class: "muted" }, "No login yet, or forgot your password? Ask the app admin to set one up for you."));
    (email.value ? password : email).focus();
  });
}

function changePassword() {
  const dlg = el("dialog");
  const note = el("p", { class: "form-error", role: "alert" });
  const pw1 = el("input", { type: "password", placeholder: "New password (8+ characters)", autocomplete: "new-password", "aria-label": "New password" });
  const pw2 = el("input", { type: "password", placeholder: "Type it again", autocomplete: "new-password", "aria-label": "Repeat new password" });
  const save = el("button", { class: "primary" }, "Save password");
  const close = () => { dlg.close(); dlg.remove(); };
  const submit = async (e) => {
    e.preventDefault();
    if (pw1.value.length < 8) { note.textContent = "Use at least 8 characters."; return pw1.focus(); }
    if (pw1.value !== pw2.value) { note.textContent = "The two passwords don't match."; return pw2.select(); }
    save.disabled = true;
    const { error } = await db.auth.updateUser({ password: pw1.value });
    save.disabled = false;
    if (error) { note.textContent = authMessage(error); return; }
    fill(dlg, el("p", null, "Password changed."), el("div", { class: "row" }, el("button", { class: "primary", onclick: close }, "OK")));
  };
  fill(dlg,
    el("div", { class: "row" }, el("b", { style: "margin-right:auto" }, "Change password"), el("button", { class: "link", onclick: close }, "Cancel")),
    el("form", { class: "stack", onsubmit: submit }, pw1, pw2, save),
    note);
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  pw1.focus();
}
