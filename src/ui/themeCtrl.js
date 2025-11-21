export function initTheme({
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
    const STORAGE_KEY = 'igcse_ide_theme';

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

    function updateElements() {
        updateBars();
        updateSliders();
        updateFiles();
    }
    function updateBars() {
        const hostEl   = document.getElementById('code') || editor.container;
        const editorBg = window.getComputedStyle(hostEl).backgroundColor;
        const editorFg = window.getComputedStyle(hostEl).color;

        // set css vars
        document.documentElement.style.setProperty('--editor-bg', editorBg);
        document.documentElement.style.setProperty('--editor-fg', editorFg);
    }
    function updateSliders() {

        // get color of keyword for current theme
        const editorEl = document.getElementById('code');
        const tempEl = document.createElement('span');
        editorEl.appendChild(tempEl);
        tempEl.className = 'ace_keyword';
        const keywordColor = window.getComputedStyle(tempEl).color;
        editorEl.removeChild(tempEl); // clean up

        // apply color
        try { document.documentElement.style.setProperty('--keyword-color', keywordColor); } catch {}
    }
    function updateFiles() {
        const editorEl = document.getElementById('code') || editor.container;
        
        let lineNumColor = null;
        
        const gutter = editorEl.querySelector('.ace_gutter');
        if (gutter) {
            const activeGutterCell = gutter.querySelector('.ace_gutter-active-line, .ace_gutter-cell.ace_gutter-active-line');
            if (activeGutterCell) {
                lineNumColor = window.getComputedStyle(activeGutterCell).color;
            }
        }

        // set css var
        if (lineNumColor) {
            document.documentElement.style.setProperty('--line-num-color', lineNumColor);
        }
    }

    function setTheme(name, skipAnalytics = false) {
        name = toBare(name);
        const previousTheme = getTheme();
        const previousInfo = themeInfo(previousTheme);
        const newInfo = themeInfo(name);
        
        editor.setTheme(`ace/theme/${name}`);
        localStorage.setItem(STORAGE_KEY, name);
        
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
            if (editor.renderer.$theme) updateElements();
            editor.renderer.on('themeLoaded', () => { updateElements(); });
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
    let savedTheme = null;
    try {
        savedTheme = localStorage.getItem(STORAGE_KEY);
    } catch {}
    
    if (savedTheme && themeInfo(savedTheme).ok) {
        setTheme(savedTheme, true);
    } else {
        setTheme(getTheme(), true);
    }
    updateConsoleTheme();
    editorThemeSelect.value = 'ace/theme/' + toBare(getTheme());

    return {
        setTheme,
        getTheme,
        updateConsoleTheme,
        updateElements,
        themeInfo,
        lightThemes,
        darkThemes
    };
}
