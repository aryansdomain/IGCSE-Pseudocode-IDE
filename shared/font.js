const FONT_KEY = 'igcse_ide_editor_font';
const DEFAULT_SIZE = 14;
const DEFAULT_FAMILY = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace";

// character width divided by font size
export const CHAR_RATIOS = {
    'ui-monospace':    0.601,
    'courier new':     0.601,
    'lucida console':  0.600,
    'consolas':        0.550,
    'monaco':          0.601,
    'source code pro': 0.590,
    'fira code':       0.610,
    'jetbrains mono':  0.580,
    'roboto mono':     0.601,
    'ubuntu mono':     0.590,
    'inconsolata':     0.540,
    'pt mono':         0.601,
    'space mono':      0.601,
    'hack':            0.590,
};
export const DEFAULT_CHAR_RATIO = 0.600;

export function getFont() {
    const raw = localStorage.getItem(FONT_KEY);
    if (raw) {
        const saved = JSON.parse(raw);
        return {
            size:   typeof saved.size   === 'number' ? saved.size   : DEFAULT_SIZE,
            family: typeof saved.family === 'string' ? saved.family : DEFAULT_FAMILY
        };
    } else return { size: DEFAULT_SIZE, family: DEFAULT_FAMILY };
}

export function saveFont(size, family) {
    try { localStorage.setItem(FONT_KEY, JSON.stringify({ size, family })); } catch {}
}
