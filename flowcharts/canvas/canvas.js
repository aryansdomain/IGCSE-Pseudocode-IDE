import LogicFlow    from 'https://esm.sh/@logicflow/core';
import { Snapshot } from 'https://esm.sh/@logicflow/extension'; LogicFlow.use(Snapshot);

import { getNodeDims } from './text.js';
import { GRID        } from './mode.js';
import { getFont     } from '../../shared/font.js';
import { ProcessView,    ProcessModel,
         IOView,         IOModel,
         DecisionView,   DecisionModel,
         TerminatorView, TerminatorModel } from './nodes.js';

export function initCanvas(container, onSave) {
    // init LogicFlow
    const lf = new LogicFlow({
        container,
        width:  container.clientWidth  || window.innerWidth,
        height: container.clientHeight || window.innerHeight,
        grid: { config: { color: document.documentElement.classList.contains('light') ? GRID.light : GRID.dark } },
        snapGrid: false,
        edgeTextEdit: true,
        adjustEdgeMiddle: true,
        keyboard: { enabled: true }
    });
    lf.setTheme({ rect: { radius: 0 } });
    // add nodes
    lf.register({ type: 'process',    view: ProcessView,    model: ProcessModel    });
    lf.register({ type: 'io',         view: IOView,         model: IOModel         });
    lf.register({ type: 'decision',   view: DecisionView,   model: DecisionModel   });
    lf.register({ type: 'terminator', view: TerminatorView, model: TerminatorModel });

    // resize a node
    function resize() {
        const { size, family } = getFont();
        lf.setTheme({ inputText: { fontFamily: family, fontSize: `${size}px` } });

        // update dimensions
        lf.graphModel.nodes.forEach(model => {
            const { width, height } = getNodeDims(model.type, model.text.value);
            model.width  = width;
            model.height = height;
        });
        reconnectEdges();
    }

    // update edge positioning
    function reconnectEdges() {
        lf.graphModel.edges.forEach(edge => {
            const points = edge.pointsList.map(p => ({ x: p.x, y: p.y })); // edge points

            // get source and target anchors
            const src = lf.getNodeModelById(              edge.sourceNodeId);
            const tar = lf.getNodeModelById(              edge.targetNodeId);
            const srcAnc = src.anchors.find(a => a.id === edge.sourceAnchorId);
            const tarAnc = tar.anchors.find(a => a.id === edge.targetAnchorId);

            // rewrite points list with anchors
            if (srcAnc) { points[0                ] = { x: srcAnc.x, y: srcAnc.y }; edge.startPoint = { x: srcAnc.x, y: srcAnc.y }; }
            if (tarAnc) { points[points.length - 1] = { x: tarAnc.x, y: tarAnc.y }; edge.endPoint   = { x: tarAnc.x, y: tarAnc.y }; }

            edge.pointsList = points;
            edge.initPoints();
        });
    }

    // save on graph change
    let saveTimeout = null;
    lf.on('history:change', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => onSave(), 300);
    });

    // resize node to fit text after edit
    lf.on('text:update', ({ data }) => {
        // edge label edited: if decision, only accept yes or no
        const edge = lf.getEdgeModelById(data.id);
        if (edge) {
            const node = lf.getNodeModelById(edge.sourceNodeId);
            if (node.type !== 'decision') { if (data.text) edge.updateText(''); return; } // non-decision: reject

            const trimmed = String(data.text).trim().toUpperCase();
            const label = (trimmed === 'YES' || trimmed === 'NO') ? trimmed : edge.getProperties().label; // revert to original if rejected
            if (!label) return; // nothing valid to revert to: leave the label as it is

            edge.setProperties({ label });
            if (label !== data.text) edge.updateText(label);
            return;
        }

        const model = lf.getNodeModelById(data.id);
        if (!model) return;

        // update dimensions
        const { width, height } = getNodeDims(model.type, data.text);
        model.width  = width;
        model.height = height;

        reconnectEdges();
    });

    // node edge limits, autolabel decision edges
    lf.on('edge:add', ({ data }) => {
        const node = lf.getNodeModelById(data.sourceNodeId);
        const decision = node?.type === 'decision';
        const outs = lf.graphModel.edges.filter(e => e.sourceNodeId === data.sourceNodeId && e.id !== data.id);

        // edge limits
        if ((!decision && outs.length >= 1) || (decision && outs.length >= 2)) {
            lf.graphModel.deleteEdgeById(data.id);
            return;
        }

        // label decision edges, and record the label so a rejected edit can revert to it.
        // a pasted edge arrives with text already, so take that when it is valid
        if (decision) {
            // edge data carries text as { value, x, y }, a plain string only when set by hand
            const text  = typeof data.text === 'string' ? data.text : data.text?.value;
            const given = String(text ?? '').trim().toUpperCase();
            const label = (given === 'YES' || given === 'NO')
                ? given
                : outs.map(e => e.text.value).includes('YES') ? 'NO' : 'YES'; // if already has yes, then no, otherwise yes

            const edge = lf.graphModel.getEdgeModelById(data.id);
            if (edge.text?.value !== label) edge.updateText(label);
            edge.setProperties({ label });
        }

        // only decision edges can have the edge edited
        setEdgeEditable(lf.graphModel.getEdgeModelById(data.id), decision);
    });

    // restrict edge editing to decision edges
    function setEdgeEditable(edge, editable) {
        if (edge.text) edge.text.editable = editable;
    }
    lf.on('graph:rendered', () => {
        lf.graphModel.edges.forEach(edge => {
            const decision = lf.getNodeModelById(edge.sourceNodeId)?.type === 'decision';
            setEdgeEditable(edge, decision);

            // a saved chart stores an edge's label as text only, so mirror it into
            // properties: without it a rejected edit has nothing to revert to
            if (decision && !edge.getProperties().label && edge.text?.value) {
                edge.setProperties({ label: edge.text.value });
            }
        });
    });

    // ------------------------ Error Highlighting ------------------------

    let errorNodeId, popover;

    // the red outline is a flag on the node's properties, because that is what the custom
    // node style reads — but properties are part of the chart, and the chart is saved.
    // so flagging a node wrote the outline into storage, and it came back on the next load
    // as an ordinary part of the drawing: permanently red, and unclearable, because the
    // one thing that knows how to clear it is the id below, which belongs to the session
    // that set it and is empty in the session that loads it. clicking away, running again,
    // fixing the node — none of them could touch it.
    //
    // stripped on the way out, so what reaches storage is only ever the chart. this wraps
    // getGraphData rather than filtering at the call sites because saving is not the only
    // way out: the file list, the export, and the issue report all serialize the graph
    // themselves, and each is the same leak
    const graphData = lf.getGraphData.bind(lf);
    lf.getGraphData = (...args) => {
        const data = graphData(...args);
        for (const node of data?.nodes ?? []) {
            if (!node.properties || !('error' in node.properties)) continue;
            const { error, ...rest } = node.properties;
            node.properties = rest;
        }
        return data;
    };

    // charts already saved carrying the flag heal on load: anything outlined that this
    // session did not outline itself is left over from that bug and is cleared
    lf.on('graph:rendered', () => {
        for (const node of lf.graphModel.nodes) {
            if (node.properties?.error && node.id !== errorNodeId) lf.setProperties(node.id, { error: false });
        }

        // the chart the flagged node belonged to is no longer the one on screen — another
        // file has been opened. its popover is still sitting over the canvas, pointing at
        // a node that is not there, and only a click would have taken it away
        if (errorNodeId && !lf.getNodeModelById(errorNodeId)) clearHighlight();
    });

    let popoverFrame = null;

    // the popover was placed once, from the node's position at the moment it errored, and
    // never touched again — so panning the canvas, zooming, or dragging the node itself
    // (all of which move the node's screen position without ever calling highlightNode
    // again) left it pointing at wherever the node used to be. re-run every frame instead,
    // for as long as a popover is showing, so it is never more than one frame stale
    // regardless of which of those moved it, or whether LogicFlow fires an event for that
    // particular kind of move at all — the model's own x/y is a plain object property,
    // not something an event has to announce
    function positionPopover() {
        if (!popover || !errorNodeId) return;
        const model = lf.getNodeModelById(errorNodeId);
        if (!model) return; // the graph:rendered handler above clears this case; nothing to place meanwhile

        const tm = lf.graphModel.transformModel;

        // zoom scale, read the same way the position itself is: through the canvas -> html
        // transform this popover is already placed with, rather than reaching for whatever
        // internal field happens to hold it this version. two points a known canvas
        // distance apart land a screen distance apart in the same ratio; that ratio is the
        // scale, however the library represents it internally
        const p1 = tm.CanvasPointToHtmlPoint([model.x,       model.y]);
        const p2 = tm.CanvasPointToHtmlPoint([model.x + 100, model.y]);
        const scale = (p2[0] - p1[0]) / 100;

        // anchored to the node's bottom edge rather than its center, so the gap the CSS
        // transform leaves below it reads the same at every node height
        const [hx, hy] = tm.CanvasPointToHtmlPoint([model.x, model.y + model.height / 2]);
        popover.style.left = `${hx}px`;
        popover.style.top  = `${hy}px`;

        // the box's own width used to be a flat 280px no matter the node, which read as
        // arbitrary next to a small terminator and wrapped awkwardly next to a wide
        // process box. tied to the node's rendered width instead; the CSS min/max on the
        // class are what keep a one-pixel-wide node from producing a one-pixel-wide box
        popover.style.width = `${Math.round(model.width * scale)}px`;

        popoverFrame = requestAnimationFrame(positionPopover);
    }

    function clearHighlight() {
        if (popoverFrame != null) { cancelAnimationFrame(popoverFrame); popoverFrame = null; }

        // remove errored node
        if (errorNodeId) {
            lf.setProperties(errorNodeId, { error: false });
            errorNodeId = null;
        }

        // remove popover
        popover?.remove();
        popover = null;
    }

    // outline a node red and show a popover with the error message
    function highlightNode(id, message) {
        clearHighlight();
        const model = lf.getNodeModelById(id);
        if (!model) return;

        // set errored node
        errorNodeId = id;
        lf.setProperties(id, { error: true });

        // add popover
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        popover = document.createElement('div');
        popover.className = 'flowchart-error-popover';
        const r = message.match(/^[A-Za-z]*Error:.*$/m); // line with "Error:"
        popover.textContent = r ? r[0] : message;
        container.appendChild(popover);

        positionPopover();
    }

    // clear highlight on canvas interaction
    container.addEventListener('mousedown', clearHighlight);

    return { lf, resize, reconnectEdges, highlightNode, clearHighlight, getGraphData: () => lf.getGraphData() };
}
