export function initThemeControls({
    editor,
    editorApis,
    terminal,
    modeToggleBtn,
    moonIcon,
    sunIcon,
    editorThemeSelect,
    lightThemes = [
        'chrome','clouds','dawn','dreamweaver', 'eclipse','github','gruvbox_light_hard','iplastic',
        'katzenmilch','kuroir','solarized_light','sqlserver', 'textmate','tomorrow','xcode'
    ],
    darkThemes = [
        'ambiance','chaos','clouds_midnight','cobalt','dracula','gruvbox','gruvbox_dark_hard',
        'idle_fingers','kr_theme','merbivore','monokai','nord_dark','one_dark','pastel_on_dark',
        'solarized_dark','terminal','tomorrow_night','tomorrow_night_blue','tomorrow_night_bright',
        'tomorrow_night_eighties','twilight','vibrant_ink'
    ],
}) {
    if (!editor || !editorApis || !terminal) throw new Error('initThemeControls: editor, editorApis, terminal required');

    const toBare = (id)   => String(id).replace(/^ace\/theme\//, '');
    function hasTheme(name) {
        if (lightThemes.includes(name)) return { ok: true, kind: 'light', name, bare: toBare(name) };
        if ( darkThemes.includes(name)) return { ok: true, kind: 'dark',  name, bare: toBare(name) };
                                        return { ok: false };
    }
    function listThemes() {
        return [...lightThemes, ...darkThemes].map(toBare);
    }

    function isLightMode() {
        return document.documentElement.classList.contains('light');
    }

    function updateTerminalTheme() {
        const light = isLightMode();
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
        const topBar    = document.querySelector('.topbar');
        const hostEl    = document.getElementById('code') || editor.container;
        const cs        = (el) => window.getComputedStyle(el);
        const editorBg  = cs(hostEl).backgroundColor;
        const editorFg  = cs(hostEl).color;

        [bottomBar, topBar].filter(Boolean).forEach(bar => {
            bar.style.backgroundColor = editorBg;
            bar.style.color = editorFg;
        });
        document.querySelectorAll('.topbar .btn').forEach(btn => {
            btn.style.color = editorFg;
            btn.querySelectorAll('ion-icon').forEach(icon => (icon.style.color = editorFg));
        });
    }

    function setMode(mode) {

        // disable transitions during switch
        document.documentElement.classList.add('mode-switching');

        const currentTheme = editor.getTheme(); // full id: 'ace/theme/...'
        if (mode === 'light') {
            document.documentElement.classList.add('light');
            if (moonIcon) moonIcon.hidden = false;
            if (sunIcon)  sunIcon.hidden  = true;
            if (!lightThemes.includes(currentTheme)) editorApis.setTheme('github');
        } else {
            document.documentElement.classList.remove('light');
            if (moonIcon) moonIcon.hidden = true;
            if (sunIcon)  sunIcon.hidden  = false;
            if (!darkThemes.includes(currentTheme)) editorApis.setTheme('monokai');
        }

        updateTerminalTheme();
        setTimeout(() => document.documentElement.classList.remove('mode-switching'), 50);
    }

    function toggleMode() {
        setMode(isLightMode() ? 'dark' : 'light');
    }

    function setEditorTheme(name) {
        editorApis.setTheme(name);
    }

    // ui
    modeToggleBtn?.addEventListener('click', toggleMode);

    editorThemeSelect?.addEventListener('change', (e) => {
        const themeName = String(e.target.value || '').replace('ace/theme/', '');
        setEditorTheme(themeName);
    });

    // update the dropdown
    if (editorThemeSelect) editorThemeSelect.value = editor.getTheme();

    // recolor topbar, bottombar
    if (editor.renderer && editor.renderer.on) {
        if (editor.renderer.$theme) refreshEditorChrome();
        editor.renderer.on('themeLoaded', refreshEditorChrome);
    }

    updateTerminalTheme();

    return { setMode, toggleMode, setEditorTheme, refreshEditorChrome, updateTerminalTheme,
             hasTheme, listThemes, lightThemes, darkThemes };
}
