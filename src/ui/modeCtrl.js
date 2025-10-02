const KEY = 'ui.mode'; // localStorage key

export function initMode({
    themeCtrl,
    button,
    moonIcon = null,
    sunIcon  = null,
    defaultMode = 'dark',
} = {}) {
    // store the initial themeCtrl reference (it could change)
    let currentThemeCtrl = themeCtrl;

    function isLightMode() {
        return document.documentElement.classList.contains('light');
    }

    function setIcons() {
        const light = isLightMode();
        moonIcon.hidden = !light;  // in light mode, show moon
        sunIcon.hidden = light;    // in dark mode, show sun
        
        button.setAttribute('aria-pressed', String(light));
        button.title = light ? 'Switch to dark mode' : 'Switch to light mode';
    }

    function setMode(mode) {
        // disable transitions during switch
        document.documentElement.classList.add('mode-switching');

        if (mode === 'light') {
            document.documentElement.classList.add('light');
        } else {
            document.documentElement.classList.remove('light');
        }

        // handle theme updates
        if (currentThemeCtrl) {
            const currentTheme = currentThemeCtrl.getCurrentEditorTheme();
            const themeInfo = currentThemeCtrl.hasTheme(currentTheme);
            
            // handle theme updates
            if (mode === 'light' && themeInfo.kind === 'dark') {
                currentThemeCtrl.setEditorTheme('github');
            } else if (mode === 'dark' && themeInfo.kind === 'light') {
                currentThemeCtrl.setEditorTheme('monokai');
            }
            
            currentThemeCtrl.updateTerminalTheme();
            currentThemeCtrl.refreshEditorChrome();
        }
        
        setTimeout(() => document.documentElement.classList.remove('mode-switching'), 50);
    }

    function toggleMode() {
        setMode(isLightMode() ? 'dark' : 'light');
    }

    // init mode from storage or system preference
    let initial = null;
    try { initial = localStorage.getItem(KEY); } catch {}
    if (!initial) {
        const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)')?.matches;
        initial = prefersLight ? 'light' : defaultMode;
    }

    // apply initial mode
    setMode(initial);
    setIcons();

    // click button to toggle
    const onClick = () => {
        const next = isLightMode() ? 'dark' : 'light';
        setMode(next);
        try { localStorage.setItem(KEY, next); } catch {}
        setIcons();
    };
    button.addEventListener('click', onClick);

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
        toggleMode,
        isLightMode,
        setThemeCtrl(themeCtrl) {
            currentThemeCtrl = themeCtrl;
        },
        set(mode) { 
            setMode(mode); 
            setIcons(); 
            try { localStorage.setItem(KEY, mode); } catch {} 
        },
        toggle() { onClick(); },
        destroy() {
            button.removeEventListener('click', onClick);
            mql?.removeEventListener?.('change', onPref);
        }
    };
}
