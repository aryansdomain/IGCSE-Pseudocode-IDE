import { getFont, CHAR_RATIOS, DEFAULT_CHAR_RATIO } from '../../shared/font.js';

// width and height of text box
function measureText(text) {
    const { size, family } = getFont();
    const ratio = CHAR_RATIOS[family.toLowerCase()] ?? DEFAULT_CHAR_RATIO; // get character ratio
    const lines = text.split('\n');

    const w = lines.reduce((max, l) => Math.max(max, l.length * size * ratio), 0); // max width of each line
    const h = size * 1.5 * lines.length;
    return { w, h };
}

// dimensions of node containing text
export function getNodeDims(type, text) {
    const { w, h } = measureText(text);

    if (type === 'decision'  ) return { width: w     + 50, height: w/2 + h + 48 };
    if (type === 'io'        ) return { width: w     + 80, height:       h + 24 };
    if (type === 'terminator') return { width: w + h + 20, height:       h + 20 };
    if (type === 'process'   ) return { width: w     + 40, height:       h + 24 };
}
