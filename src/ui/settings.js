export function initSettings({
    panelEl,
    openBtn,
    closeBtn,
    overlayEl = null,
    fontCtrl = null,
    spacingCtrl = null,
    themeCtrl = null,
    modeCtrl = null,
    editor = null,
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
    function open() {
        panelEl.style.display = 'flex';
        overlayEl?.classList.add('show');
        document.body.style.overflow = 'hidden';
        const first = panelEl.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex = \'-1\'])');
        first?.focus();
    }
    function close() {
        panelEl.style.display = 'none';
        overlayEl?.classList.remove('show');
        document.body.style.overflow = '';
        openBtn?.focus();
    }

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlayEl.addEventListener('click', (e) => {
        // only close if clicking on backdorp
        if (e.target === overlayEl) {
            close();
        }
    });

    // ------------------------ Controls ------------------------

    const $ = (sel) => sel ? panelEl.querySelector(sel) : null;
    const font_size    = $(selectors.fontSize);
    const font_family  = $(selectors.fontFamily);
    const tab_spaces   = $(selectors.tabSpaces);
    const soft_wrap    = $(selectors.softWrap);
    const read_only    = $(selectors.readOnly);
    const theme        = $(selectors.theme);
    const mode         = $(selectors.mode);

    // font size
    if (font_size) {
        const apply = (n) => {
            const size = Math.max(6, Math.min(72, parseInt(n, 10) || 14));
            if (fontCtrl?.setFontSize) fontCtrl.setFontSize(size); else editor?.setFontSize?.(size);
        };
        font_size.addEventListener('input', () => apply(font_size.value));
    }

    // font family
    if (font_family && fontCtrl?.setFontFamily) {
        font_family.addEventListener('change', () => fontCtrl.setFontFamily(font_family.value));
    }

    // tab spaces
    if (tab_spaces && spacingCtrl?.setTabSpaces) {
        tab_spaces.addEventListener('input', () => spacingCtrl.setTabSpaces(parseInt(tab_spaces.value, 10)));
    }

    // soft wrap / read-only
    soft_wrap?.addEventListener('change', () => editor?.setSoftWrap?.(!!soft_wrap.checked));
    read_only?.addEventListener('change', () => editor?.setReadOnly?.(!!read_only.checked));

    // editor theme
    if (theme) {
        // populate if empty
        if (!theme.options.length) {
            const allThemes = themeCtrl.lightThemes + themeCtrl.darkThemes;
            allThemes.array.forEach((name) => {
                const opt = document.createElement('option');
                opt.value = name; opt.textContent = name;
                theme.appendChild(opt);
            });
        }

        if (!themeCtrl) {
            theme.addEventListener('change', () => {
                const name = theme.value;
                editor?.setTheme?.(name);
            });
        }
    }

    // light/dark mode
    if (mode && modeCtrl?.setMode) {
        mode.addEventListener('change', () => modeCtrl.setMode(mode.value));
    }

    // reflect current values (best-effort)
    function refresh() {
        try {
            if (font_size && fontCtrl?.getFont) font_size.value = fontCtrl.getFont().size;
        } catch {}
        try {
            if (tab_spaces && spacingCtrl?.getTabSizeSpaces) tab_spaces.value = spacingCtrl.getTabSizeSpaces();
        } catch {}
    }
    refresh();

}
