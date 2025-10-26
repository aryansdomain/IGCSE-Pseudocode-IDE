export function initFontControls({
    editor,
    sizeInput,
    sizeValueEl,
    familySelect,
    min = 8,
    max = 48,
    step = 1,
    defaultSize = 14,
    defaultFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
    STORAGE_KEY = 'igcse_ide_editor_font',
} = {}) {

    // current values
    let size = defaultSize;
    let family = defaultFamily;

    // load preferences
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            if (typeof saved.size === 'number') size = clamp(saved.size, min, max);
            if (typeof saved.family === 'string') family = saved.family;
        }
    } catch {}

    // apply to the editor
    applySize(size);
    applyFamily(family);

    // configure font size slider
    if (sizeInput) {
        if (sizeInput.min !== undefined) sizeInput.min = String(min);
        if (sizeInput.max !== undefined) sizeInput.max = String(max);
        if (sizeInput.step !== undefined) sizeInput.step = String(step);
        sizeInput.value = String(size);
    }

    // update html display
    if (sizeValueEl) sizeValueEl.textContent = String(size);
    if (familySelect) familySelect.value = family;

    // listeners
    const onSizeChange = (e) => {
        const n = clamp(parseInt(e?.target?.value ?? sizeInput.value, 10) || defaultSize, min, max);
        setFontSize(n);
    };
    const onFamilyChange = (e) => setFontFamily(String(e.target.value || defaultFamily));

    sizeInput?.addEventListener('input', onSizeChange);
    sizeInput?.addEventListener('change', onSizeChange);
    familySelect?.addEventListener('change', onFamilyChange);

    // slider ticks
    const fontSizeTicks = document.querySelectorAll('#fontSizeSlider + .slider-ticks.font-ticks .tick');
    const tickClickHandlers = [];
    fontSizeTicks.forEach((tick) => {

        if (tick.textContent.trim()) {
            const handler = () => {
                const value = parseInt(tick.textContent);
                if (sizeInput) sizeInput.value = value;
                setFontSize(value);
            };
            tick.addEventListener('click', handler);
            tickClickHandlers.push({ tick, handler });
        }
    });

    let originalSize = size;
    let sizeChangeTimeout = null;

    function setFontSize(n) {
        const oldSize = size;

        size = clamp(Number(n) || defaultSize, min, max);
        applySize(size);
        persist();

        // update slider
        if (sizeInput) sizeInput.value = String(size);
        if (sizeValueEl) sizeValueEl.textContent = String(size);
        
        // track font size change analytics
        if (oldSize !== size) {
            if (sizeChangeTimeout) clearTimeout(sizeChangeTimeout); // clear existing timeout
            
            // set timeout to track after user stops dragging
            sizeChangeTimeout = setTimeout(() => {
                window.font_size_changed && window.font_size_changed({
                    font_size_changed_from: originalSize,
                    font_size_changed_to: size
                });
                
                originalSize = size;
                sizeChangeTimeout = null;
            }, 2000); // delay after user stops dragging
        }

        return size;
    }

    function setFontFamily(f) {
        const oldFamily = family;
        family = String(f || defaultFamily);
        applyFamily(family);
        persist();
        if (familySelect) familySelect.value = family;
        
        // track font family change analytics
        if (oldFamily !== family) {
            try {
                window.font_family_changed && window.font_family_changed({
                    font_family_changed_from: oldFamily,
                    font_family_changed_to: family
                });
            } catch {}
        }
        
        return family;
    }
    function getFont() {
        return { size, family };
    }

    // helpers
    function applySize(px) {
        editor.setFontSize(px);
    }
    function applyFamily(fam) {
        editor.setOptions({ fontFamily: fam });
        editor.container.style.fontFamily = fam;
        editor.renderer.updateFontSize();
        try { editor.resize(true); } catch {}
        document.documentElement.style.setProperty('--mono', fam);
    }
    function persist() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ size, family })); } catch {}
    }
    // ensure n stays between lo and hi
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

    return { setFontSize, setFontFamily, getFont };
}
