import { h, RectNode, RectNodeModel } from 'https://esm.sh/@logicflow/core';
import { getNodeDims                } from './text.js';
import { getFont                    } from '../../shared/font.js';

// set node dimensions from text
function initNode(model, data, type) {
    const { width, height } = getNodeDims(type, data.text?.value ?? data.text);
    model.width  = width;
    model.height = height;
    if (model.text) {
        model.text.x = data.x;
        model.text.y = data.y;
    }
}

// apply user font settings
function makeTextStyle(       style) {
    const { size, family } = getFont();
    return { ...style, fontSize: size, fontFamily: family };
}
// red outline for a node when an error
function makeNodeStyle(model, style) {
    if (model.properties.error) {
        style.stroke = '#e5484d';
        style.strokeWidth = 3;
    }
    return style;
}

// process
export class ProcessView  extends RectNode {
    getShape() {
        const { model } = this.props;
        const { x, y, width, height } = model;
        const style = model.getNodeStyle();

        // rectangle
        return h('rect', { ...style, x: x - width/2, y: y - height/2, width, height });
    }
}
export class ProcessModel extends RectNodeModel {
    initNodeData(data) {
        super.initNodeData(data);
        initNode(this, data, 'process');
    }
    getTextStyle() { return makeTextStyle(      super.getTextStyle()); }
    getNodeStyle() { return makeNodeStyle(this, super.getNodeStyle()); }
}

// input/output
export class IOView  extends RectNode {
    getShape() {
        const { model } = this.props;
        const { x, y, width, height } = model;
        const style = model.getNodeStyle();

        // parallelogram
        const skew = 20;
        const l = x - width  / 2, r = x + width  / 2;
        const t = y - height / 2, b = y + height / 2;
        const points = `${l + skew},${t} ${r},${t} ${r - skew},${b} ${l},${b}`;
        return h('polygon', { ...style, points });
    }
}
export class IOModel extends RectNodeModel {
    initNodeData(data) {
        super.initNodeData(data);
        initNode(this, data, 'io');
    }
    getDefaultAnchor() {
        const { id, x, y, width, height } = this;
        const skew = 20;
        return [
            { x,                           y: y - height / 2, id: `${id}_0`, type: 'top'    },
            { x: x + width / 2 - skew / 2, y,                 id: `${id}_1`, type: 'right'  },
            { x,                           y: y + height / 2, id: `${id}_2`, type: 'bottom' },
            { x: x - width / 2 + skew / 2, y,                 id: `${id}_3`, type: 'left'   },
        ];
    }
    getTextStyle() { return makeTextStyle(      super.getTextStyle()); }
    getNodeStyle() { return makeNodeStyle(this, super.getNodeStyle()); }
}

// decision
export class DecisionView  extends RectNode {
    getShape() {
        const { model } = this.props;
        const { x, y, width, height } = model;
        const style = model.getNodeStyle();

        // diamond
        const points = `${x},${y - height/2} ${x + width/2},${y} ${x},${y + height/2} ${x - width/2},${y}`;
        return h('polygon', { ...style, points, strokeLinejoin: 'miter' });
    }
}
export class DecisionModel extends RectNodeModel {
    initNodeData(data) {
        super.initNodeData(data);
        initNode(this, data, 'decision');
    }
    getTextStyle() { return makeTextStyle(      super.getTextStyle()); }
    getNodeStyle() { return makeNodeStyle(this, super.getNodeStyle()); }
}

// terminator
export class TerminatorView  extends RectNode {
    getShape() {
        const { model } = this.props;
        const { x, y, width, height } = model;
        const style = model.getNodeStyle();

        // rounded rectangle
        return h('rect', {...style,
            x: x - width /  2,
            y: y - height / 2,
            rx: height / 2,
            ry: height / 2,
            width,
            height
        });
    }
}
export class TerminatorModel extends RectNodeModel {
    initNodeData(data) {
        super.initNodeData(data);
        initNode(this, data, 'terminator');
    }
    getTextStyle() { return makeTextStyle(      super.getTextStyle()); }
    getNodeStyle() { return makeNodeStyle(this, super.getNodeStyle()); }
}
