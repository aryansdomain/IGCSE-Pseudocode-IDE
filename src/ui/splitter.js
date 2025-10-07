const KEY_PREFIX = 'ui.splitter:';

export function initSplitter({
    container,             // outer element containing paneA, handle, paneB
    handle,                // splitter handle
    paneA,                 // editor: top or left
    paneB,                 // console: bottom or right
    axis,                  // 'vertical' or 'horizontal'
    minA,                  // minimum height/width of A
    minB,                  // minimum height/width of B
    barHeight,             // normal bar height
    snapInPx,              // how close to an edge to snap in
    snapOutPx,             // how far to pull to snap out
    initialRatio,          // initial fraction of space A takes up (0..1)
    storageKey = 'main',   // save ratio across browser sessions
    onResize = () => {},   // called after layout updates (e.g., editor.resize(), refit())
} = {}) {

    // ------------------------ States/Config ------------------------
    const minBarHeight = snapInPx / 2;                      // minimum bar height before snapping
    const free = Math.max(0, totalSize() - handleSize());   // space for panelA and panelB
    let ratio = loadRatio(storageKey, initialRatio);        // amount of space A takes up, load from storage key 
    let dragStartMousePos = 0;                              // mouse/touch position when dragging starts
    let dragStartSizeA = 0;                                 // height/width of paneA when dragging starts
    let dragging = false;                                   // user is dragging the handle?
    let snapped = false;                                    // editor collapsed?

    // if user drags very fast, requestAnimationFrame (raf) IDs reduce lag
    let raf = 0;
    let consoleRaf = 0;

    // config handle
    handle.tabIndex = handle.tabIndex || 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', axis === 'vertical' ? 'horizontal' : 'vertical');

    applySizes(); // initial layout

    // ------------------------ Helpers ------------------------
    function loadRatio(key, fallback) {  // load ratio from localStorage
        try {
            const v = localStorage.getItem(KEY_PREFIX + key);
            const n = v == null ? NaN : Number(v);
            if (!Number.isFinite(n) || n <= 0 || n >= 1) return fallback;
            return n;
        } catch { return fallback; }
    }
    function saveRatio(key, r) {         // save ratio to localStorage
        try { localStorage.setItem(KEY_PREFIX + key, String(r)); } catch {}
    }

    function totalSize() {   // total size of container
        if (axis === 'vertical') return container.clientHeight;
        else                     return container.clientWidth;
    }
    function handleSize() {  // size of splitter handle
        if (axis === 'vertical') return handle.offsetHeight;
        else                     return handle.offsetWidth;
    }

    function applySizes() {
        const free = Math.max(0, totalSize() - handleSize()); // free space for both panels
        let sizeA = Math.round(free * ratio);
        let sizeB = Math.round(free * (1 - ratio)); // also equal to free - sizeA
        let newBarHeight = barHeight;

        // if total bar height is more than height of panel A (overflow), shrink bars
        if (axis === 'vertical' && sizeA < 2 * barHeight) {
            const maxBarHeight = Math.floor(sizeA / 2);
            newBarHeight = Math.max(minBarHeight, maxBarHeight);
        }

        paneA.style.setProperty('--topbar-h',    `${newBarHeight}px`);
        paneA.style.setProperty('--bottombar-h', `${newBarHeight}px`);
        paneA.style.setProperty('--bar-min',     `${minBarHeight}px`);

        // if size of any panel is less than the minimum, set it to minimum
        if (sizeA < minA) { sizeA = minA; sizeB = Math.max(minB, free - sizeA); }
        if (sizeB < minB) { sizeB = minB; sizeA = Math.max(minA, free - sizeB); }

        // recalculate ratio
        ratio = sizeA / free;

        // set size of both panels in css
        paneA.style.flex = `0 0 ${sizeA}px`;
        paneB.style.flex = `1 1 ${sizeB}px`;

        saveRatio(storageKey, ratio);
        onConsoleResizeSafe();
    }

    // ensure n stays between lo and hi
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

    // use requestAnimationFrame to prevent flickering
    function onResizeSafe() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => onResize());
    }
    function onConsoleResizeSafe() {
        cancelAnimationFrame(consoleRaf);
        consoleRaf = requestAnimationFrame(() => {
            if (!dragging) onResize(); // resize console when not actively dragging - stop flickering
        });
    }

    // ------------------------ Dragging ------------------------
    function startDrag(pointer) {
        if (dragging) return;
        pointer.preventDefault(); // override cursor default action

        dragging = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = axis === 'vertical' ? 'row-resize' : 'col-resize'; // cursor appearence

        const boundsA = paneA.getBoundingClientRect(); // info about pane A (width/height)
        dragStartMousePos = axis === 'vertical' ? pointer.clientY : pointer.clientX;
        dragStartSizeA    = axis === 'vertical' ? boundsA.height  : boundsA.width;

        handle.setPointerCapture?.(pointer.pointerId ?? undefined); // tell the handle the pointer ID

        snapped = dragStartSizeA <= snapInPx; // should we snap?
    }

    function moveDrag(pointer) {
        if (!dragging) return;
        pointer.preventDefault(); // override cursor default action

        const dragAmount = (axis === 'vertical'
                                ? pointer.clientY
                                : pointer.clientX) - dragStartMousePos; // positive = moved down
                                                                        // negative = moved up
        let newSizeA = dragStartSizeA + dragAmount;

        // snap in
        if (!snapped && newSizeA <= snapInPx) {
            newSizeA = 0;
            snapped = true;
        }

        // snap out
        if (snapped) {
            if (newSizeA > snapOutPx) snapped = false; // snap out
            else                      newSizeA = 0;    // keep snapped
        }
        
        ratio = newSizeA / Math.max(1, free);
        applySizes();
    }

    function endDrag(pointer) {
        if (!dragging) return;
        dragging = false;

        // reset
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        (pointer.target || handle).releasePointerCapture?.(pointer.pointerId ?? undefined);

        onResizeSafe();
    }

    // mouse/touch events
    handle.addEventListener('pointerdown', startDrag);
    window.addEventListener('pointermove', moveDrag);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // double-click handle to reset ratio
    handle.addEventListener('dblclick', () => { ratio = initialRatio; applySizes(); });

    // respond to window resize
    window.addEventListener('resize', applySizes);

    // initial layout
    applySizes();

    return {
        setRatio(r) { 
            const minRatio = minA / Math.max(1, free);
            const maxRatio = minB / Math.max(1, free);
            ratio = clamp(Number(r) || initialRatio, minRatio, maxRatio); 
            applySizes(); 
        },
        getRatio()  { return ratio; },
        collapseA() { 
            const minRatio = minA / Math.max(1, free);
            ratio = minRatio; 
            applySizes(); 
        },
        collapseB() { 
            const maxRatio = (free - minB) / Math.max(1, free);
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
            window.removeEventListener('resize', applySizes);
            cancelAnimationFrame(raf);
            cancelAnimationFrame(consoleRaf);
        }
    };
}
