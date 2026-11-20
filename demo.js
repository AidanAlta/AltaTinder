// Demo mode: set window.DEMO = true in config.js to run with no database.
// Everything is saved in this browser only (localStorage). Sign out and back in with another
// @altatechnologies.com address (any code works) to act as a different person. Clear it with localStorage.removeItem("fakedb").
if (window.DEMO) {
  window.supabase = { createClient() {
    const load = () => JSON.parse(localStorage.fakedb || '{"decks":[],"items":[],"swipes":[],"comments":[],"seq":1}');
    const save = (s) => (localStorage.fakedb = JSON.stringify(s));
    const verdict = (y, n) => y && n ? "disputed" : y >= 2 ? "consensus_yes" : n >= 2 ? "consensus_no" : y + n === 1 ? "single_vote" : "unswiped";
    function table(s, t) {
      if (t === "item_results") { const by = {}; for (const w of s.swipes) (by[w.item_id] ||= {})[w.user_name] = w.direction;
        return s.items.map((i) => { const v = by[i.id] || {}; const y = Object.values(v).filter((x) => x === "yes").length, n = Object.values(v).length - y;
          return { item_id: i.id, deck_id: i.deck_id, position: i.position, fields: i.fields, yes_count: y, no_count: n, votes: v, verdict: verdict(y, n) }; }); }
      if (t === "deck_overview") return s.decks.map((d) => { const p = {}; for (const w of s.swipes) if (w.deck_id === d.id) p[w.user_name] = (p[w.user_name] || 0) + 1;
        return { ...d, item_count: s.items.filter((i) => i.deck_id === d.id).length, progress: p }; });
      return s[t];
    }
    class Q {
      constructor(t) { this.t = t; this.op = "select"; this.fl = []; }
      select(c, o) { if (o?.head) this.head = true; return this; }
      insert(r) { this.op = "insert"; this.rows = [].concat(r); return this; }
      upsert(r) { this.op = "upsert"; this.rows = [].concat(r); return this; }
      update(p) { this.op = "update"; this.patch = p; return this; }
      delete() { this.op = "delete"; return this; }
      eq(k, v) { this.fl.push((r) => String(r[k]) === String(v)); return this; }
      ilike(k, v) { this.fl.push((r) => r[k].toLowerCase() === v.toLowerCase()); return this; }
      order(k, o) { this.ord = [k, o?.ascending === false ? -1 : 1]; return this; }
      range(a, b) { this.rng = [a, b]; return this; }
      limit(n) { this.rng = [0, n - 1]; return this; }
      single() { this.one = true; return this; }
      maybeSingle() { this.one = true; return this; }
      then(res, rej) { return new Promise((r) => setTimeout(r, 15 + Math.random() * 25)).then(() => this.exec()).then(res, rej); }
      exec() {
        const s = load(), m = (r) => this.fl.every((f) => f(r));
        let out;
        if (this.op === "insert" || this.op === "upsert") {
          out = this.rows.map((r) => {
            if (this.op === "upsert") { const ex = s.swipes.find((w) => w.item_id === r.item_id && w.user_name === r.user_name); if (ex) { Object.assign(ex, r); return ex; } }
            const row = { id: this.t === "decks" ? "deck-" + s.seq++ : s.seq++, ...(this.t === "decks" ? { status: "active", created_at: new Date().toISOString() } : {}), ...(this.t === "comments" || this.t === "swipes" ? { timestamp: new Date().toISOString() } : {}), ...r };
            s[this.t].push(row); return row; });
        } else if (this.op === "update") { out = s[this.t].filter(m); out.forEach((r) => Object.assign(r, this.patch)); }
        else if (this.op === "delete") { out = s[this.t].filter(m); s[this.t] = s[this.t].filter((r) => !m(r)); }
        else { out = table(s, this.t).filter(m); const count = out.length;
          if (this.ord) out.sort((a, b) => (a[this.ord[0]] > b[this.ord[0]] ? 1 : -1) * this.ord[1]);
          if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
          if (this.head) return { data: null, count, error: null }; }
        if (this.op !== "select") save(s);
        return { data: this.one ? out[0] ?? null : out, error: null };
      }
    }
    // Fake sign-in: any @altatechnologies.com address; any code works.
  const auth = {
    async getSession() { const e = localStorage.demo_email; return { data: { session: e ? { user: { email: e } } : null }, error: null }; },
    // Pretend the link was clicked a moment after it was "sent".
    async signInWithOtp() { return { error: null }; },
    async verifyOtp({ email }) { localStorage.demo_email = email; return { data: {}, error: null }; },
    async signOut() { localStorage.removeItem("demo_email"); return { error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
  };
  return { auth, from: (t) => new Q(t), rpc: (fn, a) => new Promise((r) => setTimeout(r, 15 + Math.random() * 25)).then(() => { const s = load();
      if (fn === "deck_progress") return { error: null, data: s.decks.filter((d) => d.status === "active").map((d) => ({ id: d.id, name: d.name, total: s.items.filter((i) => i.deck_id === d.id).length, done: s.swipes.filter((w) => w.deck_id === d.id && w.user_name === a.p_user).length })) };
      const mine = new Set(s.swipes.filter((w) => w.user_name === a.p_user).map((w) => w.item_id));
      return { error: null, data: s.items.filter((i) => i.deck_id === a.p_deck && !mine.has(i.id)).sort((x, y) => x.position - y.position).slice(0, a.p_limit) }; }) };
  } };
  window.SUPABASE_URL = "demo";
  document.addEventListener("DOMContentLoaded", () => {
    const b = document.createElement("div");
    b.textContent = "Demo mode — any code signs you in. Data is saved in this browser only.";
    b.style.cssText = "background:#ffe7a8;text-align:center;padding:6px;font-size:13px";
    document.body.prepend(b);
  });
}
