const KEY = 'ui.mode'; // localStorage key

export function initMode({
    themeCtrl,
    button,
    moonIcon = null,
    sunIcon  = null,
    defaultMode = 'dark',
} = {}) {

    const isLight = () => document.documentElement.classList.contains('light');
    const setIcons = () => {
        const light = isLight();

        moonIcon.hidden = !light;  // in light mode, show moon
        sunIcon.hidden  = light;   // in dark mode, show sun
        
        button.setAttribute('aria-pressed', String(light));
        button.title = light ? 'Switch to dark mode' : 'Switch to light mode';
    };

    let initial = null;
    try { initial = localStorage.getItem(KEY); } catch {}
    if (!initial) {
        const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)')?.matches;
        initial = prefersLight ? 'light' : defaultMode;
    }

    // apply initial mode
    themeCtrl.setMode(initial);
    setIcons();

    // click button to toggle
    const onClick = () => {
        const next = isLight() ? 'dark' : 'light';
        themeCtrl.setMode(next);
        try { localStorage.setItem(KEY, next); } catch {}
        setIcons();
    };
    button.addEventListener('click', onClick);

    // if the OS changes
    const mql = window.matchMedia?.('(prefers-color-scheme: light)');
    const onPref = (e) => {
        let saved = null;
        try { saved = localStorage.getItem(KEY); } catch {}
        if (saved) return;
        themeCtrl.setMode(e.matches ? 'light' : 'dark');
        setIcons();
    };
    mql?.addEventListener?.('change', onPref);

    return {
        set(mode) { themeCtrl.setMode(mode); setIcons(); try { localStorage.setItem(KEY, mode); } catch {} },
        toggle()  { onClick(); },
        destroy() {
            button.removeEventListener('click', onClick);
            mql?.removeEventListener?.('change', onPref);
        }
    };
}
