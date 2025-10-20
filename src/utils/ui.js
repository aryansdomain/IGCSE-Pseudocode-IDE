export const qs    = (sel, root = document) => root.querySelector(sel);
export const qsa   = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const byId  = (id) => document.getElementById(id);

export const on    = (element, event, func, options) =>  element?.addEventListener?.(event, func, options);
export const off   = (element, event, func, options) =>  element?.removeEventListener?.(event, func, options);

export const setVars = (el, obj) => {
    if (!el) return;
    for (const [k, v] of Object.entries(obj)) el.style.setProperty(k, String(v));
};

export function initUI() {

    return {
        // main workspace structure
        workspace:           byId('workspace'),
        editorPane:          byId('editorPane'),
        topbar:              byId('topBar'),
        codeEl:              byId('code'),
        bottombar:           byId('bottomBar'),
        splitter:            byId('splitter'),
        consolePane:         byId('consolePane'),
        runBtn:              byId('runBtn'),
        consoleEl:           byId('console-viewport'),
        consoleLoadingBar:   byId('consoleLoadingBar'),

        // editor buttons
        editorExpandBtn:     byId('editorExpandBtn'),
        formatBtn:           byId('formatBtn'),
        fileInput:           byId('fileInput'),
        editorCopyBtn:       byId('editorCopyBtn'),
        editorDownloadBtn:   byId('editorDownloadBtn'),
        uploadBtn:           byId('uploadBtn'),

        // console buttons
        expandConsoleBtn:    byId('expandConsoleBtn'),
        clearBtn:            byId('clearConsoleBtn'),
        consoleCopyBtn:      byId('copyConsoleBtn'),
        consoleDownloadBtn:  byId('downloadConsoleBtn'),

        // editor settings
        fontSizeSlider:      byId('fontSizeSlider'),
        fontFamilySelect:    byId('fontFamilySelect'),
        tabSpacesSlider:     byId('tabSpacesSlider'),
        tabSpacesValue:      byId('tabSpacesValue'),

        // other controls
        modeBtn:             byId('modeBtn'),
        editorThemeSelect:   byId('editorThemeSelect'),
        layoutBtn:           byId('layoutBtn'),
        
        // settings
        settingsOverlay:     byId('settingsOverlay'),
        settingsBtn:         byId('settingsBtn'),
        closeSettings:       byId('closeSettings'),
        restartTourBtn:      byId('restartTourBtn'),

        // info
        lineColInfo:         byId('lineColInfo'),
        tabSpacesInfo:       byId('tabSpacesInfo'),
    };
}
