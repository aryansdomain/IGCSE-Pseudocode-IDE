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
        name = toBare(name);
        const previousTheme = getTheme();
        const previousInfo = themeInfo(previousTheme);
        const newInfo = themeInfo(name);
        
        editor.setTheme(`ace/theme/${name}`);
        
        // track theme change analytics
        if (previousInfo.ok && newInfo.ok && previousTheme !== name) {
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

        // recolor bars
        if (editor.renderer && editor.renderer.on) {
            if (editor.renderer.$theme) updateBars();
            editor.renderer.on('themeLoaded', updateBars);
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
    setTheme(getTheme()); // update bars
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
