/**
 * NICOLA VIANELLO // DARKROOM ARCHIVE & CONTACT-SHEET CMS (FOTOGRAFIA)
 * Complete Frontend Controller for managing window.PHOTOS_MANIFEST
 */

(function () {
  "use strict";

  const DEFAULT_CATEGORIES = ["NATURA", "PARTY", "SOGGETTI", "ANIMALI", "ASTRATTO"];
  const STORAGE_PREVIEW_KEY = "NV_FOTO_CMS_PREVIEW_V1";
  const STORAGE_AUTH_TOKEN_KEY = "NV_FOTO_CMS_AUTH_TOKEN_V1";
  const HARDCODED_HASH = "b46b070bb4e16d3f23a105f9da4339e8020ff6a0c00ff8a3424d86a111b15747"; // SHA-256 of 'finefilo'

  const state = {
    online: false,
    authenticated: false,
    authToken: localStorage.getItem(STORAGE_AUTH_TOKEN_KEY) || "",
    dirty: false,
    categories: [...DEFAULT_CATEGORIES],
    photos: [],
    filteredPhotos: [],
    activeCategory: "ALL",
    activeOrientation: "ALL",
    searchQuery: "",
    gridSize: "medium",
    activeFilename: null,
    selectedFilenames: new Set(),
    uploadQueue: [],
  };

  // DOM Elements
  const el = {
    serverLed: document.getElementById("server-led"),
    serverStatusText: document.getElementById("server-status-text"),
    statTotal: document.getElementById("stat-total"),
    statFiltered: document.getElementById("stat-filtered"),
    statSelected: document.getElementById("stat-selected"),

    btnOpenUpload: document.getElementById("btn-open-upload"),
    btnRescan: document.getElementById("btn-rescan"),
    btnExportJs: document.getElementById("btn-export-js"),
    btnSaveAll: document.getElementById("btn-save-all"),
    btnGitSync: document.getElementById("btn-git-sync"),

    searchInput: document.getElementById("search-input"),
    btnClearSearch: document.getElementById("btn-clear-search"),
    catFilterPills: document.getElementById("category-filter-pills"),
    btnAddCategory: document.getElementById("btn-add-category"),
    orientationFilter: document.getElementById("orientation-filter"),
    gridSizeSelect: document.getElementById("grid-size-select"),
    btnSelectVisible: document.getElementById("btn-select-visible"),

    batchBar: document.getElementById("batch-bar"),
    batchCountLabel: document.getElementById("batch-count-label"),
    btnClearSelection: document.getElementById("btn-clear-selection"),
    batchCatButtons: document.getElementById("batch-cat-buttons"),
    batchStockSelect: document.getElementById("batch-stock-select"),
    btnBatchMoveTop: document.getElementById("btn-batch-move-top"),
    btnBatchDelete: document.getElementById("btn-batch-delete"),

    grid: document.getElementById("contact-sheet-grid"),

    inspectorEmpty: document.getElementById("inspector-empty"),
    inspectorContent: document.getElementById("inspector-content"),
    inspId: document.getElementById("insp-id"),
    inspFilename: document.getElementById("insp-filename"),
    btnPrevPhoto: document.getElementById("btn-prev-photo"),
    btnNextPhoto: document.getElementById("btn-next-photo"),
    inspImg: document.getElementById("insp-img"),
    inspDimsBadge: document.getElementById("insp-dims-badge"),
    inspRatioBadge: document.getElementById("insp-ratio-badge"),
    inspOrientBadge: document.getElementById("insp-orient-badge"),

    inpPosition: document.getElementById("inp-position"),
    btnApplyPos: document.getElementById("btn-apply-pos"),
    btnMoveFirst: document.getElementById("btn-move-first"),
    btnMoveUp: document.getElementById("btn-move-up"),
    btnMoveDown: document.getElementById("btn-move-down"),
    btnMoveLast: document.getElementById("btn-move-last"),

    inspCatSelector: document.getElementById("insp-cat-selector"),
    inpTitle: document.getElementById("inp-title"),
    inpFrame: document.getElementById("inp-frame"),
    inpOrientation: document.getElementById("inp-orientation"),
    inpStock: document.getElementById("inp-stock"),
    inpLens: document.getElementById("inp-lens"),
    inpShutter: document.getElementById("inp-shutter"),
    inpIso: document.getElementById("inp-iso"),
    inspSrcPath: document.getElementById("insp-src-path"),
    inpReplaceFile: document.getElementById("inp-replace-file"),
    btnDeleteSingle: document.getElementById("btn-delete-single"),
    btnApplyInspector: document.getElementById("btn-apply-inspector"),

    uploadModal: document.getElementById("upload-modal"),
    btnCloseUpload: document.getElementById("btn-close-upload"),
    btnCancelUpload: document.getElementById("btn-cancel-upload"),
    uploadCategorySelect: document.getElementById("upload-category-select"),
    uploadStockSelect: document.getElementById("upload-stock-select"),
    uploadPositionSelect: document.getElementById("upload-position-select"),
    uploadDropzone: document.getElementById("upload-dropzone"),
    uploadFileInput: document.getElementById("upload-file-input"),
    uploadQueue: document.getElementById("upload-queue"),
    uploadStatusMsg: document.getElementById("upload-status-msg"),
    btnStartUpload: document.getElementById("btn-start-upload"),

    btnCmsLock: document.getElementById("btn-cms-lock"),
    authGate: document.getElementById("auth-gate"),
    authForm: document.getElementById("auth-form"),
    authPassword: document.getElementById("auth-password"),
    authErrorMsg: document.getElementById("auth-error-msg"),
    btnAuthSubmit: document.getElementById("btn-auth-submit"),

    toast: document.getElementById("cms-toast"),
  };

  let toastTimer = null;
  function showToast(msg, duration = 3200) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.hidden = true;
    }, duration);
  }

  function markDirty() {
    state.dirty = true;
    el.btnSaveAll.innerHTML = "<span>💾 SALVA ARCHIVIO *</span>";
    try {
      localStorage.setItem(
        STORAGE_PREVIEW_KEY,
        JSON.stringify({ categories: state.categories, photos: state.photos, updatedAt: Date.now() })
      );
    } catch (_) {}
  }

  function clearDirty() {
    state.dirty = false;
    el.btnSaveAll.innerHTML = "<span>💾 SALVA ARCHIVIO</span>";
  }

  function reindexPhotos() {
    state.photos.forEach((p, idx) => {
      const n = idx + 1;
      const padded = String(n).padStart(3, "0");
      p.index = n;
      p.id = `#${padded}`;
      if (!p.frame || p.frame.startsWith("FRM // ")) {
        p.frame = `FRM // ${padded}`;
      }
      if (typeof p.title !== "string") {
        p.title = "";
      }
    });
  }

  // ==========================================
  // AUTHENTICATION CONTROLLER (PASSWORD: finefilo)
  // ==========================================
  async function sha256(str) {
    const buffer = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function unlockCmsUI() {
    state.authenticated = true;
    if (el.authGate) {
      el.authGate.classList.add("is-unlocked");
    }
  }

  function lockCmsUI() {
    state.authenticated = false;
    state.authToken = "";
    localStorage.removeItem(STORAGE_AUTH_TOKEN_KEY);
    if (el.authGate) {
      el.authGate.classList.remove("is-unlocked");
      if (el.authPassword) {
        el.authPassword.value = "";
        el.authPassword.focus();
      }
      if (el.authErrorMsg) el.authErrorMsg.hidden = true;
    }
  }

  async function checkInitialAuth() {
    // If we have an auth token stored, verify it with server
    if (state.authToken) {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (res.ok) {
          // Connected to server with existing token
          unlockCmsUI();
          return;
        }
      } catch (_) {
        // Offline / file:// mode: accept stored token
        unlockCmsUI();
        return;
      }
    }
    // Lock by default until password entered
    if (el.authGate) {
      el.authGate.classList.remove("is-unlocked");
      if (el.authPassword) el.authPassword.focus();
    }
  }

  async function handleLoginSubmit() {
    const pwd = el.authPassword.value.trim();
    if (!pwd) return;

    if (el.btnAuthSubmit) el.btnAuthSubmit.disabled = true;
    if (el.authErrorMsg) el.authErrorMsg.hidden = true;

    // Try server authentication first
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        state.authToken = json.token;
        localStorage.setItem(STORAGE_AUTH_TOKEN_KEY, json.token);
        unlockCmsUI();
        showToast("✓ Accesso autorizzato");
        if (el.btnAuthSubmit) el.btnAuthSubmit.disabled = false;
        return;
      }
    } catch (_) {
      // Offline / standalone fallback check with SHA-256
    }

    const hashed = await sha256(pwd);
    if (hashed === HARDCODED_HASH || pwd === "finefilo") {
      state.authToken = "local_" + Date.now();
      localStorage.setItem(STORAGE_AUTH_TOKEN_KEY, state.authToken);
      unlockCmsUI();
      showToast("✓ Accesso autorizzato");
    } else {
      if (el.authErrorMsg) el.authErrorMsg.hidden = false;
      if (el.authPassword) {
        el.authPassword.value = "";
        el.authPassword.focus();
      }
    }
    if (el.btnAuthSubmit) el.btnAuthSubmit.disabled = false;
  }

  // ==========================================
  // INITIALIZATION & SERVER DATA LOADING
  // ==========================================
  async function init() {
    bindEvents();
    await checkInitialAuth();
    await loadArchiveData();
    applyFilters();
    renderAll();
  }

  async function loadArchiveData() {
    try {
      const res = await fetch("/api/photos", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          state.online = true;
          state.categories =
            Array.isArray(json.data.categories) && json.data.categories.length
              ? json.data.categories
              : [...DEFAULT_CATEGORIES];
          state.photos = Array.isArray(json.data.photos) ? json.data.photos : [];
          reindexPhotos();
          el.serverLed.classList.add("online");
          el.serverStatusText.textContent = `ONLINE // Server Python attivo (${state.photos.length} scatti in FOTO/)`;
          return;
        }
      }
    } catch (_) {
      // Fallback to window.PHOTOS_MANIFEST
    }

    state.online = false;
    el.serverLed.classList.remove("online");
    el.serverStatusText.textContent =
      "MODALITÀ LOCALE // Avvia 'Avvia-Admin.command' per salvare direttamente su disco";

    if (Array.isArray(window.PHOTOS_CATEGORIES) && window.PHOTOS_CATEGORIES.length) {
      state.categories = [...window.PHOTOS_CATEGORIES];
    }
    if (Array.isArray(window.PHOTOS_MANIFEST)) {
      state.photos = JSON.parse(JSON.stringify(window.PHOTOS_MANIFEST));
      reindexPhotos();
    }

    // Restore any offline preview edits saved in localStorage
    try {
      const cached = localStorage.getItem(STORAGE_PREVIEW_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.photos) && parsed.photos.length) {
          state.photos = parsed.photos;
          if (Array.isArray(parsed.categories) && parsed.categories.length) {
            state.categories = parsed.categories;
          }
          reindexPhotos();
          markDirty();
        }
      }
    } catch (_) {}
  }

  // ==========================================
  // FILTERING & RENDERING
  // ==========================================
  function applyFilters() {
    const q = state.searchQuery.trim().toLowerCase();
    state.filteredPhotos = state.photos.filter((p) => {
      if (state.activeCategory !== "ALL" && p.category !== state.activeCategory) {
        return false;
      }
      if (state.activeOrientation !== "ALL" && p.orientation !== state.activeOrientation) {
        return false;
      }
      if (q) {
        const hay = `${p.id} ${p.frame} ${p.filename} ${p.title || ""} ${p.category} ${p.stock || ""} ${p.lens || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderAll() {
    renderStats();
    renderCategoryPills();
    renderBatchBar();
    renderContactSheetGrid();
    renderInspector();
  }

  function renderStats() {
    el.statTotal.textContent = state.photos.length;
    el.statFiltered.textContent = state.filteredPhotos.length;
    el.statSelected.textContent = state.selectedFilenames.size;
  }

  function renderCategoryPills() {
    const counts = { ALL: state.photos.length };
    state.categories.forEach((c) => (counts[c] = 0));
    state.photos.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });

    const allPills = ["ALL", ...state.categories];
    el.catFilterPills.innerHTML = allPills
      .map((cat) => {
        const active = state.activeCategory === cat ? "active" : "";
        const label = cat === "ALL" ? "TUTTI" : cat;
        const cnt = counts[cat] || 0;
        const isCustom = cat !== "ALL";
        return `
          <div class="cat-pill-wrap">
            <button type="button" class="cat-pill ${active}" data-cat="${cat}">
              <span>${label}</span>
              <span class="count">(${cnt})</span>
              ${isCustom ? `<span class="cat-del-btn" data-del-cat="${cat}" title="Elimina categoria ${cat}">✕</span>` : ''}
            </button>
          </div>
        `;
      })
      .join("");

    // Populate upload modal category select
    el.uploadCategorySelect.innerHTML = state.categories
      .map((c) => `<option value="${c}">${c}</option>`)
      .join("");
  }

  function renderBatchBar() {
    const selCount = state.selectedFilenames.size;
    if (selCount === 0) {
      el.batchBar.hidden = true;
      document.body.classList.remove("has-batch");
      return;
    }

    el.batchBar.hidden = false;
    document.body.classList.add("has-batch");
    el.batchCountLabel.textContent = `${selCount} scatt${selCount === 1 ? "o selezionato" : "i selezionati"}`;

    el.batchCatButtons.innerHTML = state.categories
      .map(
        (cat) =>
          `<button type="button" class="btn btn-secondary btn-sm" data-batch-cat="${cat}">${cat}</button>`
      )
      .join("");
  }

  function renderContactSheetGrid() {
    el.grid.className = `contact-sheet-grid ${state.gridSize}`;

    if (state.filteredPhotos.length === 0) {
      el.grid.innerHTML = `<div style="grid-column: 1/-1; padding: 60px 20px; text-align:center; color: var(--text-silver); font-family: var(--font-mono);">
        Nessuno scatto corrisponde ai filtri selezionati.
      </div>`;
      return;
    }

    const orientShort = {
      landscape: "LND",
      portrait: "PRT",
      panoramic: "PAN",
      square: "SQR",
    };

    el.grid.innerHTML = state.filteredPhotos
      .map((p) => {
        const isActive = p.filename === state.activeFilename ? "active" : "";
        const isSelected = state.selectedFilenames.has(p.filename) ? "selected" : "";
        const checked = state.selectedFilenames.has(p.filename) ? "checked" : "";
        const oTag = orientShort[p.orientation] || "LND";

        const quickCatsHtml = state.categories
          .map((cat) => {
            const abbr = cat.slice(0, 3);
            const cActive = p.category === cat ? "active" : "";
            return `<button type="button" class="qcat-btn ${cActive}" data-qcat="${cat}" data-fn="${p.filename}" title="Assegna a ${cat}">${abbr}</button>`;
          })
          .join("");

        return `<article class="frame-card ${isActive} ${isSelected}" data-filename="${p.filename}">
          <div class="frame-top-strip">
            <label class="frame-check-wrap" onclick="event.stopPropagation()">
              <input type="checkbox" class="frame-checkbox" data-check-fn="${p.filename}" ${checked} />
              <span class="frame-num">${p.id}</span>
            </label>
            <span class="frame-orient-tag">${oTag}</span>
          </div>

          <div class="frame-thumb-wrap">
            <img src="${p.thumb || p.src}" alt="${p.filename}" loading="lazy" onerror="if(this.src!=='${p.src}')this.src='${p.src}'" />
          </div>

          <div class="frame-body">
            <div class="frame-file-row">
              <span class="frame-filename" title="${p.filename}">${p.filename}</span>
              <span class="frame-dims">${p.width}×${p.height}</span>
            </div>
            ${
              p.title
                ? `<div class="frame-title-preview" title="${p.title}">“${p.title}”</div>`
                : ""
            }
            <div class="frame-quick-cats">
              ${quickCatsHtml}
            </div>
          </div>
        </article>`;
      })
      .join("");
  }

  function renderInspector() {
    const photo = state.photos.find((p) => p.filename === state.activeFilename);
    if (!photo) {
      el.inspectorEmpty.hidden = false;
      el.inspectorContent.hidden = true;
      return;
    }

    el.inspectorEmpty.hidden = true;
    el.inspectorContent.hidden = false;

    el.inspId.textContent = photo.id;
    el.inspFilename.textContent = photo.filename;
    el.inspImg.src = photo.src;
    el.inspDimsBadge.textContent = `${photo.width} × ${photo.height} PX`;
    el.inspRatioBadge.textContent = `RATIO ${photo.aspectRatio}:1`;
    el.inspOrientBadge.textContent = (photo.orientation || "landscape").toUpperCase();

    el.inpPosition.value = photo.index;
    el.inpPosition.max = state.photos.length;

    el.inspCatSelector.innerHTML = state.categories
      .map((cat) => {
        const active = photo.category === cat ? "active" : "";
        return `<button type="button" class="insp-cat-btn ${active}" data-insp-cat="${cat}">${cat}</button>`;
      })
      .join("");

    el.inpTitle.value = photo.title || "";
    el.inpFrame.value = photo.frame || "";
    el.inpOrientation.value = photo.orientation || "landscape";
    el.inpStock.value = photo.stock || "";
    el.inpLens.value = photo.lens || "";
    el.inpShutter.value = photo.shutter || "";
    el.inpIso.value = photo.iso || "";
    el.inspSrcPath.textContent = photo.src;
  }

  // ==========================================
  // MUTATIONS & ACTIONS
  // ==========================================
  function setPhotoCategory(filename, newCat) {
    const photo = state.photos.find((p) => p.filename === filename);
    if (!photo || photo.category === newCat) return;
    photo.category = newCat;
    markDirty();
    applyFilters();
    renderAll();
    showToast(`✓ Scatto ${photo.id} (${photo.filename}) → ${newCat}`);
  }

  function movePhotoToIndex(filename, targetOneBasedIndex) {
    const currentIdx = state.photos.findIndex((p) => p.filename === filename);
    if (currentIdx === -1) return;
    const clamped = Math.max(0, Math.min(state.photos.length - 1, targetOneBasedIndex - 1));
    if (currentIdx === clamped) return;

    const [item] = state.photos.splice(currentIdx, 1);
    state.photos.splice(clamped, 0, item);
    reindexPhotos();
    markDirty();
    applyFilters();
    renderAll();
    showToast(`Scatto ${filename} spostato in posizione #${clamped + 1}`);
  }

  function authHeaders() {
    const h = { "Content-Type": "application/json" };
    if (state.authToken) {
      h["Authorization"] = `Bearer ${state.authToken}`;
    }
    return h;
  }

  async function saveAllToServer() {
    reindexPhotos();
    const payload = {
      categories: state.categories,
      photos: state.photos,
    };

    try {
      localStorage.setItem(
        STORAGE_PREVIEW_KEY,
        JSON.stringify({ ...payload, updatedAt: Date.now() })
      );
    } catch (_) {}

    if (!state.online) {
      clearDirty();
      showToast("✓ Modifiche salvate in locale! (Avvia Avvia-Admin.command per scrivere su disco)", 4500);
      return;
    }

    try {
      el.btnSaveAll.disabled = true;
      el.btnSaveAll.innerHTML = "<span>⏳ SALVATAGGIO...</span>";
      const res = await fetch("/api/photos", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ data: payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (res.status === 401) {
          lockCmsUI();
          showToast("Sessione scaduta. Reinserisci la password.", 4000);
          return;
        }
        throw new Error(json.error || "Errore durante il salvataggio");
      }
      state.photos = json.data.photos;
      clearDirty();
      applyFilters();
      renderAll();
      showToast(`✓ ${json.message}`);
    } catch (err) {
      showToast(`Errore salvataggio: ${err.message}`, 4500);
    } finally {
      el.btnSaveAll.disabled = false;
      if (!state.dirty) {
        el.btnSaveAll.innerHTML = "<span>💾 SALVA ARCHIVIO</span>";
      }
    }
  }

  function downloadPhotosDataJs() {
    reindexPhotos();
    const header =
      `/**\n` +
      ` * NICOLA VIANELLO — PHOTOGRAPHIC ARCHIVE MANIFEST\n` +
      ` * Total Frames: ${state.photos.length}\n` +
      ` */\n` +
      `window.PHOTOS_CATEGORIES = ${JSON.stringify(state.categories)};\n` +
      `window.PHOTOS_MANIFEST = `;
    const content = header + JSON.stringify(state.photos, null, 2) + ";\n";
    const blob = new Blob([content], { type: "application/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "photos-data.js";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function rescanFolder() {
    if (!state.online) {
      showToast("Avvia il server Python ('Avvia-Admin.command') per scansionare la cartella FOTO/.");
      return;
    }
    try {
      el.btnRescan.disabled = true;
      showToast("Scansione della cartella FOTO/ in corso...");
      const res = await fetch("/api/rescan", { method: "POST", headers: authHeaders() });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (res.status === 401) {
          lockCmsUI();
          showToast("Sessione scaduta. Reinserisci la password.", 4000);
          return;
        }
        throw new Error(json.error || "Errore scansione");
      }
      state.photos = json.data.photos;
      state.categories = json.data.categories || state.categories;
      clearDirty();
      applyFilters();
      renderAll();
      showToast(`✓ ${json.message}`, 4500);
    } catch (err) {
      showToast(`Errore: ${err.message}`, 4500);
    } finally {
      el.btnRescan.disabled = false;
    }
  }

  async function syncWithGitHub() {
    if (state.dirty) {
      await saveAllToServer();
    }
    if (!state.online) {
      showToast("Avvia il server locale per sincronizzare con GitHub.");
      return;
    }
    try {
      el.btnGitSync.disabled = true;
      showToast("Pubblicazione su GitHub in corso...");
      const res = await fetch("/api/git-sync", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          message: `Aggiornamento archivio fotografico (${state.photos.length} scatti)`,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (res.status === 401) {
          lockCmsUI();
          showToast("Sessione scaduta. Reinserisci la password.", 4000);
          return;
        }
        throw new Error(json.error || "Errore Git");
      }
      showToast(`✓ ${json.message}`, 4500);
    } catch (err) {
      showToast(`Git Sync: ${err.message}`, 5000);
    } finally {
      el.btnGitSync.disabled = false;
    }
  }

  // ==========================================
  // UPLOAD MODAL & FILE PROCESSING
  // ==========================================
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function getImageDimensionsFromDataUrl(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 1800, height: img.naturalHeight || 1200 });
      img.onerror = () => resolve({ width: 1800, height: 1200 });
      img.src = dataUrl;
    });
  }

  async function enqueueUploadFiles(fileList) {
    const validFiles = Array.from(fileList).filter((f) =>
      /\.(jpe?g|png|webp)$/i.test(f.name)
    );
    if (!validFiles.length) {
      showToast("Seleziona file immagine validi (.JPG, .PNG, .WEBP)");
      return;
    }

    el.uploadStatusMsg.textContent = `Lettura di ${validFiles.length} file...`;
    for (const file of validFiles) {
      const dataUrl = await readFileAsDataUrl(file);
      const dims = await getImageDimensionsFromDataUrl(dataUrl);
      state.uploadQueue.push({
        filename: file.name,
        dataUrl,
        width: dims.width,
        height: dims.height,
      });
    }
    renderUploadQueue();
  }

  function renderUploadQueue() {
    el.uploadQueue.innerHTML = state.uploadQueue
      .map(
        (item, idx) => `<div class="queue-item">
          <img src="${item.dataUrl}" alt="${item.filename}" />
          <div class="queue-item-name" title="${item.filename}">${item.filename}</div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-family:var(--font-mono); font-size:9px; color:var(--text-silver);">
            <span>${item.width}×${item.height}</span>
            <button type="button" class="btn-link" data-remove-q="${idx}" style="color:#ff6b52;">Rimuovi</button>
          </div>
        </div>`
      )
      .join("");

    el.uploadStatusMsg.textContent = state.uploadQueue.length
      ? `${state.uploadQueue.length} scatti pronti per il caricamento`
      : "Nessun file in coda";
    el.btnStartUpload.disabled = state.uploadQueue.length === 0;
  }

  async function processUploadQueue() {
    if (!state.uploadQueue.length) return;
    const category = el.uploadCategorySelect.value || "SOGGETTI";
    const stock = el.uploadStockSelect.value || "";
    const prepend = el.uploadPositionSelect.value === "prepend";

    if (state.online) {
      try {
        el.btnStartUpload.disabled = true;
        el.uploadStatusMsg.textContent = "Caricamento e analisi sips in corso...";
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            files: state.uploadQueue,
            category,
            stock,
            prepend,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          if (res.status === 401) {
            lockCmsUI();
            showToast("Sessione scaduta. Reinserisci la password.", 4000);
            return;
          }
          throw new Error(json.error || "Errore upload");
        }

        state.photos = json.data.photos;
        if (json.created && json.created.length) {
          state.activeFilename = json.created[0].filename;
        }
        state.uploadQueue = [];
        el.uploadModal.hidden = true;
        clearDirty();
        applyFilters();
        renderAll();
        showToast(`✓ Caricati ${json.uploadedCount} nuovi scatti in FOTO/!`);
      } catch (err) {
        showToast(`Errore durante il caricamento: ${err.message}`, 4500);
      } finally {
        el.btnStartUpload.disabled = false;
      }
    } else {
      // Offline fallback: insert with DataURL preview
      const newItems = state.uploadQueue.map((item, i) => {
        const ratio = Number((item.width / item.height).toFixed(4));
        const orientation =
          ratio >= 1.65 ? "panoramic" : ratio >= 1.12 ? "landscape" : ratio <= 0.88 ? "portrait" : "square";
        return {
          index: i + 1,
          id: "#001",
          frame: "FRM // 001",
          filename: item.filename,
          src: item.dataUrl,
          title: "",
          width: item.width,
          height: item.height,
          aspectRatio: ratio,
          orientation,
          category,
          stock: stock || "KODAK TRI-X 400 // 35MM",
          lens: "35MM F/1.4",
          shutter: "1/500s",
          iso: "ISO 400",
          luminance: 0.5,
        };
      });
      state.photos = prepend ? [...newItems, ...state.photos] : [...state.photos, ...newItems];
      reindexPhotos();
      state.activeFilename = newItems[0].filename;
      state.uploadQueue = [];
      el.uploadModal.hidden = true;
      markDirty();
      applyFilters();
      renderAll();
      showToast(`Aggiunti ${newItems.length} scatti in memoria locale.`);
    }
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================
  function bindEvents() {
    // Search
    el.searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      applyFilters();
      renderAll();
    });

    el.btnClearSearch.addEventListener("click", () => {
      state.searchQuery = "";
      el.searchInput.value = "";
      applyFilters();
      renderAll();
    });

    // Category filter pills & delete category
    el.catFilterPills.addEventListener("click", (e) => {
      const delBtn = e.target.closest("[data-del-cat]");
      if (delBtn) {
        e.stopPropagation();
        const catToDelete = delBtn.dataset.delCat;
        const usedCount = state.photos.filter(p => p.category === catToDelete).length;
        const confirmMsg = usedCount > 0
          ? `La categoria '${catToDelete}' è usata da ${usedCount} scatti.\nEliminandola, questi scatti verranno spostati nella categoria 'ASTRATTO'. Continuare?`
          : `Vuoi eliminare la categoria '${catToDelete}'?`;
        
        if (confirm(confirmMsg)) {
          if (usedCount > 0) {
            state.photos.forEach(p => {
              if (p.category === catToDelete) p.category = "ASTRATTO";
            });
          }
          state.categories = state.categories.filter(c => c !== catToDelete);
          if (state.activeCategory === catToDelete) state.activeCategory = "ALL";
          markDirty();
          applyFilters();
          renderAll();
          showToast(`✓ Categoria '${catToDelete}' eliminata.`);
        }
        return;
      }

      const btn = e.target.closest("[data-cat]");
      if (!btn) return;
      state.activeCategory = btn.dataset.cat;
      applyFilters();
      renderAll();
    });

    // Add custom category
    el.btnAddCategory.addEventListener("click", () => {
      const name = prompt("Nome della nuova categoria (es. ARCHITETTURA, RITRATTI, ANALOG): Set in MAIUSCOLO:");
      if (!name) return;
      const clean = name.trim().toUpperCase();
      if (!clean) return;
      if (!state.categories.includes(clean)) {
        state.categories.push(clean);
        markDirty();
        renderAll();
        showToast(`Categoria '${clean}' aggiunta.`);
      }
    });

    // Orientation & Grid size
    el.orientationFilter.addEventListener("change", (e) => {
      state.activeOrientation = e.target.value;
      applyFilters();
      renderAll();
    });

    el.gridSizeSelect.addEventListener("change", (e) => {
      state.gridSize = e.target.value;
      renderContactSheetGrid();
    });

    // Select visible
    el.btnSelectVisible.addEventListener("click", () => {
      const allVisibleSelected =
        state.filteredPhotos.length > 0 &&
        state.filteredPhotos.every((p) => state.selectedFilenames.has(p.filename));

      if (allVisibleSelected) {
        state.filteredPhotos.forEach((p) => state.selectedFilenames.delete(p.filename));
      } else {
        state.filteredPhotos.forEach((p) => state.selectedFilenames.add(p.filename));
      }
      renderAll();
    });

    // Batch actions
    el.btnClearSelection.addEventListener("click", () => {
      state.selectedFilenames.clear();
      renderAll();
    });

    el.batchCatButtons.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-batch-cat]");
      if (!btn) return;
      const targetCat = btn.dataset.batchCat;
      let count = 0;
      state.photos.forEach((p) => {
        if (state.selectedFilenames.has(p.filename)) {
          p.category = targetCat;
          count++;
        }
      });
      markDirty();
      applyFilters();
      renderAll();
      showToast(`Categoria '${targetCat}' assegnata a ${count} scatti!`);
    });

    el.batchStockSelect.addEventListener("change", (e) => {
      const stock = e.target.value;
      if (!stock) return;
      let count = 0;
      state.photos.forEach((p) => {
        if (state.selectedFilenames.has(p.filename)) {
          p.stock = stock;
          count++;
        }
      });
      e.target.value = "";
      markDirty();
      renderAll();
      showToast(`Pellicola '${stock}' assegnata a ${count} scatti!`);
    });

    el.btnBatchMoveTop.addEventListener("click", () => {
      const selected = state.photos.filter((p) => state.selectedFilenames.has(p.filename));
      const unselected = state.photos.filter((p) => !state.selectedFilenames.has(p.filename));
      state.photos = [...selected, ...unselected];
      reindexPhotos();
      markDirty();
      applyFilters();
      renderAll();
      showToast(`${selected.length} scatti portati in cima al portfolio!`);
    });

    el.btnBatchDelete.addEventListener("click", () => {
      const count = state.selectedFilenames.size;
      if (!count) return;
      if (!confirm(`Vuoi rimuovere i ${count} scatti selezionati dall'archivio?`)) return;
      state.photos = state.photos.filter((p) => !state.selectedFilenames.has(p.filename));
      state.selectedFilenames.clear();
      reindexPhotos();
      markDirty();
      applyFilters();
      renderAll();
      showToast(`${count} scatti rimossi dall'archivio.`);
    });

    // Contact sheet grid clicks (card activation, checkbox toggle, 1-click quick category)
    el.grid.addEventListener("click", (e) => {
      const qcatBtn = e.target.closest("[data-qcat]");
      if (qcatBtn) {
        setPhotoCategory(qcatBtn.dataset.fn, qcatBtn.dataset.qcat);
        return;
      }

      const checkInp = e.target.closest("[data-check-fn]");
      if (checkInp) {
        const fn = checkInp.dataset.checkFn;
        if (checkInp.checked) {
          state.selectedFilenames.add(fn);
        } else {
          state.selectedFilenames.delete(fn);
        }
        renderStats();
        renderBatchBar();
        const card = checkInp.closest(".frame-card");
        if (card) card.classList.toggle("selected", checkInp.checked);
        return;
      }

      const card = e.target.closest(".frame-card");
      if (card) {
        state.activeFilename = card.dataset.filename;
        renderContactSheetGrid();
        renderInspector();
      }
    });

    // Inspector prev/next navigation
    function stepActivePhoto(delta) {
      if (!state.filteredPhotos.length) return;
      const idx = state.filteredPhotos.findIndex((p) => p.filename === state.activeFilename);
      const nextIdx = idx === -1 ? 0 : (idx + delta + state.filteredPhotos.length) % state.filteredPhotos.length;
      state.activeFilename = state.filteredPhotos[nextIdx].filename;
      renderContactSheetGrid();
      renderInspector();
      const activeEl = el.grid.querySelector(`.frame-card[data-filename="${state.activeFilename}"]`);
      if (activeEl) activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    el.btnPrevPhoto.addEventListener("click", () => stepActivePhoto(-1));
    el.btnNextPhoto.addEventListener("click", () => stepActivePhoto(1));

    // Inspector position controls
    el.btnApplyPos.addEventListener("click", () => {
      if (!state.activeFilename) return;
      const target = parseInt(el.inpPosition.value, 10);
      if (!isNaN(target)) movePhotoToIndex(state.activeFilename, target);
    });

    el.btnMoveFirst.addEventListener("click", () => {
      if (state.activeFilename) movePhotoToIndex(state.activeFilename, 1);
    });

    el.btnMoveLast.addEventListener("click", () => {
      if (state.activeFilename) movePhotoToIndex(state.activeFilename, state.photos.length);
    });

    el.btnMoveUp.addEventListener("click", () => {
      const p = state.photos.find((x) => x.filename === state.activeFilename);
      if (p && p.index > 1) movePhotoToIndex(p.filename, p.index - 1);
    });

    el.btnMoveDown.addEventListener("click", () => {
      const p = state.photos.find((x) => x.filename === state.activeFilename);
      if (p && p.index < state.photos.length) movePhotoToIndex(p.filename, p.index + 1);
    });

    // Inspector category buttons
    el.inspCatSelector.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-insp-cat]");
      if (!btn || !state.activeFilename) return;
      setPhotoCategory(state.activeFilename, btn.dataset.inspCat);
    });

    // Inspector metadata inputs
    function bindInspectorInput(inputEl, fieldName) {
      inputEl.addEventListener("input", () => {
        const photo = state.photos.find((p) => p.filename === state.activeFilename);
        if (!photo) return;
        photo[fieldName] = inputEl.value;
        markDirty();
        if (fieldName === "title" || fieldName === "orientation") {
          renderContactSheetGrid();
        }
      });
    }

    bindInspectorInput(el.inpTitle, "title");
    bindInspectorInput(el.inpFrame, "frame");
    bindInspectorInput(el.inpOrientation, "orientation");
    bindInspectorInput(el.inpStock, "stock");
    bindInspectorInput(el.inpLens, "lens");
    bindInspectorInput(el.inpShutter, "shutter");
    bindInspectorInput(el.inpIso, "iso");

    // Apply inspector changes button
    if (el.btnApplyInspector) {
      el.btnApplyInspector.addEventListener("click", () => {
        const photo = state.photos.find((p) => p.filename === state.activeFilename);
        if (!photo) return;
        photo.title = el.inpTitle.value.trim();
        photo.frame = el.inpFrame.value.trim();
        photo.orientation = el.inpOrientation.value;
        photo.stock = el.inpStock.value.trim();
        photo.lens = el.inpLens.value.trim();
        photo.shutter = el.inpShutter.value.trim();
        photo.iso = el.inpIso.value.trim();
        markDirty();
        applyFilters();
        renderAll();
        showToast(`✓ Modifiche applicate allo scatto ${photo.id}! Ricorda di cliccare "Salva Archivio" per rendere definitive.`);
      });
    }

    // Film Stock & Lens quick chips
    document.getElementById("preset-stocks").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-val]");
      if (!chip || !state.activeFilename) return;
      const photo = state.photos.find((p) => p.filename === state.activeFilename);
      if (!photo) return;
      photo.stock = chip.dataset.val;
      el.inpStock.value = photo.stock;
      markDirty();
    });

    document.getElementById("preset-lenses").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-lens]");
      if (!chip || !state.activeFilename) return;
      const photo = state.photos.find((p) => p.filename === state.activeFilename);
      if (!photo) return;
      photo.lens = chip.dataset.lens;
      el.inpLens.value = photo.lens;
      markDirty();
    });

    // Single photo file replacement
    el.inpReplaceFile.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file || !state.activeFilename) return;
      const photo = state.photos.find((p) => p.filename === state.activeFilename);
      if (!photo) return;

      const dataUrl = await readFileAsDataUrl(file);
      const dims = await getImageDimensionsFromDataUrl(dataUrl);

      if (state.online) {
        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              files: [{ filename: photo.filename, dataUrl, overwrite: true, category: photo.category }],
              prepend: false,
            }),
          });
          const json = await res.json();
          if (json.ok) {
            photo.width = dims.width;
            photo.height = dims.height;
            photo.aspectRatio = Number((dims.width / dims.height).toFixed(4));
            photo.src = `FOTO/${photo.filename}?t=${Date.now()}`;
            await saveAllToServer();
            showToast(`Immagine ${photo.filename} sostituita con successo!`);
          }
        } catch (err) {
          showToast(`Errore sostituzione: ${err.message}`);
        }
      } else {
        photo.src = dataUrl;
        photo.width = dims.width;
        photo.height = dims.height;
        markDirty();
        renderAll();
      }
      e.target.value = "";
    });

    // Single photo delete
    el.btnDeleteSingle.addEventListener("click", async () => {
      if (!state.activeFilename) return;
      const fn = state.activeFilename;
      if (!confirm(`Vuoi rimuovere lo scatto ${fn} dall'archivio?`)) return;

      if (state.online) {
        try {
          const res = await fetch("/api/delete-photo", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ filename: fn, deleteFile: true }),
          });
          const json = await res.json();
          if (res.status === 401) {
            lockCmsUI();
            showToast("Sessione scaduta. Reinserisci la password.", 4000);
            return;
          }
          if (json.ok) {
            state.photos = json.data.photos;
            state.activeFilename = state.photos[0] ? state.photos[0].filename : null;
            clearDirty();
            applyFilters();
            renderAll();
            showToast(`Scatto ${fn} spostato nel cestino di backup e rimosso.`);
            return;
          }
        } catch (_) {}
      }

      state.photos = state.photos.filter((p) => p.filename !== fn);
      state.activeFilename = state.photos[0] ? state.photos[0].filename : null;
      reindexPhotos();
      markDirty();
      applyFilters();
      renderAll();
      showToast(`Scatto ${fn} rimosso.`);
    });

    // Top bar buttons
    el.btnSaveAll.addEventListener("click", saveAllToServer);
    el.btnExportJs.addEventListener("click", downloadPhotosDataJs);
    el.btnRescan.addEventListener("click", rescanFolder);
    el.btnGitSync.addEventListener("click", syncWithGitHub);
    if (el.btnCmsLock) {
      el.btnCmsLock.addEventListener("click", () => {
        lockCmsUI();
        showToast("Sessione bloccata.");
        try {
          fetch("/api/logout", { method: "POST", headers: authHeaders() });
        } catch (_) {}
      });
    }

    // Password Gate submit events
    if (el.authForm) {
      el.authForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleLoginSubmit();
      });
    }
    if (el.btnAuthSubmit) {
      el.btnAuthSubmit.addEventListener("click", (e) => {
        e.preventDefault();
        handleLoginSubmit();
      });
    }

    // Upload modal
    el.btnOpenUpload.addEventListener("click", () => {
      state.uploadQueue = [];
      renderUploadQueue();
      el.uploadModal.hidden = false;
    });

    const closeUploadModal = () => {
      el.uploadModal.hidden = true;
    };
    el.btnCloseUpload.addEventListener("click", closeUploadModal);
    el.btnCancelUpload.addEventListener("click", closeUploadModal);

    el.uploadDropzone.addEventListener("click", () => el.uploadFileInput.click());
    el.uploadFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length) {
        enqueueUploadFiles(e.target.files);
      }
      e.target.value = "";
    });

    el.uploadDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.uploadDropzone.classList.add("dragover");
    });
    el.uploadDropzone.addEventListener("dragleave", () => {
      el.uploadDropzone.classList.remove("dragover");
    });
    el.uploadDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      el.uploadDropzone.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files) {
        enqueueUploadFiles(e.dataTransfer.files);
      }
    });

    el.uploadQueue.addEventListener("click", (e) => {
      const rmBtn = e.target.closest("[data-remove-q]");
      if (!rmBtn) return;
      const idx = parseInt(rmBtn.dataset.removeQ, 10);
      state.uploadQueue.splice(idx, 1);
      renderUploadQueue();
    });

    el.btnStartUpload.addEventListener("click", processUploadQueue);

    // Keyboard shortcuts: Cmd/Ctrl + S to save
    window.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveAllToServer();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
