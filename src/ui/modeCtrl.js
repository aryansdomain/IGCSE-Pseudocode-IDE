const KEY = 'ui.mode'; // localStorage key

export function isLightMode() { return document.documentElement.classList.contains('light'); }

export function initMode({
    themeCtrl = null,
    modeBtn,
    defaultMode = 'dark',
    page = 'ide',
} = {}) {

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

    function setMode(mode) {
        currentMode = mode;

        // disable transitions
        document.documentElement.classList.add('mode-switching');

        if (mode === 'light') document.documentElement.classList.add('light');
        else                  document.documentElement.classList.remove('light');

        if (currentThemeCtrl) currentThemeCtrl.updateConsoleTheme();
        
        // enable transitions
        setTimeout(() => document.documentElement.classList.remove('mode-switching'), 50);

        // track mode change analytics
        try {
            window.mode_toggled && window.mode_toggled({
                to: mode,
                page: page
            });
        } catch {}
    }

    // init mode and apply
    let initial = null;
    try { initial = localStorage.getItem(KEY); } catch {}
    if (!initial) {
        const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)')?.matches;
        initial = prefersLight ? 'light' : defaultMode;
    }

    setMode(initial);
    setIcons();

    // click button to toggle mode
    const onClick = () => {
        const next = isLightMode() ? 'dark' : 'light';
        setMode(next);
        try { localStorage.setItem(KEY, next); } catch {}
        setIcons();
    };
    modeBtn.addEventListener('click', onClick);

    // if OS changes
    const mql = window.matchMedia?.('(prefers-color-scheme: light)');
    const onPref = (e) => {
        let saved = null;
        try { saved = localStorage.getItem(KEY); } catch {}
        if (saved) return;
        setMode(e.matches ? 'light' : 'dark');
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
