export function initEditor({
    container,
    defaultCode = '',
    tabSize = 4,
    theme = 'monokai',
    softWrap = false,
    readOnly = false,

} = {}) {
    if (!container) throw new Error('initEditor: container is required');

    const editor = ace.edit(container);

    // initial editor configuration
    editor.setTheme(`ace/theme/${theme}`);
    editor.session.setMode('ace/mode/lang');
    editor.setValue(defaultCode, -1);          // -1 = keep cursor at start
    editor.session.setUseSoftTabs(true);
    editor.session.setTabSize(tabSize);
    editor.setShowPrintMargin(false);
    editor.setReadOnly(!!readOnly);
    editor.setOption('wrap', softWrap ? 'free' : false);

    // auto pairing configuration
    editor.setOptions({
        behaviorsEnabled: true,
        wrapBehaviorsEnabled: true,
    });

    // API
    function getCode() { return editor.getValue(); }
    function setCode(src, moveCursorToStart = false) {
        editor.setValue(String(src ?? ''), moveCursorToStart ? -1 : 1);
    }

    // commands that affect editor
    function setTab(n = 4) {
        const size = Math.max(1, parseInt(n, 10) || 4);
        editor.session.setTabSize(size);
    }
    function setTheme(name = 'monokai') {
        editor.setTheme(`ace/theme/${name}`);
    }
    function setSoftWrap(v) {
        editor.setOption('wrap', !!v ? 'free' : false);
    }
    function setReadOnlyFlag(v) {
        editor.setReadOnly(!!v);
    }

  const editorApis = {
    setTab,
    setTheme,
    setSoftWrap,
    setReadOnly: setReadOnlyFlag,
    focus: () => editor.focus(),
  };

    return { editor, getCode, setCode, editorApis };
}
