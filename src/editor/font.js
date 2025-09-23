const KEY = 'editor.font';

export function initFontControls({
    editor,
    sizeInput,
    familySelect,
    min = 8,
    max = 48,
    step = 1,
    defaultSize = 14,
    defaultFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
    storageKey = KEY,
} = {}) {

    // current values
    let size = defaultSize;
    let family = defaultFamily;

    // load preferences
    try {
        const raw = localStorage.getItem(storageKey);
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
    const fontSizeValue = document.getElementById('fontSizeValue');
    fontSizeValue.textContent = String(size);
    familySelect.value = family;

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

    function setFontSize(n) {
        size = clamp(Number(n) || defaultSize, min, max);
        applySize(size);
        persist();
        if (sizeInput) sizeInput.value = String(size);

        // update html display
        const fontSizeValue = document.getElementById('fontSizeValue');
        if (fontSizeValue) fontSizeValue.textContent = String(size);
        return size;
    }
    function setFontFamily(f) {
        family = String(f || defaultFamily);
        applyFamily(family);
        persist();
        if (familySelect) familySelect.value = family;
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
        try {
            localStorage.setItem(storageKey, JSON.stringify({ size, family }));
        } catch {}
    }
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

    return { setFontSize, setFontFamily, getFont };
}
