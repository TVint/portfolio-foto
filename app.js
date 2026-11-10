/**
 * NICOLA VIANELLO — PHOTOGRAPHY MANIFESTO & ARCHIVE
 * app.js
 *
 * Architecture:
 * 1. Exact Aspect-Ratio Shortest-Column Masonry Engine (Zero Cumulative Layout Shift)
 * 2. GSAP Flip Density Controller ([ INDEX 8x ] / [ EDITORIAL 3x ] / [ EXHIBITION 2x ])
 * 3. Category Filtering with GSAP Transitions
 * 4. Tactile Micro-Glitch Hover (0.25s SVG feColorMatrix + feOffset RGB Split + Text-Scramble)
 * 5. Advanced IntersectionObserver + Lazy Image Reveal (clip-path + blur-to-sharp)
 * 6. Lenis Smooth Scroll + Subtle Elastic Velocity SkewY
 * 7. "Tavolo Luminoso" High-Res Lightbox Inspector (Keyboard Nav, Loupe Grain Zoom, Filmstrip)
 */

(function () {
  "use strict";

  const PHOTOS = Array.isArray(window.PHOTOS_MANIFEST) ? window.PHOTOS_MANIFEST : [];
  const TOTAL_COUNT = PHOTOS.length;

  // Register GSAP Plugins
  if (window.gsap && window.ScrollTrigger && window.Flip) {
    gsap.registerPlugin(ScrollTrigger, Flip);
  }

  // Application State
  const state = {
    density: "editorial", // 'index' (8x) | 'editorial' (3x) | 'exhibition' (2x)
    category: "ALL",
    filteredPhotos: [...PHOTOS],
    theme: localStorage.getItem("nv_manifesto_theme") || "gallery",
    lightboxOpen: false,
    lightboxIndex: 0, // index inside state.filteredPhotos
    zoomLevel: 1, // 1 | 2.4
    panX: 0,
    panY: 0,
  };

  // DOM References
  const dom = {
    html: document.documentElement,
    stage: document.getElementById("masonry-stage"),
    densityBtns: document.querySelectorAll(".density-btn"),
    filterBtns: document.querySelectorAll(".filter-chip"),
    darkroomToggle: document.getElementById("darkroom-toggle"),
    darkroomLabel: document.getElementById("darkroom-toggle-label"),
    hudScrollCounter: document.getElementById("hud-scroll-counter"),
    hudVelocity: document.getElementById("hud-velocity"),
    heroTotalCount: document.getElementById("hero-total-count"),
    editorialCountInline: document.getElementById("editorial-count-inline"),
    specActiveDensity: document.getElementById("spec-active-density"),
    specActiveCategory: document.getElementById("spec-active-category"),
    filterShowingStatus: document.getElementById("filter-showing-status"),
    backToTopBtn: document.getElementById("back-to-top-btn"),
    magneticTopInner: document.getElementById("magnetic-top-inner"),
    navBrandTop: document.getElementById("nav-brand-top"),

    // SVG Filter Offsets for Dynamic RGB Pulse
    rgbRedOffset: document.getElementById("rgb-red-offset"),
    rgbBlueOffset: document.getElementById("rgb-blue-offset"),

    // Lightbox DOM
    lightbox: document.getElementById("lightbox"),
    lbBackdrop: document.getElementById("lightbox-backdrop"),
    lbCounter: document.getElementById("lb-counter"),
    lbFrameCode: document.getElementById("lb-frame-code"),
    lbCategory: document.getElementById("lb-category"),
    lbFilename: document.getElementById("lb-filename"),
    lbDimensions: document.getElementById("lb-dimensions"),
    lbExif: document.getElementById("lb-exif"),
    lbZoomBtn: document.getElementById("lb-zoom-btn"),
    lbZoomLabel: document.getElementById("lb-zoom-label"),
    lbCloseBtn: document.getElementById("lb-close-btn"),
    lbPrevBtn: document.getElementById("lb-prev-btn"),
    lbNextBtn: document.getElementById("lb-next-btn"),
    lbViewport: document.getElementById("lb-viewport"),
    lbImg: document.getElementById("lb-img"),
    lbFilmstrip: document.getElementById("lb-filmstrip"),
  };

  // Persistent map of photo.id -> DOM card element so GSAP Flip can morph seamlessly
  // without destroying already-loaded <img> elements!
  const cardElementsMap = new Map();
  let imageObserver = null;
  let lenis = null;

  /* ==========================================================================
     1. INITIALIZATION
     ========================================================================== */
  function init() {
    applyTheme(state.theme);
    populateCategoryCounts();
    initIntersectionObserver();
    buildAllCardsOnce();
    renderMasonryColumns(false);
    initLenisSmoothScroll();
    bindEvents();
    buildFilmstrip();
  }

  /* ==========================================================================
     2. THEME CONTROLLER (GALLERY PAPER vs DARKROOM MODE)
     ========================================================================== */
  function applyTheme(theme) {
    state.theme = theme;
    dom.html.setAttribute("data-theme", theme);
    localStorage.setItem("nv_manifesto_theme", theme);
    const isDark = theme === "darkroom";
    if (dom.darkroomToggle) {
      dom.darkroomToggle.setAttribute("aria-pressed", String(isDark));
    }
    if (dom.darkroomLabel) {
      dom.darkroomLabel.textContent = isDark ? "DARKROOM // ON" : "DARKROOM // OFF";
    }
  }

  /* ==========================================================================
     3. POPULATE CATEGORY COUNTS & HERO METADATA
     ========================================================================== */
  function populateCategoryCounts() {
    const padTotal = String(TOTAL_COUNT).padStart(3, "0");
    if (dom.heroTotalCount) {
      dom.heroTotalCount.textContent = `[ ${padTotal} SELECTED FRAMES ]`;
    }
    if (dom.editorialCountInline) {
      dom.editorialCountInline.textContent = String(TOTAL_COUNT);
    }
    if (dom.hudScrollCounter) {
      dom.hudScrollCounter.textContent = `[ 001 / ${padTotal} ]`;
    }

    const counts = { ALL: TOTAL_COUNT };
    PHOTOS.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });

    document.querySelectorAll("[data-count-for]").forEach((el) => {
      const cat = el.getAttribute("data-count-for");
      el.textContent = String(counts[cat] || 0);
    });
  }

  /* ==========================================================================
     4. CREATE PHOTO CARD DOM ELEMENTS ONCE (ZERO CLS + CACHED NODES)
     ========================================================================== */
  function buildAllCardsOnce() {
    PHOTOS.forEach((photo) => {
      const article = document.createElement("article");
      article.className = "photo-card";
      article.dataset.id = photo.id;
      article.dataset.index = String(photo.index);
      article.dataset.category = photo.category;
      article.dataset.orientation = photo.orientation;

      // Exact aspect-ratio style prevents any Cumulative Layout Shift (CLS)
      const ratioStr = `${photo.width} / ${photo.height}`;

      article.innerHTML = `
        <div class="photo-card__top-bar">
          <span class="photo-card__frame-id" data-original-frame="${photo.frame}">${photo.frame}</span>
          <span class="photo-card__cat-tag">${photo.category}</span>
        </div>
        <div class="photo-card__media" style="aspect-ratio: ${ratioStr};">
          <div class="photo-card__placeholder">
            <span>${photo.id} // ${photo.width}×${photo.height}</span>
            <span>[ RAWNEGATIVE ]</span>
          </div>
          <img
            class="photo-card__img"
            data-src="${photo.thumb || photo.src}"
            data-full="${photo.src}"
            alt="Nicola Vianello — ${photo.frame} (${photo.category})"
            width="${photo.width}"
            height="${photo.height}"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div class="photo-card__bottom-bar">
          <span class="photo-card__exif">${photo.title ? `<strong style="color:var(--accent-red,#d9381e);margin-right:6px;">${photo.title}</strong> // ` : ""}${photo.lens} · ${photo.shutter} · ${photo.iso}</span>
          <span class="photo-card__ratio-badge">${photo.id}</span>
        </div>
      `;

      // Hover Interaction: 0.25s Chromatic Aberration RGB Split + Text-Scramble on Frame ID
      const frameLabel = article.querySelector(".photo-card__frame-id");
      article.addEventListener("mouseenter", () => {
        triggerMicroGlitch(article, frameLabel, photo.frame);
      });

      // Click Interaction: Open High-Res Lightbox ("Tavolo Luminoso")
      article.addEventListener("click", () => {
        const idxInFiltered = state.filteredPhotos.findIndex((item) => item.id === photo.id);
        if (idxInFiltered !== -1) {
          openLightbox(idxInFiltered);
        }
      });

      cardElementsMap.set(photo.id, article);
    });
  }

  /* ==========================================================================
     5. SHORTEST-COLUMN ASYMMETRIC MASONRY + GSAP FLIP DENSITY ENGINE
     ========================================================================== */
  function getColumnCountForDensity(density) {
    const w = window.innerWidth;
    if (density === "index") {
      if (w <= 780) return 4;
      if (w <= 1100) return 6;
      return 8;
    }
    if (density === "exhibition") {
      if (w <= 780) return 1;
      return 2;
    }
    // Default 'editorial' (3x)
    if (w <= 780) return 2;
    return 3;
  }

  function renderMasonryColumns(animateWithFlip = true) {
    const visibleCards = state.filteredPhotos
      .map((p) => cardElementsMap.get(p.id))
      .filter(Boolean);

    // Capture current positions for GSAP Flip if requested
    // For smooth 60fps performance on 188 items, we capture the stage & visible cards
    let flipState = null;
    if (animateWithFlip && window.Flip && visibleCards.length > 0) {
      // Limit Flip targets to cards currently near or in viewport if massive, or all visibleCards with simple scale/position
      flipState = Flip.getState(visibleCards, {
        simple: true,
      });
    }

    // Update stage density attribute
    dom.stage.setAttribute("data-density", state.density);

    const numCols = getColumnCountForDensity(state.density);
    const colContainers = [];
    const colHeights = new Array(numCols).fill(0);

    // Clear existing column wrappers while preserving cached card elements
    dom.stage.innerHTML = "";

    for (let c = 0; c < numCols; c++) {
      const col = document.createElement("div");
      col.className = "masonry-col";
      colContainers.push(col);
      dom.stage.appendChild(col);
    }

    // Distribute each photograph into the shortest column using its real aspect-ratio
    state.filteredPhotos.forEach((photo) => {
      const cardEl = cardElementsMap.get(photo.id);
      if (!cardEl) return;

      // Find shortest column index
      let shortestColIdx = 0;
      for (let i = 1; i < numCols; i++) {
        if (colHeights[i] < colHeights[shortestColIdx]) {
          shortestColIdx = i;
        }
      }

      colContainers[shortestColIdx].appendChild(cardEl);
      // Normalized height contribution = 1 / aspectRatio + small metadata bar height
      const normalizedHeight = 1 / (photo.aspectRatio || 1.5) + 0.14;
      colHeights[shortestColIdx] += normalizedHeight;

      // Observe card for lazy high-res loading
      if (imageObserver && !cardEl.dataset.observed) {
        imageObserver.observe(cardEl);
        cardEl.dataset.observed = "true";
      }
    });

    // Update status HUD counters
    const padShown = String(state.filteredPhotos.length).padStart(3, "0");
    const padTotal = String(TOTAL_COUNT).padStart(3, "0");
    if (dom.filterShowingStatus) {
      dom.filterShowingStatus.textContent = `SHOWING [ ${padShown} / ${padTotal} ]`;
    }

    // Execute GSAP Flip animation
    if (flipState && window.Flip) {
      Flip.from(flipState, {
        duration: 0.65,
        ease: "power3.inOut",
        stagger: {
          amount: 0.18,
          from: "start",
        },
        prune: true,
        onComplete: () => {
          if (window.ScrollTrigger) ScrollTrigger.refresh();
          if (lenis) lenis.resize();
        },
      });
    } else {
      if (window.ScrollTrigger) ScrollTrigger.refresh();
      if (lenis) lenis.resize();
    }
  }

  /* ==========================================================================
     6. INTERSECTION OBSERVER & PROGRESSIVE IMAGE REVEAL
     ========================================================================== */
  function initIntersectionObserver() {
    imageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const card = entry.target;
          const img = card.querySelector(".photo-card__img");
          if (img && img.dataset.src && !img.getAttribute("src")) {
            img.onload = () => {
              card.classList.add("is-loaded");
            };
            img.onerror = () => {
              // Retry with original full resolution if thumbnail fails
              if (img.dataset.full && img.src !== img.dataset.full) {
                img.src = img.dataset.full;
              } else {
                card.classList.add("is-loaded");
              }
            };
            img.setAttribute("src", img.dataset.src);
          } else if (img && img.complete) {
            card.classList.add("is-loaded");
          }
          imageObserver.unobserve(card);
        });
      },
      {
        root: null,
        rootMargin: "450px 0px 450px 0px",
        threshold: 0.01,
      }
    );
  }

  /* ==========================================================================
     7. MICRO-GLITCH (0.25s RGB SPLIT + TEXT SCRAMBLE ON HOVER)
     ========================================================================== */
  const SCRAMBLE_CHARS = "0123456789//#[]XRAW_F";

  function triggerMicroGlitch(cardEl, labelEl, originalText) {
    // 1. Apply 0.25s Chromatic Aberration / RGB Split pulse, then restore 100% sharpness
    cardEl.classList.add("is-glitching");
    clearTimeout(cardEl._glitchTimer);

    if (dom.rgbRedOffset && dom.rgbBlueOffset && window.gsap) {
      gsap.fromTo(
        dom.rgbRedOffset,
        { attr: { dx: -7, dy: 2 } },
        { attr: { dx: 0, dy: 0 }, duration: 0.25, ease: "steps(4)" }
      );
      gsap.fromTo(
        dom.rgbBlueOffset,
        { attr: { dx: 7, dy: -2 } },
        { attr: { dx: 0, dy: 0 }, duration: 0.25, ease: "steps(4)" }
      );
    }

    cardEl._glitchTimer = setTimeout(() => {
      cardEl.classList.remove("is-glitching");
    }, 250);

    // 2. Surgical Text-Scramble on Frame Counter (e.g. FRM // 042)
    if (!labelEl) return;
    clearInterval(labelEl._scrambleInterval);
    let step = 0;
    const maxSteps = 8;

    labelEl._scrambleInterval = setInterval(() => {
      step++;
      if (step >= maxSteps) {
        labelEl.textContent = originalText;
        clearInterval(labelEl._scrambleInterval);
        return;
      }
      labelEl.textContent = originalText
        .split("")
        .map((ch, idx) => {
          if (ch === " ") return " ";
          if (idx < (step / maxSteps) * originalText.length) return originalText[idx];
          return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        })
        .join("");
    }, 28);
  }

  /* ==========================================================================
     8. LENIS SMOOTH SCROLL + ELASTIC SKEW-Y INERTIA + LIVE HUD TELEMETRY
     ========================================================================== */
  function initLenisSmoothScroll() {
    if (typeof window.Lenis === "undefined") return;

    lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
    });

    const quickSkew = window.gsap
      ? gsap.quickSetter(dom.stage, "skewY", "deg")
      : null;

    lenis.on("scroll", (e) => {
      if (window.ScrollTrigger) ScrollTrigger.update();

      // Subtle elastic skewY proportional to scroll velocity (clamped to ±1.35deg)
      const vel = e.velocity || 0;
      const clampedSkew = Math.max(-1.35, Math.min(1.35, vel * 0.035));
      if (quickSkew) {
        quickSkew(clampedSkew);
      }

      // Update HUD Velocity & Current Frame Counter based on scroll progress
      if (dom.hudVelocity) {
        const absVel = Math.min(99.9, Math.abs(vel)).toFixed(1).padStart(4, "0");
        dom.hudVelocity.textContent = `VEL // ${absVel}`;
      }

      if (dom.hudScrollCounter && state.filteredPhotos.length > 0) {
        const progress = Math.max(0, Math.min(1, e.progress || 0));
        const currentFrameNum = Math.max(
          1,
          Math.min(
            state.filteredPhotos.length,
            Math.round(progress * (state.filteredPhotos.length - 1)) + 1
          )
        );
        const padCur = String(currentFrameNum).padStart(3, "0");
        const padTot = String(state.filteredPhotos.length).padStart(3, "0");
        dom.hudScrollCounter.textContent = `[ ${padCur} / ${padTot} ]`;
      }
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  /* ==========================================================================
     9. LIGHTBOX "TAVOLO LUMINOSO" (HIGH-RES INSPECTOR + LOUPE + FILMSTRIP)
     ========================================================================== */
  function buildFilmstrip() {
    if (!dom.lbFilmstrip) return;
    dom.lbFilmstrip.innerHTML = "";

    state.filteredPhotos.forEach((photo, idx) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "filmstrip-thumb";
      thumb.dataset.idx = String(idx);
      thumb.setAttribute("aria-label", `Vai al fotogramma ${photo.id}`);
      thumb.innerHTML = `
        <img src="${photo.thumb || photo.src}" alt="${photo.frame}" loading="lazy" decoding="async" />
        <span class="filmstrip-thumb__num">${String(photo.index).padStart(3, "0")}</span>
      `;
      thumb.addEventListener("click", (e) => {
        e.stopPropagation();
        updateLightboxSlide(idx);
      });
      dom.lbFilmstrip.appendChild(thumb);
    });
  }

  function openLightbox(indexInFiltered) {
    state.lightboxOpen = true;
    state.lightboxIndex = indexInFiltered;
    resetLoupeZoom();

    dom.lightbox.classList.add("is-open");
    dom.lightbox.setAttribute("aria-hidden", "false");
    if (lenis) lenis.stop();

    updateLightboxSlide(indexInFiltered);
  }

  function closeLightbox() {
    state.lightboxOpen = false;
    resetLoupeZoom();
    dom.lightbox.classList.remove("is-open");
    dom.lightbox.setAttribute("aria-hidden", "true");
    if (lenis) lenis.start();
  }

  function updateLightboxSlide(newIdx) {
    const total = state.filteredPhotos.length;
    if (total === 0) return;

    const wrappedIdx = ((newIdx % total) + total) % total;
    state.lightboxIndex = wrappedIdx;
    resetLoupeZoom();

    const photo = state.filteredPhotos[wrappedIdx];
    if (!photo) return;

    const padIdx = String(wrappedIdx + 1).padStart(3, "0");
    const padTot = String(total).padStart(3, "0");

    dom.lbCounter.textContent = `[ ${padIdx} / ${padTot} ]`;
    dom.lbFrameCode.textContent = photo.frame;
    dom.lbCategory.textContent = photo.category;
    dom.lbFilename.textContent = photo.title ? `${photo.title} — ${photo.filename}` : photo.filename;
    dom.lbDimensions.textContent = `${photo.width} × ${photo.height} PX`;
    dom.lbExif.textContent = `${photo.stock} · ${photo.lens} · ${photo.shutter} · ${photo.iso}`;

    if (window.gsap) {
      gsap.fromTo(
        dom.lbImg,
        { opacity: 0.25, scale: 0.985 },
        { opacity: 1, scale: 1, duration: 0.28, ease: "power2.out" }
      );
    }
    // Set active high-res or web-optimized display image with error fallback
    dom.lbImg.onerror = () => {
      if (dom.lbImg.src !== photo.src) {
        dom.lbImg.src = photo.src;
      }
    };
    // Load high-res preview image (smooth and instant)
    dom.lbImg.src = photo.thumb || photo.src;
    dom.lbImg.dataset.raw = photo.src;
    dom.lbImg.alt = `Nicola Vianello — ${photo.frame}`;

    // Highlight active thumbnail in filmstrip & center it smoothly
    const thumbs = dom.lbFilmstrip.querySelectorAll(".filmstrip-thumb");
    thumbs.forEach((t, i) => {
      const isCur = i === wrappedIdx;
      t.classList.toggle("is-current", isCur);
      if (isCur) {
        t.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    });
  }

  function toggleLoupeZoom(clientX, clientY) {
    if (state.zoomLevel > 1) {
      resetLoupeZoom();
    } else {
      state.zoomLevel = 2.4;
      dom.lbViewport.classList.add("is-zoomed");
      dom.lbZoomBtn.classList.add("is-active");
      dom.lbZoomLabel.textContent = "[ LOUPE 2.4x ]";
      // Switch to uncompressed RAW negative on zoom
      if (dom.lbImg.dataset.raw && dom.lbImg.src !== dom.lbImg.dataset.raw) {
        dom.lbImg.src = dom.lbImg.dataset.raw;
      }
      if (typeof clientX === "number" && typeof clientY === "number") {
        panLoupeToCursor(clientX, clientY);
      } else {
        dom.lbImg.style.transform = `scale(${state.zoomLevel})`;
      }
    }
  }

  function resetLoupeZoom() {
    state.zoomLevel = 1;
    state.panX = 0;
    state.panY = 0;
    if (dom.lbViewport) dom.lbViewport.classList.remove("is-zoomed");
    if (dom.lbZoomBtn) dom.lbZoomBtn.classList.remove("is-active");
    if (dom.lbZoomLabel) dom.lbZoomLabel.textContent = "[ LOUPE 1.0x ]";
    if (dom.lbImg) dom.lbImg.style.transform = "translate3d(0px, 0px, 0) scale(1)";
  }

  function panLoupeToCursor(clientX, clientY) {
    if (state.zoomLevel <= 1) return;
    const rect = dom.lbViewport.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width - 0.5; // -0.5 to +0.5
    const relY = (clientY - rect.top) / rect.height - 0.5;
    const maxPanX = rect.width * 0.45;
    const maxPanY = rect.height * 0.45;
    const tx = -relX * maxPanX;
    const ty = -relY * maxPanY;
    dom.lbImg.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${state.zoomLevel})`;
  }

  /* ==========================================================================
     10. EVENT LISTENERS (DENSITY, FILTERS, MAGNETIC BUTTON, KEYBOARD)
     ========================================================================== */
  function bindEvents() {
    // 1. Darkroom Switch
    if (dom.darkroomToggle) {
      dom.darkroomToggle.addEventListener("click", () => {
        const nextTheme = state.theme === "gallery" ? "darkroom" : "gallery";
        applyTheme(nextTheme);
      });
    }

    // 2. Density Slider Buttons ([ INDEX 8x ] / [ EDITORIAL 3x ] / [ EXHIBITION 2x ])
    dom.densityBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const newDensity = btn.dataset.density;
        if (!newDensity || newDensity === state.density) return;

        state.density = newDensity;
        dom.densityBtns.forEach((b) => b.classList.toggle("is-active", b === btn));

        const labels = {
          index: "INDEX 8X CONTACT SHEET",
          editorial: "EDITORIAL 3X MASONRY",
          exhibition: "EXHIBITION 2X MONUMENTAL",
        };
        if (dom.specActiveDensity) {
          dom.specActiveDensity.textContent = labels[newDensity] || "EDITORIAL 3X";
        }

        renderMasonryColumns(true);
      });
    });

    // 3. Category Filter Buttons
    dom.filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.dataset.category;
        if (!cat || cat === state.category) return;

        state.category = cat;
        dom.filterBtns.forEach((b) => {
          const active = b === btn;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-selected", String(active));
        });

        state.filteredPhotos =
          cat === "ALL" ? [...PHOTOS] : PHOTOS.filter((p) => p.category === cat);

        if (dom.specActiveCategory) {
          dom.specActiveCategory.textContent = cat === "ALL" ? "ALL FRAMES" : cat;
        }

        renderMasonryColumns(true);
        buildFilmstrip();
      });
    });

    // 4. Lightbox Controls
    if (dom.lbCloseBtn) dom.lbCloseBtn.addEventListener("click", closeLightbox);
    if (dom.lbBackdrop) dom.lbBackdrop.addEventListener("click", closeLightbox);
    if (dom.lbPrevBtn) {
      dom.lbPrevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        updateLightboxSlide(state.lightboxIndex - 1);
      });
    }
    if (dom.lbNextBtn) {
      dom.lbNextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        updateLightboxSlide(state.lightboxIndex + 1);
      });
    }
    if (dom.lbZoomBtn) {
      dom.lbZoomBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLoupeZoom();
      });
    }
    if (dom.lbViewport) {
      dom.lbViewport.addEventListener("click", (e) => {
        if (e.target === dom.lbViewport || e.target === dom.lbImg) {
          toggleLoupeZoom(e.clientX, e.clientY);
        }
      });
      dom.lbViewport.addEventListener("mousemove", (e) => {
        if (state.zoomLevel > 1) {
          panLoupeToCursor(e.clientX, e.clientY);
        }
      });
    }

    // 5. Keyboard Navigation for Lightbox (←, →, ESC, Z)
    window.addEventListener("keydown", (e) => {
      if (!state.lightboxOpen) return;
      if (e.key === "Escape") {
        closeLightbox();
      } else if (e.key === "ArrowRight") {
        updateLightboxSlide(state.lightboxIndex + 1);
      } else if (e.key === "ArrowLeft") {
        updateLightboxSlide(state.lightboxIndex - 1);
      } else if (e.key === "z" || e.key === "Z") {
        toggleLoupeZoom();
      }
    });

    // 6. Magnetic Back to Top [000] Button
    if (dom.backToTopBtn && dom.magneticTopInner) {
      dom.backToTopBtn.addEventListener("mousemove", (e) => {
        const rect = dom.backToTopBtn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        if (window.gsap) {
          gsap.to(dom.magneticTopInner, {
            x: x * 0.35,
            y: y * 0.35,
            duration: 0.25,
            ease: "power2.out",
          });
        }
      });

      dom.backToTopBtn.addEventListener("mouseleave", () => {
        if (window.gsap) {
          gsap.to(dom.magneticTopInner, {
            x: 0,
            y: 0,
            duration: 0.45,
            ease: "elastic.out(1, 0.4)",
          });
        }
      });

      dom.backToTopBtn.addEventListener("click", () => {
        if (lenis) {
          lenis.scrollTo(0, { duration: 1.4 });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }

    if (dom.navBrandTop) {
      dom.navBrandTop.addEventListener("click", (e) => {
        e.preventDefault();
        if (lenis) {
          lenis.scrollTo(0, { duration: 1.2 });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }

    // 7. Responsive Resize Debounce (recompute shortest columns on breakpoint changes)
    let lastColCount = getColumnCountForDensity(state.density);
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const newColCount = getColumnCountForDensity(state.density);
        if (newColCount !== lastColCount) {
          lastColCount = newColCount;
          renderMasonryColumns(false);
        }
      }, 180);
    });
  }

  // Boot when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
