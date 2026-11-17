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

// A failed sign-in link lands back here with the error in the address bar.
function linkError() {
  const p = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const msg = p.get("error_description");
  if (!msg) return "";
  history.replaceState(null, "", location.pathname);
  return authMessage({ code: p.get("error_code") || "", message: msg });
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
      el("button", { class: "link", onclick: () => signOut() }, "Sign out")));
}

async function signOut() {
  store("swipe_deck", null);
  await db.auth.signOut();
  location.reload();
}

function authMessage(e) {
  const code = e?.code || "", msg = e?.message || String(e);
  if (/database error saving new user|altatechnologies/i.test(msg)) return "Only @altatechnologies.com email addresses can sign in.";
  if (code === "email_address_not_authorized") return "Sign-in emails can't reach this address yet. Ask the app admin to add you.";
  if (code === "over_email_send_rate_limit" || /rate limit/i.test(msg)) return "Too many sign-in emails were sent recently. Wait a while and try again.";
  if (/security purposes|only request this after/i.test(msg)) return "Wait a minute before asking for another link.";
  if (code === "otp_expired" || /expired|invalid/i.test(msg)) return "That sign-in link has expired or was already used. Send a new one.";
  return msg;
}

// Email a sign-in link. Resolves with the signed-in email once the link has been clicked
// (in this tab, or in another tab of the same browser).
function signIn() {
  return new Promise((resolve) => {
    const note = el("p", { class: "form-error", role: "alert" });
    const say = (text) => (note.textContent = text || "");
    let waiting = null;

    const done = (email) => {
      clearInterval(waiting);
      window.removeEventListener("focus", check);
      resolve(email);
    };
    const check = async () => {
      const email = await currentEmail();
      if (email) done(email);
    };

    const askEmail = () => {
      clearInterval(waiting);
      const email = el("input", { type: "email", placeholder: "you" + DOMAIN, value: store("last_email") || "", autocomplete: "email", style: "flex:1;min-width:0" });
      const send = el("button", { class: "primary" }, "Email me a link");
      const submit = async (e) => {
        e.preventDefault();
        const addr = email.value.trim().toLowerCase();
        if (!addr) return email.focus();
        if (!addr.endsWith(DOMAIN)) { say("Use your " + DOMAIN + " email."); return email.focus(); }
        say("");
        send.disabled = true;
        send.textContent = "Sending…";
        const { error } = await db.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: location.origin + location.pathname } });
        send.disabled = false;
        send.textContent = "Email me a link";
        if (error) return say(authMessage(error));
        store("last_email", addr);
        checkInbox(addr);
      };
      fill(app,
        el("h2", null, "Sign in"),
        el("p", { class: "muted" }, "Use your Alta email. We'll email you a sign-in link."),
        el("form", { class: "row", onsubmit: submit }, email, send),
        note);
      email.focus();
    };

    const checkInbox = (addr) => {
      say("");
      fill(app,
        el("h2", null, "Check your email"),
        el("p", null, "We sent a sign-in link to ", el("b", null, addr), ". Click it and you're in."),
        el("p", { class: "muted" }, "Open it in this browser to stay signed in here. Nothing yet? Check junk mail, or ",
          el("button", { class: "link", onclick: askEmail }, "send it again"), "."),
        note);
      // The link usually opens a new tab; this tab notices the sign-in and carries on.
      waiting = setInterval(check, 2000);
      window.addEventListener("focus", check);
    };

    askEmail();
    say(linkError());
  });
}
