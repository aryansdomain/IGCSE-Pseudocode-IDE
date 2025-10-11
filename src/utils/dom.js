export const qs      = (sel, root = document) => root.querySelector(sel);
export const qsa     = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const byId    = (id) => document.getElementById(id);

export const on      = (element, event, func, options) =>     element?.addEventListener?.(event, func, options);
export const off     = (element, event, func, options) =>  element?.removeEventListener?.(event, func, options);

export const setVars = (el, obj) => {
    if (!el) return;
    for (const [k, v] of Object.entries(obj)) el.style.setProperty(k, String(v));
};

export function initDom() {

    return {

        // main workspace structure
        workspace:           byId('workspace'),
        editorPane:          byId('editor-pane'),
        topbar:              qs('.topbar'),
        codeEl:              byId('code'),
        bottombar:           qs('.bottombar'),
        splitter:            byId('splitter'),
        consolePane:         byId('console-pane'),
        runBtn:              byId('runBtn'),
        consoleEl:           byId('console-viewport'),
        consoleLoadingBar:   byId('consoleLoadingBar'),

        // editor buttons
        formatBtn:           byId('btn-format'),
        editorCopyBtn:       byId('copyEditorBtn'),
        editorDownloadBtn:   byId('downloadEditorBtn'),
        expandConsoleBtn:    byId('expandConsoleBtn'),

        // console buttons
        expandEditorBtn:     byId('expandEditorBtn'),
        clearBtn:            byId('clearConsoleBtn'),
        consoleCopyBtn:      byId('copyConsoleBtn'),
        consoleDownloadBtn:  byId('downloadConsoleBtn'),

        // editor settings
        fontSizeSlider:      byId('fontSizeSlider'),
        fontFamilySelect:    byId('fontFamilySelect'),
        tabSpacesSlider:     byId('tabSpacesSlider'),
        tabSpacesValue:      byId('tabSpacesValue'),
        tabSpacesInfo:       qs('.tab-spaces-info'),

        // other controls
        modeBtn:             byId('modeBtn'),
        editorThemeSelect:   byId('editorThemeSelect'),
        layoutBtn:           byId('layoutBtn'),
        
        // settings
        settingsOverlay:     byId('settingsOverlay'),
        settingsBtn:         byId('settingsBtn'),
        closeSettings:       byId('closeSettings'),

        // info
        lineColInfo:         byId('line-col-info'),
    };
}
