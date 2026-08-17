// background of the canvas
export const CANVAS_BG = { light: '#f6f8fa', dark: '#0f1117' };
// color of the grid
export const GRID      = { light: '#d0d7de', dark: '#2f2821' };

export function initMode(lf) {
    return function applyMode(mode) {
        // colors for each mode
        const light = mode === 'light';
        const bg       = light ? '#ffffff' : '#000000';
        const canvasBg = light ? CANVAS_BG.light : CANVAS_BG.dark;
        const stroke   = light ? '#57606a' : '#a89f95';
        const text     = light ? '#24292f' : '#dbd6d0';
        const grid     = light ? GRID.light : GRID.dark;

        lf.setTheme({
            baseEdge:  { stroke, strokeWidth: 1.5 },
            polyline:  { stroke, strokeWidth: 1.5 },
            rect:      { fill: bg, stroke },
            polygon:   { fill: bg, stroke },
            nodeText:  { color: text },
            edgeText:  { color: text, background: { fill: canvasBg, stroke: 'none', radius: 3 } },
        });

        lf.graphModel.updateGridOptions({ config: { color: grid } });
    };
}
