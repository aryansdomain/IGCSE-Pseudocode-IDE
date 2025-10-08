const KEY = 'ui.mode'; // localStorage key

export function isLightMode() { return document.documentElement.classList.contains('light'); }

export function initMode({
    themeCtrl,
    modeBtn,
    moonIcon,
    sunIcon,
    defaultMode = 'dark',
} = {}) {

    // store initial themeCtrl reference (changed later in script.js)
    let currentThemeCtrl = themeCtrl;

    function isLightMode() {
        return document.documentElement.classList.contains('light');
    }

    function setIcons() {
        const light = isLightMode();
        moonIcon.hidden = !light;  // in light mode, show moon
        sunIcon.hidden = light;    // in dark mode, show sun
        
        modeBtn.setAttribute('aria-pressed', String(light));
        modeBtn.title = light ? 'Switch to dark mode' : 'Switch to light mode';
    }

    function setMode(mode) {

        // disable transitions
        document.documentElement.classList.add('mode-switching');

        if (mode === 'light') document.documentElement.classList.add('light');
        else                  document.documentElement.classList.remove('light');

        if (currentThemeCtrl) {
            currentThemeCtrl.updateConsoleTheme();
            currentThemeCtrl.refreshEditorChrome();
        }
        
        // enable transitions
        setTimeout(() => document.documentElement.classList.remove('mode-switching'), 50);
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
