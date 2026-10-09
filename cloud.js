// Kết nối Firebase dùng chung cho trang admin và trang khách.
window.cloudBackend = (() => {
  const BASE = "https://www.gstatic.com/firebasejs/13.0.0/";
  let fs, au, db, auth, ready;

  // Timestamp của Firestore -> số mili giây, để dữ liệu luôn là JSON thuần
  const plain = v => {
    if (v && typeof v.toMillis === "function") return v.toMillis();
    if (Array.isArray(v)) return v.map(plain);
    if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = plain(v[k]); return o; }
    return v;
  };

  return {
    init({ auth: withAuth } = {}) {
      if (ready) return ready;
      ready = (async () => {
        const appMod = await import(BASE + "firebase-app.js");
        fs = await import(BASE + "firebase-firestore.js");
        const app = appMod.initializeApp(window.FB_CONFIG);
        try {
          db = fs.initializeFirestore(app, {
            ignoreUndefinedProperties: true,
            localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
          });
        } catch (e) {
          db = fs.getFirestore(app);
        }
        if (withAuth) { au = await import(BASE + "firebase-auth.js"); auth = au.getAuth(app); }
      })();
      return ready;
    },
    onAuth(cb) { return au.onAuthStateChanged(auth, u => cb(u ? { email: u.email, uid: u.uid } : null)); },
    signIn(email, pass) { return au.signInWithEmailAndPassword(auth, email, pass); },
    signOut() { return au.signOut(auth); },
    resetPassword(email) { return au.sendPasswordResetEmail(auth, email); },
    listen(col, onChanges, onError) {
      return fs.onSnapshot(fs.collection(db, col),
        snap => onChanges(snap.docChanges().map(c => ({ type: c.type, id: c.doc.id, data: plain(c.doc.data()) }))),
        err => onError && onError(err));
    },
    // ops: {op:"set", col, id, data, merge, inc:{field:delta}, del:[field]} | {op:"del", col, id}
    async commit(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = fs.writeBatch(db);
        for (const o of ops.slice(i, i + 400)) {
          const ref = fs.doc(db, o.col, o.id);
          if (o.op === "del") { b.delete(ref); continue; }
          const data = { ...o.data };
          for (const [f, d] of Object.entries(o.inc || {})) data[f] = fs.increment(d);
          for (const f of o.del || []) data[f] = fs.deleteField();
          if (o.merge) b.set(ref, data, { merge: true }); else b.set(ref, data);
        }
        await b.commit();
      }
    },
    async add(col, data) { return (await fs.addDoc(fs.collection(db, col), data)).id; },
    async get(col, id) { const s = await fs.getDoc(fs.doc(db, col, id)); return s.exists() ? plain(s.data()) : null; }
  };
})();
