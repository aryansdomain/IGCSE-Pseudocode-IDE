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
    const toBare = (id) => {

        // remove the ace/theme/
        let bare = String(id).replace(/^ace\/theme\//, '');

        // convert to snake_case
        bare = bare.toLowerCase().replace(/[\s-]/g, '_');
        return bare;
    };

    function themeInfo(name) {
        const normalized = name.toLowerCase().replace(/[\s_-]/g, '');
        
        const normalizedLightThemes = lightThemes.map(t => t.toLowerCase().replace(/[\s_-]/g, ''));
        const normalizedDarkThemes = darkThemes.map(t => t.toLowerCase().replace(/[\s_-]/g, ''));
        
        if (normalizedLightThemes.includes(normalized)) {
            const originalTheme = lightThemes[normalizedLightThemes.indexOf(normalized)];
            return { ok: true, kind: 'light', name: originalTheme, bare: toBare(originalTheme) };
        }
        if (normalizedDarkThemes.includes(normalized)) {
            const originalTheme = darkThemes[normalizedDarkThemes.indexOf(normalized)];
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

    function refreshEditorChrome() {
        const bottomBar = document.querySelector('.bottombar');
        const topBar = document.querySelector('.topbar');
        const hostEl = document.getElementById('code') || editor.container;
        const cs = (el) => window.getComputedStyle(el);
        const editorBg = cs(hostEl).backgroundColor;
        const editorFg = cs(hostEl).color;

        [bottomBar, topBar].filter(Boolean).forEach(bar => {
            bar.style.backgroundColor = editorBg;
            bar.style.color = editorFg;
        });
        document.querySelectorAll('.topbar .btn').forEach(btn => {
            btn.style.color = editorFg;
            btn.querySelectorAll('i').forEach(icon => (icon.style.color = editorFg));
        });
    }

    function setTheme(name) { 
        editor.setTheme(`ace/theme/${toBare(name)}`);
    }
    function getTheme() { return editor.getTheme().replace(/^ace\/theme\//, ''); }

    // UI event listeners
    editorThemeSelect?.addEventListener('change', (e) => {
        const themeName = String(e.target.value || '').replace('ace/theme/', '');
        setTheme(themeName);
    });

    // Update the dropdown
    if (editorThemeSelect) editorThemeSelect.value = editor.getTheme();

    // Recolor topbar, bottombar when theme changes
    if (editor.renderer && editor.renderer.on) {
        if (editor.renderer.$theme) refreshEditorChrome();
        editor.renderer.on('themeLoaded', refreshEditorChrome);
    }

    updateConsoleTheme();

    return { 
        setTheme, 
        getTheme,
        refreshEditorChrome, 
        updateConsoleTheme,
        themeInfo, 
        listThemes, 
        lightThemes, 
        darkThemes 
    };
}
