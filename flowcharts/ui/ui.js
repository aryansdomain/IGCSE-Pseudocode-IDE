export function initUI() {
    return {
        // canvas
        canvas:               document.getElementById('canvas'),
        arrangeBtn:           document.getElementById('arrangeBtn'),
        downloadBtn:          document.getElementById('downloadBtn'),
        flowchartWorkspace:   document.getElementById('flowchartWorkspace'),
        shapePanel:           document.getElementById('shapePanel'),
        filesEl:              document.getElementById('flowchartFiles'),

        // utility bar
        modeBtn:              document.getElementById('modeBtn'),
        settingsBtn:          document.getElementById('settingsBtn'),
        issueReportBtn:       document.getElementById('issueReportBtn'),

        // trace table card
        traceTableCard:       document.getElementById('traceTableCard'),
        traceTableCardTop:    document.getElementById('traceTableCardTop'),
        traceTableWrap:       document.getElementById('traceTableWrap'),
        makeTraceTableBtn:    document.getElementById('makeTraceTableBtn'),
        addRowBtn:            document.getElementById('addRowBtn'),
        fitBtn:               document.getElementById('fitBtn'),
        clearTraceTableBtn:   document.getElementById('clearTraceTableBtn'),
        toggleTraceTableBtn:  document.getElementById('toggleTraceTableBtn'),
        runBtn:               document.getElementById('runBtn'),

        // settings
        settingsOverlay:      document.getElementById('settingsOverlay'),
        closeSettings:        document.getElementById('closeSettings'),
        fontSizeSlider:       document.getElementById('fontSizeSlider'),
        fontSizeValue:        document.getElementById('fontSizeValue'),
        fontFamilySelect:     document.getElementById('fontFamilySelect'),
    };
}
