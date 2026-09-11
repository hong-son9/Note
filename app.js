/* =====================================================================
   DevNotes — Ghi chú dự án  (HTML + CSS + JS thuần, DB: Supabase)
   Bảng: projects -> note_tabs -> note_items
   ===================================================================== */
(function () {
  "use strict";

  /* ---------------- Khởi tạo Supabase ---------------- */
  const BUILD = "2026-09-11.5";   // đổi mỗi lần sửa -> soi ngay được là đã deploy bản mới chưa

  const CFG = window.APP_CONFIG || {};
  const configured =
    CFG.SUPABASE_URL &&
    CFG.SUPABASE_ANON_KEY &&
    !CFG.SUPABASE_URL.includes("YOUR-PROJECT-REF") &&
    !CFG.SUPABASE_ANON_KEY.includes("YOUR-ANON");

  let db = null;
  if (configured) {
    db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }

  /* ---------------- State ---------------- */
  const state = {
    user: null,
    projects: [],
    projectId: null,
    tabs: [],
    tabId: null,
    items: [],           // các bản ghi note_items của dự án đang mở
    projectFilter: "",
    doc: { html: "", saved: "", ids: [] },   // nội dung trang giấy của tab hiện tại
    dirty: false,
    saving: false,
    saveTimer: null,
    lastError: null
  };

  /* ---------------- Tiện ích ---------------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function toast(msg, type) {
    const el = document.createElement("div");
    el.className = "toast " + (type || "info");
    el.textContent = msg;
    $("toast-wrap").appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateX(24px)";
      setTimeout(() => el.remove(), 320);
    }, 2800);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return "vừa xong";
    if (diff < 3600) return Math.floor(diff / 60) + " phút trước";
    if (diff < 86400) return Math.floor(diff / 3600) + " giờ trước";
    if (diff < 604800) return Math.floor(diff / 86400) + " ngày trước";
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  const NEW_ROW = "__new__";   // id ảo cho dòng đang thêm mới

  function firstLine(text) {
    const l = String(text || "").split("\n").find((x) => x.trim());
    return l ? l.trim().slice(0, 120) : "";
  }

  const DOT_COLORS = ["#6d7cff", "#35d6e3", "#35d69b", "#ffb454", "#ff7bc4", "#ff6b7a"];
  function hashIdx(str, mod) {
    let h = 0;
    for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
    return h % mod;
  }

  function err(e) {
    console.error(e);
    toast((e && (e.message || e.error_description)) || "Có lỗi xảy ra", "error");
  }

  /* ---------------- Modal dùng chung ---------------- */
  let modalSubmit = null;

  function openModal(opts) {
    $("modal-title").textContent = opts.title;
    $("modal-body").innerHTML = opts.bodyHtml;
    $("modal-ok").textContent = opts.okText || "Lưu";
    $("modal-ok").className = "btn " + (opts.danger ? "btn-danger-ghost" : "btn-primary");
    $("modal-backdrop").classList.remove("hidden");
    modalSubmit = opts.onSubmit;
    setTimeout(() => {
      const f = $("modal-body").querySelector("input, textarea");
      if (f) { f.focus(); f.select && f.select(); }
    }, 40);
  }

  function closeModal() {
    $("modal-backdrop").classList.add("hidden");
    $("modal-body").innerHTML = "";
    modalSubmit = null;
  }

  function confirmModal(title, text, onYes) {
    openModal({
      title,
      bodyHtml: '<p class="modal-text">' + esc(text) + "</p>",
      okText: "Xoá",
      danger: true,
      onSubmit: onYes
    });
  }

  /* =====================================================================
     AUTH
     ===================================================================== */
  function authMsg(text, kind) {
    const el = $("auth-message");
    if (!text) { el.classList.add("hidden"); el.textContent = ""; return; }
    el.className = "auth-message " + (kind || "error");
    el.textContent = text;
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    if (!db) { authMsg("Chưa cấu hình Supabase. Hãy điền URL và anon key trong config.js"); return; }

    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;
    const btn = $("auth-submit");
    btn.disabled = true;
    btn.textContent = "Đang đăng nhập…";
    authMsg("");

    try {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e2) {
      const m = String(e2.message || e2);
      authMsg(
        /invalid login/i.test(m) ? "Email hoặc mật khẩu không đúng." :
        /email not confirmed/i.test(m) ? "Tài khoản chưa xác nhận email." :
        /rate limit|too many/i.test(m) ? "Thử quá nhiều lần, hãy đợi một chút." : m
      );
    } finally {
      btn.disabled = false;
      btn.textContent = "Đăng nhập";
    }
  }

  async function logout() {
    const btn = $("logout-btn");
    btn.disabled = true;
    btn.textContent = "Đang đăng xuất…";

    // 1. Lưu nốt phần đang gõ — hỏng cũng vẫn phải đăng xuất được
    try { await flushPad(); } catch (e) { console.warn("flushPad:", e); }

    // 2. Gọi signOut nhưng không để nó treo quá 4 giây
    try {
      await Promise.race([
        db.auth.signOut(),
        new Promise((r) => setTimeout(r, 4000))
      ]);
    } catch (e) {
      console.warn("signOut:", e);
    }

    // 3. Dọn session dưới máy dù bước 2 có thành công hay không
    try {
      Object.keys(localStorage)
        .filter((k) => k.indexOf("sb-") === 0 || k.indexOf("supabase.auth") === 0)
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) { console.warn("localStorage:", e); }

    // 4. Bỏ cảnh báo rời trang rồi tải lại
    state.dirty = false;
    clearTimeout(state.saveTimer);
    location.reload();
  }

  function showAuth() {
    $("app-screen").classList.add("hidden");
    $("auth-screen").classList.remove("hidden");
    $("splash").classList.add("hidden");
  }

  function showApp() {
    $("auth-screen").classList.add("hidden");
    $("app-screen").classList.remove("hidden");
    $("splash").classList.add("hidden");
    $("build-stamp").textContent = "b" + BUILD;
    const email = state.user.email || "";
    $("user-email").textContent = email;
    $("user-avatar").textContent = (email[0] || "?").toUpperCase();
  }

  /* supabase-js chỉ cập nhật header Authorization của PostgREST khi có sự kiện
     SIGNED_IN / TOKEN_REFRESHED. Lúc tải lại trang, phiên được khôi phục từ
     localStorage phát ra INITIAL_SESSION — một số bản không xử lý sự kiện này, nên
     REST vẫn gửi kèm anon key. Token hợp lệ, HTTP 200, nhưng auth.uid() là NULL
     -> RLS lọc sạch -> danh sách rỗng mà không hề báo lỗi. Ép gắn lại cho chắc. */
  function syncRestToken(session) {
    const tok = session && session.access_token;
    if (!tok) return false;
    try {
      const h = db.rest && db.rest.headers;
      if (!h) return false;
      const want = "Bearer " + tok;
      if (h.Authorization === want) return false;
      h.Authorization = want;
      console.warn("[DevNotes] PostgREST đang dùng sai token — đã gắn lại access_token của phiên");
      return true;
    } catch (e) {
      console.warn("syncRestToken:", e);
      return false;
    }
  }

  async function ensureToken() {
    try {
      const got = await db.auth.getSession();
      return syncRestToken(got.data && got.data.session);
    } catch (e) { console.warn("ensureToken:", e); return false; }
  }

  /* ---------- Nhớ chỗ đang làm dở ----------
     Lưu dự án đang mở, và note đang mở CỦA TỪNG dự án, vào localStorage.
     Nhờ vậy F5 hay mở lại trình duyệt là vào thẳng chỗ cũ, và quay lại một
     dự án cũ cũng mở đúng note lần trước chứ không phải note đầu tiên. */
  const placeKey = () => "dn-last:" + (state.user ? state.user.id : "?");

  function recallPlace() {
    if (!state.user) return {};
    try {
      const v = JSON.parse(localStorage.getItem(placeKey()) || "{}");
      return v && typeof v === "object" ? v : {};
    } catch (e) { return {}; }
  }

  function rememberPlace() {
    if (!state.user || !state.projectId) return;
    const cur = recallPlace();
    const tabs = cur.t && typeof cur.t === "object" ? cur.t : {};
    if (state.tabId) tabs[state.projectId] = state.tabId;
    try {
      localStorage.setItem(placeKey(), JSON.stringify({ p: state.projectId, t: tabs }));
    } catch (e) { /* chế độ ẩn danh chặn localStorage -> bỏ qua */ }
  }

  function showLoadError(e) {
    const box = $("load-error");
    if (!e) { box.classList.add("hidden"); return; }
    const parts = [];
    if (e.code) parts.push("mã " + e.code);
    if (e.status) parts.push("HTTP " + e.status);
    parts.push(e.message || String(e));
    $("load-error-detail").textContent = parts.join(" · ");
    console.error("[DevNotes] load lỗi:", e);
    $("empty-state").classList.add("hidden");
    $("workspace").classList.add("hidden");
    box.classList.remove("hidden");
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Tải dữ liệu. Lần đầu sau khi mở lại trình duyệt, token trong localStorage có thể
     đã hết hạn và header Authorization của PostgREST chưa kịp cập nhật -> thử lại
     có ép làm mới token, thay vì bỏ cuộc và hiện danh sách rỗng. */
  async function loadWithRetry() {
    await ensureToken();
    if (await loadProjects()) { showLoadError(null); return true; }

    console.warn("[DevNotes] tải lần 1 hỏng:", state.lastError, "— làm mới token rồi thử lại");
    try { await db.auth.refreshSession(); } catch (e) { console.warn("refreshSession:", e); }
    await ensureToken();
    if (await loadProjects()) { showLoadError(null); return true; }

    await sleep(600);   // để supabase-js kịp gắn token mới vào header
    await ensureToken();
    if (await loadProjects()) { showLoadError(null); return true; }

    showLoadError(state.lastError || { message: "Không rõ nguyên nhân" });
    return false;
  }

  /* =====================================================================
     DỰ ÁN
     ===================================================================== */
  async function loadProjects(selectId) {
    const { data, error } = await db
      .from("projects").select("*").order("created_at", { ascending: true });
    if (error) { state.lastError = error; err(error); return false; }
    state.lastError = null;
    state.projects = data || [];
    renderProjects();

    const last = recallPlace();
    const target =
      selectId ||
      (state.projects.some((p) => p.id === state.projectId) ? state.projectId : null) ||
      (state.projects.some((p) => p.id === last.p) ? last.p : null) ||
      (state.projects[0] && state.projects[0].id);

    $("load-error").classList.add("hidden");
    if (target) selectProject(target);
    else {
      state.projectId = null;
      $("workspace").classList.add("hidden");
      $("empty-state").classList.remove("hidden");
      $("current-project-name").textContent = "Chưa chọn";
      $("rename-project-btn").classList.add("hidden");
      $("delete-project-btn").classList.add("hidden");
    }
    return true;
  }

  function renderProjects() {
    const q = state.projectFilter.toLowerCase();
    const list = state.projects.filter((p) => !q || p.name.toLowerCase().includes(q));
    $("project-count").textContent = state.projects.length;

    if (!list.length) {
      $("project-list").innerHTML =
        '<div style="padding:16px;color:var(--muted);font-size:13px;text-align:center">' +
        (state.projects.length ? "Không tìm thấy dự án." : "Chưa có dự án nào.") +
        "</div>";
      return;
    }

    $("project-list").innerHTML = list
      .map((p) => {
        const color = DOT_COLORS[hashIdx(p.id, DOT_COLORS.length)];
        return (
          '<button class="project-item' + (p.id === state.projectId ? " active" : "") +
          '" data-project="' + esc(p.id) + '">' +
          '<span class="project-dot" style="background:' + color + '"></span>' +
          '<span class="project-name">' + esc(p.name) + "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function addProject() {
    openModal({
      title: "Thêm dự án mới",
      bodyHtml:
        '<label class="field"><span>Tên dự án</span>' +
        '<input id="f-name" placeholder="VD: Aurora Backend, CRM Web…" maxlength="120" />' +
        '<span class="hint">Ví dụ: tên repo, tên hệ thống hoặc tên khách hàng.</span></label>' +
        '<label class="field"><span>Mô tả (không bắt buộc)</span>' +
        '<input id="f-desc" placeholder="Vài dòng mô tả ngắn" maxlength="255" /></label>',
      onSubmit: async () => {
        const name = $("f-name").value.trim();
        if (!name) { toast("Hãy nhập tên dự án", "error"); return false; }
        const { data, error } = await db
          .from("projects")
          .insert({ name, description: $("f-desc").value.trim() || null, user_id: state.user.id })
          .select().single();
        if (error) { err(error); return false; }
        toast("Đã tạo dự án “" + name + "”", "success");
        await loadProjects(data.id);
      }
    });
  }

  function renameProject() {
    const p = state.projects.find((x) => x.id === state.projectId);
    if (!p) return;
    openModal({
      title: "Sửa dự án",
      bodyHtml:
        '<label class="field"><span>Tên dự án</span>' +
        '<input id="f-name" value="' + esc(p.name) + '" maxlength="120" /></label>' +
        '<label class="field"><span>Mô tả</span>' +
        '<input id="f-desc" value="' + esc(p.description || "") + '" maxlength="255" /></label>',
      onSubmit: async () => {
        const name = $("f-name").value.trim();
        if (!name) { toast("Hãy nhập tên dự án", "error"); return false; }
        const { error } = await db.from("projects")
          .update({ name, description: $("f-desc").value.trim() || null }).eq("id", p.id);
        if (error) { err(error); return false; }
        toast("Đã cập nhật dự án", "success");
        await loadProjects(p.id);
      }
    });
  }

  function deleteProject() {
    const p = state.projects.find((x) => x.id === state.projectId);
    if (!p) return;
    confirmModal(
      "Xoá dự án?",
      'Xoá "' + p.name + '" sẽ xoá toàn bộ note và nội dung bên trong. Hành động này không thể hoàn tác.',
      async () => {
        const { error } = await db.from("projects").delete().eq("id", p.id);
        if (error) { err(error); return false; }
        clearTimeout(state.saveTimer); state.dirty = false;
        state.projectId = null;
        toast("Đã xoá dự án", "success");
        await loadProjects();
      }
    );
  }

  async function selectProject(id) {
    if (id !== state.projectId) await flushPad();
    state.projectId = id;
    state.tabId = null;
    const p = state.projects.find((x) => x.id === id);
    $("current-project-name").textContent = p ? p.name : "—";
    $("rename-project-btn").classList.remove("hidden");
    $("delete-project-btn").classList.remove("hidden");
    $("empty-state").classList.add("hidden");
    $("workspace").classList.remove("hidden");
    renderProjects();
    $("sidebar").classList.remove("open");
    await loadTabs();
  }

  /* =====================================================================
     NOTE (TAB)
     ===================================================================== */
  async function loadTabs(selectId) {
    const { data, error } = await db
      .from("note_tabs").select("*")
      .eq("project_id", state.projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return err(error);
    state.tabs = data || [];

    const last = recallPlace();
    const lastTab = last.t && typeof last.t === "object" ? last.t[state.projectId] : null;
    const target =
      selectId ||
      (state.tabs.some((t) => t.id === state.tabId) ? state.tabId : null) ||
      (state.tabs.some((t) => t.id === lastTab) ? lastTab : null) ||
      (state.tabs[0] && state.tabs[0].id) || null;
    state.tabId = target;
    rememberPlace();

    await loadItems();
  }

  function renderTabs() {
    if (!state.tabs.length) {
      $("note-tabs").innerHTML =
        '<div style="padding:10px 4px;color:var(--muted);font-size:13px">' +
        "Chưa có note nào — bấm “+ Thêm note” để tạo (VD: Cách chạy dự án, Bảng cần nhớ, Ticket tìm hiểu…)</div>";
      return;
    }
    $("note-tabs").innerHTML = state.tabs
      .map((t) => {
        const filled = state.items.some(
          (i) => i.tab_id === t.id && (i.content || "").trim()
        );
        return (
          '<button class="tab' + (t.id === state.tabId ? " active" : "") +
          '" draggable="true" title="Kéo để đổi thứ tự" data-tab="' + esc(t.id) + '">' +
          '<span class="tab-grip">⠿</span>' +
          '<span class="tab-dot' + (filled ? " filled" : "") + '"></span>' +
          esc(t.name) + "</button>"
        );
      })
      .join("");
    scrollActiveTabIntoView();
  }

  function addTab() {
    if (!state.projectId) return;
    openModal({
      title: "Thêm note cho dự án",
      bodyHtml:
        '<label class="field"><span>Tên note</span>' +
        '<input id="f-name" placeholder="VD: Cách chạy dự án" maxlength="80" />' +
        '<span class="hint">Gợi ý: Cách chạy dự án · Bảng cần nhớ · Ticket tìm hiểu · Lệnh hay dùng · Tài khoản test</span>' +
        "</label>",
      onSubmit: async () => {
        const name = $("f-name").value.trim();
        if (!name) { toast("Hãy nhập tên note", "error"); return false; }
        const { data, error } = await db.from("note_tabs")
          .insert({
            name, project_id: state.projectId, user_id: state.user.id,
            position: state.tabs.length
          })
          .select().single();
        if (error) { err(error); return false; }
        toast("Đã thêm note “" + name + "”", "success");
        await loadTabs(data.id);
      }
    });
  }

  function renameTab() {
    const t = state.tabs.find((x) => x.id === state.tabId);
    if (!t) { toast("Chưa chọn note nào", "error"); return; }
    openModal({
      title: "Đổi tên note",
      bodyHtml:
        '<label class="field"><span>Tên note</span>' +
        '<input id="f-name" value="' + esc(t.name) + '" maxlength="80" /></label>',
      onSubmit: async () => {
        const name = $("f-name").value.trim();
        if (!name) { toast("Hãy nhập tên note", "error"); return false; }
        const { error } = await db.from("note_tabs").update({ name }).eq("id", t.id);
        if (error) { err(error); return false; }
        toast("Đã đổi tên note", "success");
        await loadTabs(t.id);
      }
    });
  }

  function deleteTab() {
    const t = state.tabs.find((x) => x.id === state.tabId);
    if (!t) { toast("Chưa chọn note nào", "error"); return; }
    confirmModal("Xoá note?", 'Toàn bộ nội dung trong note "' + t.name + '" sẽ bị xoá.', async () => {
      const { error } = await db.from("note_tabs").delete().eq("id", t.id);
      if (error) { err(error); return false; }
      clearTimeout(state.saveTimer); state.dirty = false;
      state.tabId = null;
      toast("Đã xoá note", "success");
      await loadTabs();
    });
  }

  /* ---------- Kéo thả để đổi thứ tự note ---------- */
  let dragTab = null;

  function tabBefore(wrap, x) {
    const els = Array.prototype.slice.call(wrap.querySelectorAll(".tab:not(.dragging)"));
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) return els[i];
    }
    return null;
  }

  /* Đặt tab đang kéo vào đúng khe ứng với vị trí chuột */
  function positionDrag(wrap, x) {
    if (!dragTab) return;
    const ref = tabBefore(wrap, x);
    if (ref === dragTab) return;
    if (ref) wrap.insertBefore(dragTab, ref);
    else wrap.appendChild(dragTab);
  }

  /* ---------- Kéo tới mép thì tự cuộn để với tới các note bị che ---------- */
  const EDGE_ZONE = 80;    // bề rộng vùng nhạy ở hai mép (px)
  const EDGE_MAX = 22;     // tốc độ cuộn tối đa (px mỗi khung hình)
  let scrollRAF = null, scrollSpeed = 0, dragX = 0;

  function stopEdgeScroll() {
    scrollSpeed = 0;
    if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = null; }
  }

  function edgeScroll(wrap, x) {
    dragX = x;
    const r = wrap.getBoundingClientRect();
    let v = 0;
    if (x < r.left + EDGE_ZONE) v = -EDGE_MAX * (1 - (x - r.left) / EDGE_ZONE);
    else if (x > r.right - EDGE_ZONE) v = EDGE_MAX * (1 - (r.right - x) / EDGE_ZONE);
    scrollSpeed = Math.max(-EDGE_MAX, Math.min(EDGE_MAX, v));

    if (!scrollSpeed) { stopEdgeScroll(); return; }
    if (scrollRAF) return;

    const step = () => {
      if (!scrollSpeed || !dragTab) { scrollRAF = null; return; }
      const before = wrap.scrollLeft;
      wrap.scrollLeft += scrollSpeed;
      // cuộn xong vị trí các tab đã đổi -> tính lại khe chèn dù chuột đứng yên
      if (wrap.scrollLeft !== before) positionDrag(wrap, dragX);
      updateTabFades();
      scrollRAF = requestAnimationFrame(step);
    };
    scrollRAF = requestAnimationFrame(step);
  }

  /* Mờ hai mép khi còn note bị che, để biết là cuộn được */
  function updateTabFades() {
    const wrap = $("note-tabs");
    const max = wrap.scrollWidth - wrap.clientWidth;
    wrap.classList.toggle("fade-left", wrap.scrollLeft > 4);
    wrap.classList.toggle("fade-right", wrap.scrollLeft < max - 4);
  }

  function scrollActiveTabIntoView() {
    const el = $("note-tabs").querySelector(".tab.active");
    if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
    updateTabFades();
  }

  async function persistTabOrder() {
    const wrap = $("note-tabs");
    const ids = Array.prototype.slice.call(wrap.querySelectorAll(".tab")).map((el) => el.dataset.tab);
    if (ids.length !== state.tabs.length) return;
    if (ids.every((id, i) => state.tabs[i] && state.tabs[i].id === id)) return;   // không đổi gì

    const byId = {};
    state.tabs.forEach((t) => { byId[t.id] = t; });
    const ordered = ids.map((id) => byId[id]).filter(Boolean);
    if (ordered.length !== state.tabs.length) return;

    state.tabs = ordered;
    const rows = ordered.map((t, i) => {
      t.position = i;
      return { id: t.id, project_id: t.project_id, user_id: t.user_id, name: t.name, position: i };
    });

    const { error } = await db.from("note_tabs").upsert(rows);
    if (error) { err(error); await loadTabs(state.tabId); return; }
    toast("Đã đổi thứ tự note", "success");
  }

  function bindTabDnD() {
    const wrap = $("note-tabs");

    wrap.addEventListener("dragstart", (e) => {
      const t = e.target.closest(".tab");
      if (!t) return;
      dragTab = t;
      dragX = e.clientX;
      t.classList.add("dragging");
      wrap.classList.add("reordering");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", t.dataset.tab); } catch (x) {}
    });

    wrap.addEventListener("dragover", (e) => {
      if (!dragTab) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      positionDrag(wrap, e.clientX);
      edgeScroll(wrap, e.clientX);
    });

    // Kéo ra ngoài hẳn dãy tab thì ngừng cuộn
    wrap.addEventListener("dragleave", (e) => {
      if (!wrap.contains(e.relatedTarget)) stopEdgeScroll();
    });

    wrap.addEventListener("drop", (e) => { e.preventDefault(); stopEdgeScroll(); });

    wrap.addEventListener("dragend", async () => {
      stopEdgeScroll();
      if (!dragTab) return;
      dragTab.classList.remove("dragging");
      wrap.classList.remove("reordering");
      dragTab = null;
      updateTabFades();
      await persistTabOrder();
    });

    // Lăn chuột trên dãy tab = cuộn ngang (giống thanh tab của editor)
    wrap.addEventListener("wheel", (e) => {
      if (e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (wrap.scrollWidth <= wrap.clientWidth) return;
      e.preventDefault();
      wrap.scrollLeft += e.deltaY;
      updateTabFades();
    }, { passive: false });

    wrap.addEventListener("scroll", updateTabFades);
    window.addEventListener("resize", updateTabFades);
  }

  /* =====================================================================
     NOTEPAD CÓ ĐỊNH DẠNG — gõ thẳng, tự lưu
     ===================================================================== */
  /* 10 giây: đủ lâu để dán nhầm rồi sửa lại trước khi ghi xuống database.
     Rời khỏi ô soạn, chuyển tab hay Ctrl+S vẫn lưu ngay lập tức. */
  const AUTOSAVE_MS = 10000;

  /* ---------- Làm sạch HTML (chống dán rác / thẻ nguy hiểm) ---------- */
  const ALLOWED_TAGS = {
    A: ["href", "target", "rel"], B: [], STRONG: [], I: [], EM: [], U: [], S: [], STRIKE: [],
    SPAN: ["style"], DIV: ["style"], P: ["style"], BR: [], HR: [],
    UL: [], OL: [], LI: ["style"], PRE: ["style"], CODE: [], BLOCKQUOTE: [],
    H1: ["style"], H2: ["style"], H3: ["style"], FONT: ["color", "size", "face"]
  };
  /* Cố tình KHÔNG có "background-color": công cụ tô nền đã bỏ, mà chữ có nền
     thì gõ tiếp ngay sau nó sẽ bị ăn theo cái nền đó. Loại hẳn ở khâu lọc thì
     nền không vào được, kể cả khi dán từ nơi khác hay mở ghi chú cũ. */
  const ALLOWED_CSS = [
    "color", "font-size", "font-weight", "font-style",
    "text-decoration", "text-decoration-line", "text-align", "font-family"
  ];

  function cleanStyle(el) {
    const keep = [];
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style[i];
      if (ALLOWED_CSS.indexOf(prop) !== -1) keep.push(prop + ":" + el.style.getPropertyValue(prop));
    }
    if (keep.length) el.setAttribute("style", keep.join(";"));
    else el.removeAttribute("style");
  }

  function sanitizeHtml(html) {
    const box = document.createElement("div");
    box.innerHTML = html;
    const walk = (node) => {
      Array.prototype.slice.call(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) return;                       // text
        if (child.nodeType !== 1) { child.remove(); return; }   // comment…
        const tag = child.tagName;
        if (!ALLOWED_TAGS[tag]) {                               // thẻ lạ -> bóc vỏ, giữ ruột
          const parent = child.parentNode;
          while (child.firstChild) parent.insertBefore(child.firstChild, child);
          child.remove();
          return;
        }
        Array.prototype.slice.call(child.attributes).forEach((at) => {
          if (ALLOWED_TAGS[tag].indexOf(at.name) === -1) child.removeAttribute(at.name);
        });
        if (child.hasAttribute("style")) cleanStyle(child);
        if (tag === "A") {
          const href = child.getAttribute("href") || "";
          if (!/^(https?:|mailto:|#)/i.test(href)) child.removeAttribute("href");
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noopener noreferrer");
        }
        walk(child);
      });
    };
    walk(box);
    return box.innerHTML;
  }

  /* Dán từ nơi khác: bỏ màu chữ / màu nền của nguồn, giữ chữ dễ đọc trên nền tối */
  function stripColors(html) {
    const box = document.createElement("div");
    box.innerHTML = html;
    box.querySelectorAll("[style]").forEach((el) => {
      el.style.removeProperty("color");
      el.style.removeProperty("background-color");
      if (!el.getAttribute("style")) el.removeAttribute("style");
    });
    box.querySelectorAll("font[color]").forEach((el) => el.removeAttribute("color"));
    return box.innerHTML;
  }

  const BLOCK_TAG = /^(DIV|P|UL|OL|LI|H1|H2|H3|BLOCKQUOTE|PRE|HR|BR)$/;

  /* Trang giấy để white-space:pre-wrap (để giữ thụt lề khi gõ lệnh), nên mọi
     ký tự xuống dòng và thụt lề nằm GIỮA CÁC THẺ của HTML nguồn đều bị hiển thị
     thành khoảng trắng thật -> dán danh sách vào là thừa dòng, dấu chấm đầu dòng
     rời khỏi chữ. Dọn sạch khoảng trắng vô nghĩa đó, trừ bên trong <pre>. */
  function collapseWs(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const drop = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement && node.parentElement.closest("pre")) continue;
      const v = node.nodeValue;
      if (!v) continue;

      // Chỉ đụng vào khoảng trắng do HTML nguồn xuống dòng sinh ra. Khoảng trắng
      // không kèm ký tự xuống dòng là thụt lề thật của code (copy từ VS Code,
      // terminal…) -> để nguyên, nếu không sẽ mất hết thụt lề.
      if (!/[\r\n]/.test(v)) continue;

      if (!v.trim()) {
        const prev = node.previousSibling;
        const next = node.nextSibling;
        const prevBlock = !prev || (prev.nodeType === 1 && BLOCK_TAG.test(prev.tagName));
        const nextBlock = !next || (next.nodeType === 1 && BLOCK_TAG.test(next.tagName));
        if (prevBlock || nextBlock) drop.push(node);   // nằm giữa hai thẻ khối -> bỏ hẳn
        else node.nodeValue = " ";                     // giữa chữ với chữ -> một dấu cách
        continue;
      }

      let t = v.replace(/[\r\n]+[ \t]*/g, " ");       // xuống dòng + thụt lề -> một dấu cách
      if (!node.previousSibling) t = t.replace(/^[ \t]+/, "");
      if (!node.nextSibling) t = t.replace(/[ \t]+$/, "");
      node.nodeValue = t;
    }
    drop.forEach((n) => n.remove());
  }

  /* Dán hay bị thừa một dòng trống: nguồn copy thường kèm ký tự xuống dòng ở cuối,
     hoặc bọc cả đoạn trong một thẻ khối. Gỡ cả hai trước khi chèn. */
  function tidyPaste(html) {
    const box = document.createElement("div");
    box.innerHTML = html;

    collapseWs(box);

    // <li><div>chữ</div></li> -> <li>chữ</li>, tránh thẻ khối lồng trong mục danh sách
    box.querySelectorAll("li").forEach((li) => {
      while (
        li.childNodes.length === 1 &&
        li.firstChild.nodeType === 1 &&
        /^(DIV|P)$/.test(li.firstChild.tagName)
      ) {
        li.innerHTML = li.firstChild.innerHTML;
      }
    });

    // chỉ có đúng một lớp bọc <div>/<p> bao ngoài -> gỡ ra cho khỏi thành đoạn mới
    while (
      box.childNodes.length === 1 &&
      box.firstChild.nodeType === 1 &&
      /^(DIV|P)$/.test(box.firstChild.tagName) &&
      !box.firstChild.getAttribute("style")
    ) {
      box.innerHTML = box.firstChild.innerHTML;
    }

    // cắt <br> và khối rỗng ở cuối
    let n;
    while ((n = box.lastChild)) {
      if (n.nodeType === 3 && !n.nodeValue.trim()) { n.remove(); continue; }
      if (n.nodeType === 1 && n.tagName === "BR") { n.remove(); continue; }
      if (n.nodeType === 1 && /^(DIV|P)$/.test(n.tagName) && !n.textContent.trim()) { n.remove(); continue; }
      break;
    }
    return box.innerHTML;
  }

  const isUrl = (t) => /^(https?:\/\/|www\.)[^\s]+$/i.test(String(t || "").trim());
  const toHref = (t) => {
    const v = String(t).trim();
    return /^(https?:|mailto:)/i.test(v) ? v : "https://" + v;
  };

  function markLinksExternal() {
    $("notepad").querySelectorAll("a[href]").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });
  }

  const looksLikeHtml = (t) =>
    /<(br|div|p|span|b|i|u|s|ul|ol|li|pre|code|h[1-3]|font|strong|em|a|hr|blockquote)\b[^>]*>/i.test(t || "");

  function plainToHtml(t) {
    return esc(t || "").replace(/\n/g, "<br>");
  }

  function htmlToText(html) {
    const box = document.createElement("div");
    box.innerHTML = html || "";
    return box.textContent || "";
  }

  /* ---------- Tải & hiển thị ---------- */
  async function loadItems() {
    if (!state.tabs.length) { state.items = []; renderTabs(); renderPad(); return; }
    const ids = state.tabs.map((t) => t.id);
    const { data, error } = await db
      .from("note_items").select("*").in("tab_id", ids)
      .order("created_at", { ascending: true });
    if (error) return err(error);
    state.items = data || [];
    renderTabs();
    renderPad();
  }

  function renderPad() {
    clearTimeout(state.saveTimer);
    const pad = $("notepad");
    const hasTab = !!state.tabId;

    $("rename-tab-btn").disabled = !hasTab;
    $("delete-tab-btn").disabled = !hasTab;
    $("fmt-bar").classList.toggle("disabled", !hasTab);
    pad.classList.toggle("hidden", !hasTab);
    $("pad-placeholder").classList.toggle("hidden", hasTab);

    if (!hasTab) {
      state.doc = { html: "", saved: "", ids: [] };
      pad.innerHTML = "";
      setStatus("");
      return;
    }

    const mine = state.items.filter((i) => i.tab_id === state.tabId);
    const html = sanitizeHtml(
      mine.map((i) => (looksLikeHtml(i.content) ? i.content : plainToHtml(i.content))).join("<br><br>")
    );
    pad.innerHTML = html;
    const norm = pad.innerHTML;   // trình duyệt có thể viết lại thẻ -> lấy lại làm mốc
    state.doc = { html: norm, saved: norm, ids: mine.map((i) => i.id) };
    state.dirty = false;
    setStatus(htmlToText(norm).trim() ? "saved" : "");
  }

  function setStatus(kind, extra) {
    const el = $("save-status");
    if (!kind) { el.textContent = ""; el.className = "save-status"; return; }
    if (kind === "saving") { el.textContent = "Đang lưu…"; el.className = "save-status saving"; }
    else if (kind === "dirty") { el.textContent = "● Chưa lưu"; el.className = "save-status dirty"; }
    else { el.textContent = "✓ Đã lưu" + (extra ? " lúc " + extra : ""); el.className = "save-status saved"; }
  }

  function onPadInput() {
    state.doc.html = $("notepad").innerHTML;
    state.dirty = state.doc.html !== state.doc.saved;
    if (!state.dirty) return;
    setStatus("dirty");
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(savePad, AUTOSAVE_MS);
  }

  async function savePad(force) {
    clearTimeout(state.saveTimer);
    if (!state.tabId || state.saving) return;
    if (!state.dirty && !force) return;

    // raw = đúng những gì đang nằm trên màn hình; html = bản đã lọc để cất vào DB.
    // Phải so mốc "đã lưu" với raw, không phải với html — nếu không bộ lọc chuẩn hoá
    // lại thẻ một chút là lần nào cũng bị coi như còn thay đổi.
    const raw = $("notepad").innerHTML;
    const html = sanitizeHtml(raw);
    const tabId = state.tabId;
    const ids = state.doc.ids.slice();
    const payload = { title: firstLine(htmlToText(html)) || "(trống)", content: html };

    state.saving = true;
    setStatus("saving");
    try {
      if (!ids.length) {
        const { data, error } = await db.from("note_items")
          .insert(Object.assign({ tab_id: tabId, user_id: state.user.id }, payload))
          .select().single();
        if (error) throw error;
        state.doc.ids = [data.id];
        state.items.push(data);
      } else {
        const { error } = await db.from("note_items")
          .update(Object.assign({ updated_at: new Date().toISOString() }, payload))
          .eq("id", ids[0]);
        if (error) throw error;
        if (ids.length > 1) {                     // gộp các bản ghi cũ về một trang
          const extra = ids.slice(1);
          await db.from("note_items").delete().in("id", extra);
          state.items = state.items.filter((i) => extra.indexOf(i.id) === -1);
          state.doc.ids = [ids[0]];
        }
        const it = state.items.find((i) => i.id === ids[0]);
        if (it) it.content = html;
      }
      state.doc.saved = raw;
      state.doc.html = raw;
      state.dirty = $("notepad").innerHTML !== raw;   // chỉ dirty nếu gõ thêm trong lúc chờ
      setStatus(state.dirty ? "dirty" : "saved", nowHM());
      renderTabs();
    } catch (e) {
      setStatus("dirty");
      err(e);
    } finally {
      state.saving = false;
    }
  }

  function nowHM() {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  async function flushPad() {
    if (state.dirty) await savePad();
  }

  /* =====================================================================
     TÌM KIẾM TOÀN BỘ — quét mọi dự án / mọi note
     ===================================================================== */
  const SEARCH_MS = 260;
  const searchState = { timer: null, q: "", hits: [], cursor: -1, seq: 0 };

  /* PostgREST coi * và % là ký tự đại diện -> bỏ đi để tìm đúng chữ người dùng gõ */
  const likeSafe = (q) => q.replace(/[*%]/g, " ").trim();

  function gsSetStatus(text) {
    $("gs-status").textContent = text || "";
    $("gs-status").classList.toggle("hidden", !text);
  }

  function gsOpen() { $("gs-panel").classList.remove("hidden"); }
  function gsClose() {
    $("gs-panel").classList.add("hidden");
    searchState.cursor = -1;
  }

  function snippet(html, q) {
    const text = htmlToText(html).replace(/\s+/g, " ").trim();
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return esc(text.slice(0, 150)) + (text.length > 150 ? "…" : "");
    const from = Math.max(0, i - 45);
    const to = Math.min(text.length, i + q.length + 95);
    return (
      (from > 0 ? "…" : "") +
      esc(text.slice(from, i)) +
      "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" +
      esc(text.slice(i + q.length, to)) +
      (to < text.length ? "…" : "")
    );
  }

  async function runSearch(raw) {
    const q = raw.trim();
    searchState.q = q;
    if (q.length < 2) { gsClose(); return; }

    const safe = likeSafe(q);
    if (!safe) { gsOpen(); gsSetStatus("Từ khoá không hợp lệ"); $("gs-results").innerHTML = ""; return; }

    const seq = ++searchState.seq;
    gsOpen();
    gsSetStatus("Đang tìm…");

    await ensureToken();
    const { data, error } = await db
      .from("note_items").select("id, tab_id, content")
      .ilike("content", "*" + safe + "*")
      .limit(60);

    if (seq !== searchState.seq) return;         // đã gõ tiếp, bỏ kết quả cũ
    if (error) { gsSetStatus("Lỗi: " + (error.message || error)); $("gs-results").innerHTML = ""; return; }

    const rows = data || [];
    if (!rows.length) {
      searchState.hits = [];
      $("gs-results").innerHTML = "";
      gsSetStatus("Không tìm thấy “" + q + "”");
      return;
    }

    // lấy tên note cho các tab có kết quả
    const tabIds = rows.map((r) => r.tab_id).filter((v, i, a) => a.indexOf(v) === i);
    const { data: tabs } = await db.from("note_tabs").select("id, name, project_id").in("id", tabIds);
    if (seq !== searchState.seq) return;

    const tabById = {};
    (tabs || []).forEach((t) => { tabById[t.id] = t; });
    const projById = {};
    state.projects.forEach((p) => { projById[p.id] = p; });

    searchState.hits = rows
      .map((r) => {
        const tab = tabById[r.tab_id];
        if (!tab) return null;
        const proj = projById[tab.project_id];
        return {
          projectId: tab.project_id,
          projectName: proj ? proj.name : "(dự án khác)",
          tabId: tab.id,
          tabName: tab.name,
          html: snippet(r.content, q)
        };
      })
      .filter(Boolean);

    searchState.cursor = -1;
    gsSetStatus(searchState.hits.length + " kết quả");
    renderHits();
  }

  function renderHits() {
    $("gs-results").innerHTML = searchState.hits
      .map((h, i) =>
        '<button class="gs-hit' + (i === searchState.cursor ? " on" : "") + '" data-hit="' + i + '">' +
          '<div class="gs-path">' + esc(h.projectName) +
            ' <span class="gs-arrow">›</span> ' + esc(h.tabName) + "</div>" +
          '<div class="gs-snip">' + h.html + "</div>" +
        "</button>"
      )
      .join("");
  }

  function moveCursor(step) {
    if (!searchState.hits.length) return;
    searchState.cursor =
      (searchState.cursor + step + searchState.hits.length) % searchState.hits.length;
    renderHits();
    const el = $("gs-results").querySelector(".gs-hit.on");
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  /* Bôi đen đúng đoạn khớp trong trang giấy — dùng Range nên KHÔNG đụng vào nội dung */
  function focusMatchInPad(q) {
    const pad = $("notepad");
    const needle = (q || "").toLowerCase();
    if (!needle) return;
    const walker = document.createTreeWalker(pad, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.nodeValue.toLowerCase().indexOf(needle);
      if (i === -1) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + q.length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const r = range.getBoundingClientRect();
      const p = pad.getBoundingClientRect();
      pad.scrollTop += r.top - p.top - pad.clientHeight / 3;
      return;
    }
  }

  async function openHit(i) {
    const h = searchState.hits[i];
    if (!h) return;
    const q = searchState.q;
    gsClose();
    $("gs-input").blur();

    await flushPad();
    if (state.projectId !== h.projectId) await selectProject(h.projectId);
    if (state.tabId !== h.tabId) {
      state.tabId = h.tabId;
      rememberPlace();
      renderTabs();
      renderPad();
    }
    focusMatchInPad(q);
  }

  function bindSearch() {
    const input = $("gs-input");

    input.addEventListener("input", () => {
      clearTimeout(searchState.timer);
      const v = input.value;
      searchState.timer = setTimeout(() => runSearch(v), SEARCH_MS);
    });

    input.addEventListener("focus", () => { if (searchState.hits.length && input.value.trim().length > 1) gsOpen(); });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); moveCursor(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveCursor(-1); }
      else if (e.key === "Enter") {
        e.preventDefault();
        openHit(searchState.cursor >= 0 ? searchState.cursor : 0);
      } else if (e.key === "Escape") { gsClose(); input.blur(); }
    });

    $("gs-results").addEventListener("mousedown", (e) => {
      const b = e.target.closest("[data-hit]");
      if (b) { e.preventDefault(); openHit(Number(b.dataset.hit)); }
    });

    document.addEventListener("mousedown", (e) => {
      if (!e.target.closest(".global-search")) gsClose();
    });

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  /* =====================================================================
     THANH ĐỊNH DẠNG
     ===================================================================== */
  let savedRange = null;

  function rememberSel() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && $("notepad").contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  function focusPad() {
    const pad = $("notepad");
    pad.focus();
    if (savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  }

  function exec(cmd, val) {
    focusPad();
    try { document.execCommand("styleWithCSS", false, true); } catch (e) {}
    document.execCommand(cmd, false, val === undefined ? null : val);
    rememberSel();
    onPadInput();
    syncToolbar();
  }

  /* Cỡ chữ: execCommand chỉ hiểu 1..7 -> gắn cờ size=7 rồi đổi sang px thật */
  function applyFontSize(px) {
    focusPad();
    document.execCommand("fontSize", false, "7");
    $("notepad").querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement("span");
      span.style.fontSize = px + "px";
      while (f.firstChild) span.appendChild(f.firstChild);
      f.parentNode.replaceChild(span, f);
    });
    rememberSel();
    onPadInput();
  }

  /* Chèn liên kết: bôi đen chữ rồi bấm, hoặc không bôi gì thì nhập cả chữ hiển thị */
  function insertLink() {
    const sel = String(window.getSelection() || "").trim();
    rememberSel();
    openModal({
      title: sel ? 'Gắn liên kết cho “' + (sel.length > 40 ? sel.slice(0, 40) + "…" : sel) + '”' : "Chèn liên kết",
      bodyHtml:
        '<label class="field"><span>Địa chỉ</span>' +
        '<input id="f-name" placeholder="Dán link vào đây" />' +
        '<span class="hint">Thiếu https:// thì tự thêm.</span></label>' +
        (sel ? "" :
          '<label class="field"><span>Chữ hiển thị</span>' +
          '<input id="f-desc" placeholder="Để trống sẽ hiện nguyên địa chỉ" /></label>'),
      okText: "Gắn liên kết",
      onSubmit: () => {
        const raw = $("f-name").value.trim();
        if (!raw) { toast("Hãy nhập địa chỉ", "error"); return false; }
        const href = toHref(raw);
        if (sel) {
          exec("createLink", href);
        } else {
          const label = $("f-desc").value.trim() || href;
          exec("insertHTML",
            '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + "</a>&nbsp;");
        }
        markLinksExternal();
        onPadInput();
      }
    });
  }

  function syncToolbar() {
    const b = document.querySelector('.fmt-btn[data-cmd="bold"]');
    if (!b) return;
    let on = false;
    try { on = document.queryCommandState("bold"); } catch (e) {}
    b.classList.toggle("active", on);
  }

  function bindEditor() {
    const pad = $("notepad");
    const bar = $("fmt-bar");

    pad.addEventListener("input", onPadInput);
    pad.addEventListener("keyup", () => { rememberSel(); syncToolbar(); });
    pad.addEventListener("mouseup", () => { rememberSel(); syncToolbar(); });
    pad.addEventListener("blur", () => { rememberSel(); if (state.dirty) savePad(); });

    pad.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); savePad(true); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") { e.preventDefault(); insertLink(); return; }
      if (e.key === "Tab") {
        e.preventDefault();
        document.execCommand("insertHTML", false, "&nbsp;&nbsp;");
        onPadInput();
      }
    });

    // Dán: lọc sạch HTML, cắt xuống dòng thừa, URL thì thành liên kết
    pad.addEventListener("paste", (e) => {
      e.preventDefault();
      const dt = e.clipboardData;
      const html = dt.getData("text/html");
      const txt = dt.getData("text/plain");

      // dán một URL trong khi đang bôi đen chữ -> biến chữ đó thành liên kết
      if (isUrl(txt) && String(window.getSelection() || "").trim()) {
        document.execCommand("createLink", false, toHref(txt));
        markLinksExternal();
        onPadInput();
        return;
      }

      const payload = html
        ? tidyPaste(stripColors(sanitizeHtml(html)))
        : plainToHtml(txt.replace(/\r\n/g, "\n").replace(/[ \t]*\n+$/, ""));

      document.execCommand("insertHTML", false, payload);
      markLinksExternal();
      onPadInput();
    });

    // Bấm vào liên kết thì mở ra (giữ Alt nếu muốn đặt con trỏ để sửa chữ)
    pad.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a || !pad.contains(a) || e.altKey) return;
      e.preventDefault();
      window.open(a.getAttribute("href"), "_blank", "noopener,noreferrer");
    });

    // Giữ vùng bôi đen khi bấm nút trên thanh công cụ
    bar.addEventListener("mousedown", (e) => {
      if (e.target.closest(".fmt-btn")) e.preventDefault();
    });

    bar.addEventListener("click", (e) => {
      const b = e.target.closest(".fmt-btn");
      if (!b) return;
      if (b.dataset.cmd) { exec(b.dataset.cmd); return; }
      if (b.dataset.act === "link") insertLink();
      else if (b.dataset.act === "clear") {
        exec("unlink");          // removeFormat không gỡ được thẻ <a>
        exec("removeFormat");
        exec("formatBlock", "p");
      }
    });

    $("fmt-block").addEventListener("change", (e) => {
      exec("formatBlock", e.target.value);
      e.target.selectedIndex = 0;
    });
    $("fmt-size").addEventListener("change", (e) => {
      if (e.target.value) applyFontSize(e.target.value);
      e.target.selectedIndex = 0;
    });

    window.addEventListener("beforeunload", (e) => {
      if (state.dirty) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  /* =====================================================================
     SỰ KIỆN
     ===================================================================== */
  function bind() {
    // Auth
    $("auth-form").addEventListener("submit", handleAuthSubmit);
    $("logout-btn").addEventListener("click", logout);

    // Sidebar
    $("open-sidebar").addEventListener("click", () => $("sidebar").classList.add("open"));
    $("close-sidebar").addEventListener("click", () => $("sidebar").classList.remove("open"));
    $("project-search").addEventListener("input", (e) => {
      state.projectFilter = e.target.value; renderProjects();
    });
    $("project-list").addEventListener("click", (e) => {
      const b = e.target.closest("[data-project]");
      if (b) selectProject(b.dataset.project);
    });
    $("retry-load").addEventListener("click", async () => {
      const b = $("retry-load"); b.disabled = true; b.textContent = "Đang tải…";
      await loadWithRetry();
      b.disabled = false; b.textContent = "Thử lại";
    });
    $("retry-relogin").addEventListener("click", logout);
    $("add-project-btn").addEventListener("click", addProject);
    $("empty-add-project").addEventListener("click", addProject);
    $("rename-project-btn").addEventListener("click", renameProject);
    $("delete-project-btn").addEventListener("click", deleteProject);

    // Tabs
    $("note-tabs").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-tab]");
      if (!b || dragTab || b.dataset.tab === state.tabId) return;
      await flushPad();
      state.tabId = b.dataset.tab;
      rememberPlace();
      renderTabs();
      renderPad();
      $("notepad").focus();
    });
    $("add-tab-btn").addEventListener("click", addTab);
    bindTabDnD();
    $("rename-tab-btn").addEventListener("click", renameTab);
    $("delete-tab-btn").addEventListener("click", deleteTab);

    $("pad-add-tab").addEventListener("click", addTab);

    // Trình soạn thảo + thanh định dạng
    bindEditor();
    bindSearch();

    // Modal
    $("modal-close").addEventListener("click", closeModal);
    $("modal-cancel").addEventListener("click", closeModal);
    $("modal-backdrop").addEventListener("mousedown", (e) => {
      if (e.target === $("modal-backdrop")) closeModal();
    });
    $("modal-ok").addEventListener("click", runModalSubmit);
    $("modal-body").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.target.tagName !== "TEXTAREA" || e.ctrlKey || e.metaKey)) {
        e.preventDefault(); runModalSubmit();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("modal-backdrop").classList.contains("hidden")) closeModal();
    });
  }

  async function runModalSubmit() {
    if (!modalSubmit) return;
    const btn = $("modal-ok");
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = "Đang lưu…";
    try {
      const res = await modalSubmit();
      if (res !== false) closeModal();
    } catch (e) {
      err(e);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  /* =====================================================================
     KHỞI ĐỘNG
     ===================================================================== */
  async function boot() {
    bind();

    if (!db) {
      $("splash").classList.add("hidden");
      showAuth();
      authMsg("Chưa cấu hình Supabase — mở file config.js và điền SUPABASE_URL + SUPABASE_ANON_KEY.");
      return;
    }

    let dataLoaded = false;   // chỉ bật khi đã tải dữ liệu THÀNH CÔNG

    async function enter(session) {
      state.user = session.user;
      syncRestToken(session);
      showApp();
      if (dataLoaded) return;
      dataLoaded = await loadWithRetry();   // thất bại -> vẫn false, lát nữa thử lại
    }

    db.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session || !session.user) {
        if (event === "SIGNED_OUT") { state.user = null; dataLoaded = false; showAuth(); }
        return;
      }
      // TOKEN_REFRESHED: nếu lần tải đầu hỏng vì token hết hạn thì đây là lúc thử lại
      await enter(session);
    });

    /* Mở lại trình duyệt sau một thời gian dài: access_token trong localStorage đã hết
       hạn. Phải làm mới token TRƯỚC khi gọi PostgREST, nếu không câu query đầu tiên
       đi kèm JWT hết hạn -> lỗi 401 -> danh sách trống dù vẫn "đang đăng nhập". */
    let session = null;
    try {
      const got = await db.auth.getSession();
      session = got.data && got.data.session;
    } catch (e) { console.warn("getSession:", e); }

    if (session) {
      const expMs = (session.expires_at || 0) * 1000;
      if (!expMs || expMs - Date.now() < 60000) {
        try {
          const r = await db.auth.refreshSession();
          if (r.data && r.data.session) {
            session = r.data.session;
          } else {
            // refresh_token cũng hết hiệu lực -> phiên đăng nhập đã chết thật
            console.warn("refreshSession:", r.error);
            session = null;
            try { await db.auth.signOut({ scope: "local" }); } catch (x) {}
          }
        } catch (e) {
          console.warn("refreshSession:", e);
          session = null;
        }
      }
    }

    if (session && session.user) await enter(session);
    else {
      showAuth();
      if (localStorage.getItem("dn-was-logged-in")) {
        authMsg("Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.", "error");
      }
    }
    try { localStorage.setItem("dn-was-logged-in", session ? "1" : ""); } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
