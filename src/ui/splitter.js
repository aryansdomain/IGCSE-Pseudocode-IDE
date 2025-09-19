const KEY_PREFIX = 'ui.splitter:';

export function initSplitter({
    container,         // outer element containing paneA, handle, paneB
    handle,
    paneA,             // top of left
    paneB,             // bottom or right
    axis,              // 'vertical' = A top, B bottom, 'horizontal' = A left, B right
    minA,              // height/width of A in px
    minB,              // height/width of B in px
    normal_top,        // height of topbar
    normal_bottom,     // height of bottombar
    initialRatio,      // initial fraction of space A takes up (0..1)
    storageKey = 'main',
    onResize = () => {},   // called after layout updates (e.g., editor.resize(), refit())
} = {}) {
    if (!container || !handle || !paneA || !paneB) {
        throw new Error('initSplitter: container, handle, paneA, paneB are required');
    }

    // ---- state ----
    let dragging = false;
    let ratio = loadRatio(storageKey, initialRatio);
    let dragStartCoord = 0;   // clientY/clientX at pointerdown
    let dragStartSizeA = 0;   // px height/width of paneA at pointerdown
    let raf = 0;
    let terminalRaf = 0;

    // --- snap state + thresholds ---
    let snapped = false; // editor collapsed

    // How close to an edge to snap in/out (px)
    const SNAP_IN_PX  = 35;
    const SNAP_OUT_PX = 50;
    const MIN_BAR_HEIGHT = SNAP_IN_PX/2;

    paneA.style.minHeight = '0'; paneA.style.minWidth  = '0'; paneA.style.overflow  = 'hidden';
    paneB.style.minHeight = '0'; paneB.style.minWidth  = '0'; paneB.style.overflow  = 'hidden';
    applySizes();

    // ---- helpers ----
    function loadRatio(key, fallback) {
        try {
            const v = localStorage.getItem(KEY_PREFIX + key);
            const n = v == null ? NaN : Number(v);
            if (!Number.isFinite(n) || n <= 0 || n >= 1) return fallback;
            return n;
        } catch { return fallback; }
    }
    function saveRatio(key, r) {
        try { localStorage.setItem(KEY_PREFIX + key, String(r)); } catch {}
    }

    function totalSize() {
        return axis === 'vertical' ? container.clientHeight : container.clientWidth;
    }

    function applySizes() {
        const topbarEl = paneA.querySelector('.topbar');
        const bottombarEl = paneA.querySelector('.bottombar');
        const desiredBarHeight = normal_top + normal_bottom;
        let topH = normal_top;
        let bottomH = normal_bottom;

        const total = totalSize();
        const hSize = handleSize();
        const free = Math.max(0, total - hSize);

        let sizeA = Math.round(free * ratio);
        let sizeB = free - sizeA;

        if (sizeA < desiredBarHeight) {
            // Proportional shrink keeps lock-step behavior
            const scale = sizeA / desiredBarHeight;            // 0..1
            topH    = Math.max(MIN_BAR_HEIGHT, Math.round(normal_top    * scale));
            bottomH = Math.max(MIN_BAR_HEIGHT, Math.round(normal_bottom * scale));

            // If mins caused over-allocation, distribute overflow proportionally
            let barsSum  = topH + bottomH;
            if (barsSum > sizeA) {
                let overflow = barsSum - sizeA;
                const adjTop = Math.max(0, topH    - MIN_BAR_HEIGHT);
                const adjBot = Math.max(0, bottomH - MIN_BAR_HEIGHT);
                const totalAdj = adjTop + adjBot;
                if (totalAdj > 0) {
                    const cutTop = Math.round(overflow * (adjTop / totalAdj));
                    const cutBot = overflow - cutTop;
                    topH    = Math.max(MIN_BAR_HEIGHT, topH    - cutTop);
                    bottomH = Math.max(MIN_BAR_HEIGHT, bottomH - cutBot);
                }
            }
        }

        paneA.style.setProperty('--topbar-h', `${topH}px`);
        paneA.style.setProperty('--bottombar-h', `${bottomH}px`);
        paneA.style.setProperty('--bar-min', `${MIN_BAR_HEIGHT}px`);

        // minimums
        if (sizeA < minA) { sizeA = minA; sizeB = Math.max(minB, free - sizeA); }
        if (sizeB < minB) { sizeB = minB; sizeA = Math.max(minA, free - sizeB); }

        ratio = sizeA / Math.max(1, free);

        paneA.style.flex = `0 0 ${sizeA}px`;
        paneB.style.flex = `1 1 ${sizeB}px`;

        if (axis === 'vertical') {
            paneA.style.height = paneB.style.height = ''; // let flex control height
        } else {
            paneA.style.width = paneB.style.width = '';   // let flex control width
        }

        saveRatio(storageKey, ratio);
        onTerminalResizeSafe();
    }

    function handleSize() {
        return axis === 'vertical' ? handle.offsetHeight : handle.offsetWidth;
    }
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

    function onResizeSafe() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => onResize());
    }

    function onTerminalResizeSafe() {
        cancelAnimationFrame(terminalRaf);
        terminalRaf = requestAnimationFrame(() => {
            // Only resize terminal when not actively dragging to prevent flickering
            if (!dragging) {
                onResize();
            }
        });
    }

    // ---- dragging ----
    function startDrag(ev) {
        ev.preventDefault();
        dragging = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = axis === 'vertical' ? 'row-resize' : 'col-resize';
        // Baseline: pointer position and current size of pane A
        dragStartCoord = axis === 'vertical' ? ev.clientY : ev.clientX;
        const pr = paneA.getBoundingClientRect();
        dragStartSizeA = axis === 'vertical' ? pr.height : pr.width;

        (ev.target || handle).setPointerCapture?.(ev.pointerId ?? undefined);
        // Initialize snapped state from current geometry
        const free = Math.max(0, totalSize() - handleSize());
        const sizeApxNow = axis === 'vertical' ? pr.height : pr.width;
        snapped = sizeApxNow <= SNAP_IN_PX;
    }
    function moveDrag(ev) {
        if (!dragging) return;
        ev.preventDefault();
        const free = Math.max(0, totalSize() - handleSize()); // match applySizes()
        const delta = (axis === 'vertical' ? ev.clientY : ev.clientX) - dragStartCoord;
        // desired size for pane A = start size + pointer delta

        let sizeApx = dragStartSizeA + delta;
        // --- SNAP LOGIC (edge-based, fast-drag friendly) ---
        // Snap-in near top
        if (!snapped && sizeApx <= SNAP_IN_PX) {
            sizeApx = 0;
            snapped = true;
        }
        // Snap-out when user pulls away past hysteresis
        if (snapped) {
            if (sizeApx > SNAP_OUT_PX) {
                snapped = false; // release
            } else {
                sizeApx = 0;      // keep snapped
            }
        }
        
        ratio = sizeApx / Math.max(1, free);
        
        // Check if bars are at minimum height and snap to top position
        const topbarEl = paneA.querySelector('.topbar');
        const bottombarEl = paneA.querySelector('.bottombar');
        if (topbarEl && bottombarEl) {
            const topbarHeight = topbarEl.offsetHeight;
            const bottombarHeight = bottombarEl.offsetHeight;
            
            // snap to top position
            if (topbarHeight <= MIN_BAR_HEIGHT && bottombarHeight <= MIN_BAR_HEIGHT) {
                // If trying to drag up (make editor smaller), snap to absolute minimum
                if (delta < 0) {
                    sizeApx = 0;
                }
            }
        }
        
        ratio = sizeApx / Math.max(1, free);
        applySizes();
    }
    function endDrag(ev) {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        (ev.target || handle).releasePointerCapture?.(ev.pointerId ?? undefined);
        // Resize terminal after dragging ends
        onResizeSafe();
    }

    // pointer events (mouse + touch)
    handle.addEventListener('pointerdown', startDrag);
    window.addEventListener('pointermove', moveDrag);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // keyboard accessibility
    handle.tabIndex = handle.tabIndex || 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', axis === 'vertical' ? 'horizontal' : 'vertical'); // separator's direction

    // double-click handle to reset
    handle.addEventListener('dblclick', () => { ratio = initialRatio; applySizes(); });

    // respond to window resize
    const onWin = () => applySizes();
    window.addEventListener('resize', onWin);

    // initial layout
    applySizes();

    // ---- public API ----
    return {
        setRatio(r) { 
            const total = totalSize();
            const free = Math.max(0, total - handleSize());
            const minRatio = minA === 0 ? 0 : minA / Math.max(1, free);
            const maxRatio = minB === 0 ? 1 : (free - minB) / Math.max(1, free);
            ratio = clamp(Number(r) || initialRatio, minRatio, maxRatio); 
            applySizes(); 
        },
        getRatio()  { return ratio; },
        collapseA() { 
            const total = totalSize();
            const free = Math.max(0, total - handleSize());
            const minRatio = minA === 0 ? 0 : minA / Math.max(1, free);
            ratio = minRatio; 
            applySizes(); 
        },
        collapseB() { 
            const total = totalSize();
            const free = Math.max(0, total - handleSize());
            const maxRatio = minB === 0 ? 1 : (free - minB) / Math.max(1, free);
            ratio = maxRatio; 
            applySizes(); 
        },
        expandA()   { ratio = 0.85; applySizes(); },
        expandB()   { ratio = 0.15; applySizes(); },
        reset()     { ratio = initialRatio; applySizes(); },
        destroy() {
            handle.removeEventListener('pointerdown', startDrag);
            window.removeEventListener('pointermove', moveDrag);
            window.removeEventListener('pointerup', endDrag);
            window.removeEventListener('pointercancel', endDrag);
            window.removeEventListener('resize', onWin);
            cancelAnimationFrame(raf);
            cancelAnimationFrame(terminalRaf);
        }
    };
}
