export function initThemeControls({
    editor,
    editorApis,
    terminal,
    modeToggleBtn,
    moonIcon,
    sunIcon,
    editorThemeSelect,
    lightThemes = [
        'ace/theme/chrome','ace/theme/clouds','ace/theme/dawn','ace/theme/dreamweaver',
        'ace/theme/eclipse','ace/theme/github','ace/theme/gruvbox_light_hard','ace/theme/iplastic',
        'ace/theme/katzenmilch','ace/theme/kuroir','ace/theme/solarized_light','ace/theme/sqlserver',
        'ace/theme/textmate','ace/theme/tomorrow','ace/theme/xcode'
    ],
    darkThemes = [
        'ace/theme/ambiance','ace/theme/chaos','ace/theme/clouds_midnight','ace/theme/cobalt',
        'ace/theme/dracula','ace/theme/gruvbox','ace/theme/gruvbox_dark_hard','ace/theme/idle_fingers',
        'ace/theme/kr_theme','ace/theme/merbivore','ace/theme/monokai','ace/theme/nord_dark',
        'ace/theme/one_dark','ace/theme/pastel_on_dark','ace/theme/solarized_dark','ace/theme/terminal',
        'ace/theme/tomorrow_night','ace/theme/tomorrow_night_blue','ace/theme/tomorrow_night_bright',
        'ace/theme/tomorrow_night_eighties','ace/theme/twilight','ace/theme/vibrant_ink'
    ],
}) {
    if (!editor || !editorApis || !terminal) throw new Error('initThemeControls: editor, editorApis, terminal required');

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

    function setMode(mode /* 'light' | 'dark' */) {

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

    return { setMode, toggleMode, setEditorTheme, refreshEditorChrome, updateTerminalTheme };
}
