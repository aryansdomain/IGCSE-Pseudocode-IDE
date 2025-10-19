export function initThemeControls({
    editor,
    console,
    modeCtrl,
    editorThemeSelect,
    lightThemes = [
        'Chrome','Clouds','Dawn','Dreamweaver', 'Eclipse','GitHub','Gruvbox Light Hard','iPlastic',
        'Katzenmilch','Kuroir','Solarized Light','SQL Server', 'Textmate','Tomorrow','Xcode'
    ],
    darkThemes = [
        'Ambiance','Chaos','Clouds Midnight','Cobalt','Dracula','Gruvbox','Gruvbox Dark Hard',
        'Idle Fingers','KR Theme','Merbivore','Monokai','Nord Dark','One Dark','Pastel on Dark',
        'Solarized Dark','Terminal','Tomorrow Night','Tomorrow Night Blue','Tomorrow Night Bright',
        'Tomorrow Night Eighties','Twilight','Vibrant Ink'
    ],
}) {
    const toBare = (name) => {
        let bare = String(name).replace(/^ace\/theme\//, '');  // remove the ace/theme/
        bare = bare.toLowerCase().replace(/[\s-]/g, '_');      // convert to snake_case

        if (bare === 'sql_server') bare = 'sqlserver';         // proper name for this theme
        return bare;
    };

    // theme lists
    const bareLightThemes = lightThemes.map(t => toBare(t));
    const bareDarkThemes  =  darkThemes.map(t => toBare(t));

    function themeInfo(name) {
        name = toBare(name);
        
        if (bareLightThemes.includes(name)) {
            const originalTheme = lightThemes[bareLightThemes.indexOf(name)];
            return { ok: true, kind: 'light', name: originalTheme, bare: toBare(originalTheme) };
        }
        if (bareDarkThemes.includes(name)) {
            const originalTheme = darkThemes[bareDarkThemes.indexOf(name)];
            return { ok: true, kind: 'dark', name: originalTheme, bare: toBare(originalTheme) };
        }
        return { ok: false };
    }
    
    function listThemes() {
        return [...lightThemes, ...darkThemes].map(toBare);
    }

    function updateConsoleTheme() {
        const light = modeCtrl.isLightMode();
        console.options.theme = light ? {
            background: '#ffffff', foreground: '#000000', cursor: '#000000', selection: '#00000030',
            red: '#d73a49', green: '#179645', yellow: '#ce8600', brightGreen: '#179645', brightYellow: '#ce8600'
        } : {
            background: '#000000', foreground: '#ffffff', cursor: '#ffffff', selection: '#2b313b30',
            red: '#ff7b72', green: '#22c55e', yellow: '#ffd700', brightGreen: '#22c55e', brightYellow: '#ffd700'
        };
    }

    function updateBars() {
        const hostEl = document.getElementById('code') || editor.container;
        const editorBg = window.getComputedStyle(hostEl).backgroundColor;
        const editorFg = window.getComputedStyle(hostEl).color;

        const topBar    = document.querySelector('.topbar');
        const bottomBar = document.querySelector('.bottombar');

        [bottomBar, topBar].filter(Boolean).forEach(bar => {
            bar.style.backgroundColor = editorBg;
            bar.style.color = editorFg;
        });
        document.querySelectorAll('.topbar .btn').forEach(btn => {
            btn.style.color = editorFg;
            btn.querySelectorAll('i').forEach(icon => (icon.style.color = editorFg));
        });
    }

    function updateSliders() {

        // get color of keyword for current theme
        const editorEl = document.getElementById('code');
        const tempEl = document.createElement('span');
        editorEl.appendChild(tempEl);
        tempEl.className = 'ace_keyword';
        const keywordColor = window.getComputedStyle(tempEl).color;
        editorEl.removeChild(tempEl); // clean up

        // apply color to settings panel elements
        document.querySelectorAll('.setting-group input[type="range"]').forEach(slider => {
            const styleId = 'slider-accent-style';
            let styleEl = document.getElementById(styleId);
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = styleId;
                document.head.appendChild(styleEl);
            }
            styleEl.textContent = `
                .setting-group input[type="range"]::-webkit-slider-thumb { background: ${keywordColor} !important; }
                .setting-group input[type="range"]::-webkit-slider-thumb:hover { background: ${keywordColor} !important; opacity: 0.8; }
                .setting-group input[type="range"]::-webkit-slider-track { background: linear-gradient(to right, ${keywordColor} 0%, ${keywordColor} 50%, var(--border) 50%, var(--border) 100%) !important; }
                .setting-group input[type="range"]::-moz-range-thumb { background: ${keywordColor} !important; }
                .setting-group input[type="range"]::-moz-range-thumb:hover { background: ${keywordColor} !important; opacity: 0.8; }
                .setting-group input[type="range"]::-moz-range-track { background: linear-gradient(to right, ${keywordColor} 0%, ${keywordColor} 50%, var(--border) 50%, var(--border) 100%) !important; }
            `;
        });
        document.querySelectorAll('.font-select').forEach(el => {
            el.style.setProperty('--hover-border-color', keywordColor);
        });
        document.querySelectorAll('.btn.editortheme-changer').forEach(el => {
            el.style.color = keywordColor;
        });
        document.querySelectorAll('.editortheme-button').forEach(el => {
            el.style.setProperty('--hover-border-color', keywordColor);
            el.style.setProperty('--hover-color', keywordColor);
        });
        document.querySelectorAll('.editortheme-item').forEach(el => {
            el.style.setProperty('--hover-border-color', keywordColor);
            el.style.setProperty('--hover-color', keywordColor);
        });
        document.querySelectorAll('.slider-ticks .tick').forEach(el => {
            el.style.setProperty('--hover-color', keywordColor);
        });
    }

    function setTheme(name, skipAnalytics = false) {
        name = toBare(name);
        const previousTheme = getTheme();
        const previousInfo = themeInfo(previousTheme);
        const newInfo = themeInfo(name);
        
        editor.setTheme(`ace/theme/${name}`);
        
        // track theme change analytics
        if (!skipAnalytics && previousInfo.ok && newInfo.ok && previousTheme !== name) {
            try {
                window.theme_changed && window.theme_changed({
                    theme_changed_from: previousTheme,
                    theme_changed_from_mode: previousInfo.kind,
                    theme_changed_to: getTheme(),
                    theme_changed_to_mode: newInfo.kind,
                });
            } catch {}
        }

        // update dropdown
        editorThemeSelect.value = 'ace/theme/' + toBare(getTheme());

        // recolor bars and update accent color
        if (editor.renderer && editor.renderer.on) {
            if (editor.renderer.$theme) {
                updateBars();
                updateSliders();
            }
            editor.renderer.on('themeLoaded', () => {
                updateBars();
                updateSliders();
            });
        }
    }
    function getTheme() {
        const bareTheme = toBare(editor.getTheme());
        const themeIndex = [...bareLightThemes, ...bareDarkThemes].indexOf(bareTheme); // index in combined list
        return [...lightThemes, ...darkThemes][themeIndex]; // convert to proper/formatted name
    }

    // theme change event listener
    editorThemeSelect?.addEventListener('change', (e) => setTheme(String(e.target.value)));

    // init
    setTheme(getTheme(), true);
    updateConsoleTheme();
    editorThemeSelect.value = 'ace/theme/' + toBare(getTheme());

    return { 
        setTheme, 
        getTheme,
        updateBars, 
        updateConsoleTheme,
        themeInfo, 
        listThemes, 
        lightThemes, 
        darkThemes 
    };
}
