export function initUI() {
    return {
        // main workspace structure
        workspace:          document.getElementById('workspace'),
        editorPane:         document.getElementById('editorPane'),
        topbar:             document.getElementById('topBar'),
        code:               document.getElementById('code'),
        bottombar:          document.getElementById('bottomBar'),
        splitter:           document.getElementById('splitter'),
        consolePane:        document.getElementById('consolePane'),
        runBtn:             document.getElementById('runBtn'),
        console:            document.getElementById('consoleViewport'),
        consoleLoadingBar:  document.getElementById('consoleLoadingBar'),

        // editor files
        filesBar:           document.getElementById('filesBar'),
        files:              document.getElementById('files'),

        // editor buttons
        editorExpandBtn:    document.getElementById('editorExpandBtn'),
        formatBtn:          document.getElementById('formatBtn'),
        fileInput:          document.getElementById('fileInput'),
        editorCopyBtn:      document.getElementById('editorCopyBtn'),
        editorDownloadBtn:  document.getElementById('editorDownloadBtn'),
        uploadBtn:          document.getElementById('uploadBtn'),

        // console buttons
        expandConsoleBtn:   document.getElementById('expandConsoleBtn'),
        clearBtn:           document.getElementById('clearConsoleBtn'),
        consoleCopyBtn:     document.getElementById('copyConsoleBtn'),
        consoleDownloadBtn: document.getElementById('downloadConsoleBtn'),

        // editor settings
        fontSizeSlider:     document.getElementById('fontSizeSlider'),
        fontSizeValue:      document.getElementById('fontSizeValue'),
        fontFamilySelect:   document.getElementById('fontFamilySelect'),
        tabSpacesSlider:    document.getElementById('tabSpacesSlider'),
        tabSpacesValue:     document.getElementById('tabSpacesValue'),

        // other controls
        modeBtn:            document.getElementById('modeBtn'),
        editorThemeSelect:  document.getElementById('editorThemeSelect'),
        layoutBtn:          document.getElementById('layoutBtn'),
        infoBtn:            document.getElementById('infoBtn'),

        // settings
        settingsOverlay:    document.getElementById('settingsOverlay'),
        settingsBtn:        document.getElementById('settingsBtn'),
        closeSettings:      document.getElementById('closeSettings'),
        restartTourBtn:     document.getElementById('restartTourBtn'),

        // examples
        examplesOverlay:    document.getElementById('examplesOverlay'),
        examplesBtn:        document.getElementById('examplesBtn'),
        closeExamples:      document.getElementById('closeExamples'),

        // info
        lineColInfo:        document.getElementById('lineColInfo'),
        tabSpacesInfo:      document.getElementById('tabSpacesInfo')
    };
}
