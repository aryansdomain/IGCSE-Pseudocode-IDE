export function initThemeControls({
    editor,
    editorApis,
    terminal,
    modeCtrl,
    editorThemeSelect,
    lightThemes = [
        'Chrome','Clouds','Dawn','Dreamweaver', 'eclipse','github','gruvbox_light_hard','iplastic',
        'Katzenmilch','Kuroir','Solarized Light','SQL Server', 'Textmate','Tomorrow','Xcode'
    ],
    darkThemes = [
        'Ambiance','Chaos','Clouds Midnight','Cobalt','Dracula','Gruvbox','Gruvbox Dark Hard',
        'Idle Fingers','KR Theme','Merbivore','Monokai','Nord Dark','One Dark','Pastel on Dark',
        'Solarized Dark','Terminal','Tomorrow Night','Tomorrow Night Blue','Tomorrow Night Bright',
        'Tomorrow Night Eighties','Twilight','Vibrant Ink'
    ],
}) {
    if (!editor || !editorApis || !terminal) throw new Error('initThemeControls: editor, editorApis, terminal required');

    const toBare = (id) => {
        let bare = String(id).replace(/^ace\/theme\//, '');

        // convert to snake_case
        bare = bare.toLowerCase().replace(/[\s-]/g, '_');
        return bare;
    };

    function hasTheme(name) {
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


    function updateTerminalTheme() {
        const light = modeCtrl.isLightMode();
        terminal.options.theme = light ? {
            background: '#ffffff', foreground: '#000000', cursor: '#000000', selection: '#00000030',
            black: '#000000', red: '#d73a49', green: '#179645', yellow: '#ce8600', blue: '#0000ff',
            magenta: '#ff00ff', cyan: '#00ffff', white: '#ffffff',
            brightBlack: '#8b949e', brightRed: '#ff7b72', brightGreen: '#179645', brightYellow: '#ce8600',
            brightBlue: '#0000ff', brightMagenta: '#ff00ff', brightCyan: '#00ffff', brightWhite: '#ffffff'
        } : {
            background: '#000000', foreground: '#e6edf3', cursor: '#e6edf3', selection: '#2b313b30',
            black: '#000000', red: '#ff7b72', green: '#22c55e', yellow: '#ffd700', blue: '#0000ff',
            magenta: '#ff00ff', cyan: '#00ffff', white: '#e6edf3',
            brightBlack: '#8b949e', brightRed: '#ff7b72', brightGreen: '#22c55e', brightYellow: '#ffd700',
            brightBlue: '#0000ff', brightMagenta: '#ff00ff', brightCyan: '#00ffff', brightWhite: '#e6edf3'
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

    function setEditorTheme(name) {
        editorApis.setTheme(name);
    }

    // UI event listeners
    editorThemeSelect?.addEventListener('change', (e) => {
        const themeName = String(e.target.value || '').replace('ace/theme/', '');
        setEditorTheme(themeName);
    });

    // Update the dropdown
    if (editorThemeSelect) editorThemeSelect.value = editor.getTheme();

    // Recolor topbar, bottombar when theme changes
    if (editor.renderer && editor.renderer.on) {
        if (editor.renderer.$theme) refreshEditorChrome();
        editor.renderer.on('themeLoaded', refreshEditorChrome);
    }

    updateTerminalTheme();

    return { 
        setEditorTheme, 
        refreshEditorChrome, 
        updateTerminalTheme,
        hasTheme, 
        listThemes, 
        lightThemes, 
        darkThemes 
    };
}
