export function isLightMode() { return document.documentElement.classList.contains('light'); }

export function initMode({
    themeCtrl = null,
    modeBtn,
    defaultMode = 'dark',
    page = 'ide',
} = {}) {

    const STORAGE_KEY = 'igcse_ide_mode';

    let currentThemeCtrl = themeCtrl;
    let currentMode = null;

    function isLightMode() {
        return document.documentElement.classList.contains('light');
    }

    function setIcons() {
        const light = isLightMode();
        
        const icon = modeBtn.querySelector('i');
        if (icon) icon.className = light ? 'fas fa-moon' : 'fas fa-sun';
        
        modeBtn.setAttribute('aria-pressed', String(light));
        modeBtn.title = light ? 'Switch to dark mode' : 'Switch to light mode';
    }

    function setMode(mode, skipAnalytics = false) {
        currentMode = mode;

        // disable transitions
        document.documentElement.classList.add('mode-switching');

        if (mode === 'light') document.documentElement.classList.add('light');
        else                  document.documentElement.classList.remove('light');
        
        // update console theme 
        if (currentThemeCtrl?.updateConsoleTheme) currentThemeCtrl.updateConsoleTheme();
        
        // update other elements
        setTimeout(() => { if (currentThemeCtrl?.updateElements) currentThemeCtrl.updateElements(); }, 100);
        
        // enable transitions
        setTimeout(() => document.documentElement.classList.remove('mode-switching'), 50);

        // track mode change analytics
        if (!skipAnalytics) {
            try {
                window.mode_toggled && window.mode_toggled({
                    mode_toggled_to: mode,
                    mode_toggled_page: page
                });
            } catch {}
        }
    }

    // init mode and apply
    let initial = null;
    try { initial = localStorage.getItem(STORAGE_KEY); } catch {}
    if (!initial) {
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
        initial = prefersDark ? 'dark' : defaultMode;
    }

    setMode(initial, true); // skip analytics during initialization
    setIcons();

    // click button to toggle mode
    const onClick = () => {
        const next = isLightMode() ? 'dark' : 'light';
        setMode(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch {}
        setIcons();
    };
    modeBtn.addEventListener('click', onClick);

    // if OS changes
    const mql = window.matchMedia?.('(prefers-color-scheme: light)');
    const onPref = (e) => {
        let saved = null;
        try { saved = localStorage.getItem(STORAGE_KEY); } catch {}
        if (saved) return;
        setMode(e.matches ? 'dark' : 'light');
        setIcons();
    };
    mql?.addEventListener?.('change', onPref);

    return {
        setMode,
        isLightMode,
        setThemeCtrl(themeCtrl) {
            currentThemeCtrl = themeCtrl;
        },
    };
}
