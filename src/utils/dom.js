export const qs  = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const byId = (id) => document.getElementById(id);

export const on  = (el, ev, fn, opts) => el?.addEventListener?.(ev, fn, opts);
export const off = (el, ev, fn, opts) => el?.removeEventListener?.(ev, fn, opts);

export const setVars = (el, obj) => {
  if (!el) return;
  for (const [k, v] of Object.entries(obj)) el.style.setProperty(k, String(v));
};

export function initDom() {
  // Workbench / panes / terminal
  const workspace   = byId('workspace');
  const editorPane  = byId('editor-pane');
  const consolePane = byId('console-pane');
  const splitter    = byId('splitter');
  const terminalEl  = byId('terminal');
  const codeEl      = byId('code');

  // Bars & UI
  const topbar      = qs('.topbar');
  const bottombar   = qs('.bottombar');

  // Buttons / controls
  const runBtn      = byId('runBtn');
  const clearBtn    = qs('.btn.clear');
  const copyBtn     = qs('.btn.copy');
  const downloadBtn = qs('.btn.download');
  const modeBtn     = byId('modeBtn');
  const editorThemeSelect = byId('editorThemeSelect');

  // Settings
  const settingsOverlay = byId('settingsOverlay');
  const settingsBtn     = byId('settingsBtn');
  const closeSettings   = byId('closeSettings');

  // Editor controls
  const fontSizeSlider  = byId('fontSizeSlider');
  const fontFamilySelect= byId('fontFamilySelect');
  const tabSpacesSlider = byId('tabSpacesSlider');
  const tabSpacesValue  = byId('tabSpacesValue');
  const tabSpacesInfo   = qs('.tab-spaces-info');
  const editorDownloadBtn = byId('downloadEditorBtn');

  // Info
  const lineColInfo = byId('line-col-info');

  // Icons
  const moonIcon = qs('#modeBtn .moon-icon');
  const sunIcon  = qs('#modeBtn .sun-icon');

  return {
    // roots
    workspace, editorPane, consolePane, splitter, terminalEl, codeEl,
    topbar, bottombar,

    // controls
    runBtn, clearBtn, copyBtn, downloadBtn,
    modeBtn, moonIcon, sunIcon, editorThemeSelect,

    // settings
    settingsOverlay, settingsBtn, closeSettings,

    // editor controls
    fontSizeSlider, fontFamilySelect,
    tabSpacesSlider, tabSpacesValue, tabSpacesInfo,
    editorDownloadBtn,

    // info
    lineColInfo,
  };
}
