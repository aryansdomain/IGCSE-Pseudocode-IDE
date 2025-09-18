export function initSettings({
    panelEl,
    openBtn,
    closeBtn,
    overlayEl = null,
    fontCtrl = null,
    spacingCtrl = null,
    themeCtrl = null,
    editorApis = null,
    selectors = {
        fontSize:   '#font-size',
        fontFamily: '#font-family',
        tabSpaces:  '#tabSpacesSlider',
        softWrap:   '#softWrap',
        readOnly:   '#readOnly',
        theme:      '#editorThemeSelect',
        mode:       '#modeSelect'
    }
} = {}) {
    if (!panelEl || !openBtn) throw new Error('initSettings: panelEl and openBtn are required');

    // ----- open/close/toggle + accessibility -----
    const focusables = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

    function isOpen() { return panelEl.style.display !== 'none'; }
    function open() {
        panelEl.style.display = 'flex';
        overlayEl?.classList.add('show');
        document.body.style.overflow = 'hidden';
        const first = panelEl.querySelector(focusables);
        first?.focus();
    }
    function close() {
        panelEl.style.display = 'none';
        overlayEl?.classList.remove('show');
        document.body.style.overflow = '';
        openBtn?.focus();
    }
    function toggle() { isOpen() ? close() : open(); }

    openBtn.addEventListener('click', open);
    closeBtn?.addEventListener('click', close);
    overlayEl?.addEventListener('click', (e) => {
        // only close if clicking on backdorp
        if (e.target === overlayEl) {
            close();
        }
    });

    // Esc to close; Cmd/Ctrl+, to open
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close(); }
    });

    // ----- controls -----
    const $ = (sel) => sel ? panelEl.querySelector(sel) : null;
    const fs = $(selectors.fontSize);
    const ff = $(selectors.fontFamily);
    const ts = $(selectors.tabSpaces);
    const sw = $(selectors.softWrap);
    const ro = $(selectors.readOnly);
    const th = $(selectors.theme);
    const md = $(selectors.mode);

    // font size
    if (fs) {
        const apply = (n) => {
            const v = Math.max(6, Math.min(72, parseInt(n, 10) || 14));
            if (fontCtrl?.setFontSize) fontCtrl.setFontSize(v); else editorApis?.setFontSize?.(v);
        };
        fs.addEventListener('input', () => apply(fs.value));
    }

    // font family
    if (ff && fontCtrl?.setFontFamily) {
        ff.addEventListener('change', () => fontCtrl.setFontFamily(ff.value));
    }

    // tab spaces
    if (ts && spacingCtrl?.setTabSpaces) {
        ts.addEventListener('input', () => spacingCtrl.setTabSpaces(parseInt(ts.value, 10)));
    }

    // soft wrap / read-only
    sw?.addEventListener('change', () => editorApis?.setSoftWrap?.(!!sw.checked));
    ro?.addEventListener('change', () => editorApis?.setReadOnly?.(!!ro.checked));

    // editor theme
    if (th) {
        // populate if empty and themeCtrl exposes a list
        if (!th.options.length && themeCtrl?.listThemes) {
            themeCtrl.listThemes().forEach((name) => {
                const opt = document.createElement('option');
                opt.value = name; opt.textContent = name;
                th.appendChild(opt);
            });
        }
        
        if (!themeCtrl) {
            th.addEventListener('change', () => {
                const name = th.value;
                editorApis?.setTheme?.(name);
            });
        }
    }

    // light/dark mode
    if (md && themeCtrl?.setMode) {
        md.addEventListener('change', () => themeCtrl.setMode(md.value)); // 'light' | 'dark'
    }

    // reflect current values (best-effort)
    function refresh() {
        try {
            if (fs && fontCtrl?.getFont) fs.value = fontCtrl.getFont().size;
        } catch {}
        try {
            if (ts && spacingCtrl?.getTabSpaces) ts.value = spacingCtrl.getTabSpaces();
        } catch {}
    }
    refresh();

    return { open, close, toggle, refresh };
}
