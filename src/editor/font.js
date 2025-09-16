const KEY = 'editor.font';

export function initFontControls({
    editor,
    sizeInput,           // <input type="number" or range>
    familySelect,        // <select>
    incBtn = null,       // optional: button to increase size
    decBtn = null,       // optional: button to decrease size
    min = 8,
    max = 48,
    step = 1,
    defaultSize = 14,
    defaultFamily = '"SF Mono", Menlo, Monaco, Consolas, monospace',
    storageKey = KEY,
} = {}) {
    if (!editor) throw new Error('initFontControls: editor is required');

    // --- state ---
    let size = defaultSize;
    let family = defaultFamily;

    // --- load persisted prefs ---
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.size === 'number') size = clamp(saved.size, min, max);
        if (typeof saved.family === 'string') family = saved.family;
        }
    } catch {}

    // --- apply to Ace ---
    applySize(size);
    applyFamily(family);

    // --- hydrate UI (if provided) ---
    if (sizeInput) {
        if (sizeInput.min !== undefined) sizeInput.min = String(min);
        if (sizeInput.max !== undefined) sizeInput.max = String(max);
        if (sizeInput.step !== undefined) sizeInput.step = String(step);
        sizeInput.value = String(size);
    }
    if (familySelect) {
        // If options are empty, populate a sensible macOS-first list once.
        if (!familySelect.options.length) {
        [
            { label: 'SF Mono (System)', value: '"SF Mono", Menlo, Monaco, Consolas, monospace' },
            { label: 'Menlo',           value: 'Menlo, Monaco, Consolas, monospace' },
            { label: 'Monaco',          value: 'Monaco, Menlo, Consolas, monospace' },
            { label: 'JetBrains Mono',  value: '"JetBrains Mono", Menlo, Monaco, Consolas, monospace' },
            { label: 'Fira Code',       value: '"Fira Code", Menlo, Monaco, Consolas, monospace' },
            { label: 'Consolas',        value: 'Consolas, Menlo, Monaco, monospace' },
        ].forEach(({ label, value }) => {
            const opt = document.createElement('option');
            opt.textContent = label; opt.value = value;
            familySelect.appendChild(opt);
        });
        }
        familySelect.value = family;
    }

    // --- listeners ---
    const onSizeChange = (e) => {
        const n = clamp(parseInt(e?.target?.value ?? sizeInput.value, 10) || defaultSize, min, max);
        setFontSize(n);
    };
    const onInc = () => setFontSize(clamp(size + step, min, max));
    const onDec = () => setFontSize(clamp(size - step, min, max));
    const onFamilyChange = (e) => setFontFamily(String(e.target.value || defaultFamily));

    sizeInput?.addEventListener('input', onSizeChange);
    sizeInput?.addEventListener('change', onSizeChange);
    incBtn?.addEventListener('click', onInc);
    decBtn?.addEventListener('click', onDec);
    familySelect?.addEventListener('change', onFamilyChange);

    // --- API ---
    function setFontSize(n) {
        size = clamp(Number(n) || defaultSize, min, max);
        applySize(size);
        persist();
        if (sizeInput) sizeInput.value = String(size);
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
    function destroy() {
        sizeInput?.removeEventListener('input', onSizeChange);
        sizeInput?.removeEventListener('change', onSizeChange);
        incBtn?.removeEventListener('click', onInc);
        decBtn?.removeEventListener('click', onDec);
        familySelect?.removeEventListener('change', onFamilyChange);
    }

    // HELPERS
    function applySize(px) {
        editor.setFontSize(px);
    }
    function applyFamily(fam) {
        editor.container.style.fontFamily = fam;
        editor.renderer.updateFontSize();
    }
    function persist() {
        try { localStorage.setItem(storageKey, JSON.stringify({ size, family })); } catch {}
    }
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

    return { setFontSize, setFontFamily, getFont, destroy };
}
