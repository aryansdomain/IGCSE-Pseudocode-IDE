import { initError, setCurrentLineNum, assertBool, throwErr } from '../../code/runtime/interpreter/error.js';
import { globalScope, initScope }                             from '../../code/runtime/interpreter/scope.js';
import { evalExpr }                                           from '../../code/runtime/interpreter/expressions.js';
import { runCode }                                            from '../../code/runtime/interpreter/execute.js';
import { getStringInputs }                                  from '../../shared/infer.js';
import { validate }                                           from './validate.js';

const MAX_STEPS = 10000000;

// format a literal to pseudocode guidelines
function formatLiteral(value, type) {
    type = String(type).toUpperCase();
    if (type === 'INTEGER' || type === 'REAL') return String(value).trim();               // number
    if (type === 'BOOLEAN')                    return String(value).trim().toUpperCase(); // boolean
    return JSON.stringify(String(value));                                                 // string
}

// turn a process/io node's text into { lineNum, text } lines for runCode
function nodeLines(node) {
    const raw = (node.text?.value ?? '').trim().split('\n');

    let texts;
    if (node.type === 'io') {
        // join continuation lines (not starting with INPUT/OUTPUT) onto the previous line.
        // with no previous line to join to, keep the line so the interpreter reports it
        // rather than dropping it (validate rejects these charts before they get here)
        texts = [];
        for (const line of raw) {
            const text = line.trim();
            if (!texts.length || /^(INPUT|OUTPUT)\b/i.test(text)) texts.push(text);
            else texts[texts.length - 1] += ' ' + text;
        }
    } else {
        texts = raw;
    }

    return texts.map((text, i) => ({ lineNum: i + 1, text }));
}

// strip a leading IS and trailing ? from a decision condition
function decisionCond(node) {
    return (node.text?.value ?? '').replace(/\s+/g, ' ').trim().replace(/^IS\s+|\?$/gi, '').trim();
}

// Collect every statement line in the chart (decisions stripped of IS/?).
function statementLines(graph) {
    const lines = [];
    for (const n of graph.nodes) {
        if (n.type === 'terminator') continue;
        if (n.type === 'decision') lines.push(decisionCond(n));
        // through nodeLines, not split('\n') directly: an io node may wrap one statement
        // over several lines, and splitting it raw hands on a fragment rather than a
        // statement — `OUTPUT "L = ", L, " S = ",` with its comma left dangling. that is
        // what the run itself executes, so scanning anything else here means the columns
        // and the string inference are drawn from text the run never sees
        else for (const { text } of nodeLines(n)) lines.push(text);
    }
    return lines;
}

// The chart is executed directly (runGraph), not translated to pseudocode. This
// validates the structure and returns a flat statement dump for the trace table
// to scan (getVars) when working out which columns to show.
export function getCode(flowchart) {
    const nodes = flowchart.nodes;
    const inEdgeMap  = new Map(nodes.map(n => [n.id, []]));
    const outEdgeMap = new Map(nodes.map(n => [n.id, []]));
    for (const e of flowchart.edges) {
        inEdgeMap.get(e.targetNodeId)?.push(e);
        outEdgeMap.get(e.sourceNodeId)?.push(e);
    }

    validate(nodes, inEdgeMap, outEdgeMap); // ensure structure is correct

    return { code: statementLines(flowchart).join('\n') };
}

// DFS retreating-edge detection — works for any directed graph, reducible or not.
// edge u->v is a back-edge when v is still on the DFS stack (gray) when reached.
// walked with an explicit stack rather than recursion, so a long chart cannot exhaust
// the call stack (the recursive form threw RangeError past ~10,000 nodes)
function findBackEdges(startId, outEdgeMap) {
    const GRAY = 1, BLACK = 2;
    const color = new Map();
    const backEdges = new Set();

    // a frame holds a node's outgoing edges and how far through them the walk is.
    // a node stays GRAY while its frame is on the stack, exactly as in the recursion
    const stack = [{ id: startId, edges: outEdgeMap.get(startId) ?? [], next: 0 }];
    color.set(startId, GRAY);

    while (stack.length) {
        const frame = stack[stack.length - 1];

        // every edge followed: the node is finished
        if (frame.next >= frame.edges.length) {
            color.set(frame.id, BLACK);
            stack.pop();
            continue;
        }

        const edge = frame.edges[frame.next++];
        const v = edge.targetNodeId;
        const c = color.get(v);

        if      (c === GRAY)      backEdges.add(edge); // retreating edge
        else if (c === undefined) {
            color.set(v, GRAY);
            stack.push({ id: v, edges: outEdgeMap.get(v) ?? [], next: 0 });
        }
    }

    return backEdges;
}

function computeRowBreakEdges(backEdges, nodeMap) {
    const rowBreakEdges = new Set();
    for (const e of backEdges) {
        if (nodeMap.get(e.targetNodeId)?.type !== 'decision') rowBreakEdges.add(e);
    }
    return rowBreakEdges;
}

// execute a flowchart graph directly by walking its edges, using the interpreter
// only to run each node's flat statements / evaluate each decision's condition.
export async function runGraph(graph, arraySpecs = []) {
    const nodeMap    = new Map(graph.nodes.map(n => [n.id, n ]));
    const outEdgeMap = new Map(graph.nodes.map(n => [n.id, []]));
    for (const e of graph.edges) outEdgeMap.get(e.sourceNodeId)?.push(e);

    initScope();

    // prelude:
    //  - declare INPUT'd scalars used as strings (DECLARE emits no messages), so
    //    INPUT doesn't coerce numeric-looking text into a number
    //  - declare + seed arrays, emitting the seed `variable` messages the trace
    //    table skips via seedSkip (one per non-empty row-0 array cell)
    const arrayDeclares = arraySpecs.map(
        ({ name, lower, upper, type }) => `DECLARE ${name} : ARRAY[${lower}:${upper}] OF ${String(type).toUpperCase()}`
    );

    const preludeLines = [];
    // infer over the chart's statements (with array DECLAREs prepended so STRING
    // arrays are recognised) to type INPUT'd scalars used as strings
    for (const name of getStringInputs([...arrayDeclares, ...statementLines(graph)])) {
        preludeLines.push(`DECLARE ${name} : STRING`);
    }
    arraySpecs.forEach(({ name, lower, upper, type, vals = [] }, i) => {
        preludeLines.push(arrayDeclares[i]);
        const isString = String(type).toUpperCase() === 'STRING';
        vals.forEach((val, idx) => {
            if (val == null) return;
            if (!isString && !String(val).trim()) return; // blank non-string cell: leave uninitialized
            // a blank STRING cell seeds as "" (matches countSeedCells in run.js)
            preludeLines.push(`${name}[${lower + idx}] <- ${formatLiteral(val, type)}`);
        });
    });
    if (preludeLines.length) {
        const lines = preludeLines.map((text, i) => ({ lineNum: i + 1, text }));
        initError(lines);
        await runCode(globalScope, lines);
    }

    const start = graph.nodes.find(n => n.type === 'terminator' && /^START$/i.test(n.text?.value ?? ''));
    if (!start) throwErr('TerminatorError', 'no START terminator present');

    const backEdges     = findBackEdges(start.id, outEdgeMap);
    const rowBreakEdges = computeRowBreakEdges(backEdges, nodeMap);

    // a loop boundary that needs a new trace row has been crossed, and the row is owed
    // to the node the edge lands on — taken once that node has finished, not before it
    // starts. see the note where it is paid, below
    let rowOwed = false;

    function follow(edge) {
        if (rowBreakEdges.has(edge)) rowOwed = true;
        return edge.targetNodeId;
    }

    let cur = outEdgeMap.get(start.id)[0]?.targetNodeId ?? null;
    let steps = 0;

    while (cur != null) {
        if (++steps > MAX_STEPS) throwErr('Error', 'execution exceeded the maximum number of steps');

        const node = nodeMap.get(cur);
        if (!node) break;
        const outs = outEdgeMap.get(cur) ?? [];

        // the row this node owes, claimed before it runs so that the edge it leaves by can
        // owe the next one without the two being confused for each other
        const breakAfter = rowOwed;
        rowOwed = false;

        // announce the node the boundary is owed to before it runs. a node that overwrites
        // a variable already traced on the current row opens a row by itself, which draws
        // the same boundary — the trace table needs the node's extent to tell that apart
        // from a row it opened earlier in the iteration, and spend only one row either way.
        // resent for every node of a deferred run (below); the trace table takes the first
        if (breakAfter) self.postMessage({ type: 'iteration_start' });

        try {
            switch (node.type) {
                case 'terminator': // STOP has no outgoing edge
                    cur = outs.length ? follow(outs[0]) : null;
                    break;

                case 'process':
                case 'io': {
                    const lines = nodeLines(node);
                    initError(lines);
                    await runCode(globalScope, lines);
                    cur = follow(outs[0]);
                    break;
                }

                case 'decision': {
                    const cond = decisionCond(node);
                    initError([{ lineNum: 1, text: cond }]);
                    setCurrentLineNum(1);
                    const val = await evalExpr(globalScope, cond, 0, cond);
                    assertBool('condition', val, cond);

                    const label = val ? 'YES' : 'NO';
                    const edge = outs.find(e => e.text?.value === label);
                    if (!edge) throwErr('EdgeError', `decision must have a ${label} edge`);
                    cur = follow(edge);
                    break;
                }

                default:
                    cur = outs.length ? follow(outs[0]) : null;
            }
        } catch (e) {
            if (e && e.nodeId == null) e.nodeId = node.id;
            throw e;
        }

        // a run of io nodes is one read as far as the trace table is concerned: a loop head
        // written as INPUT X then INPUT Y over two nodes should trace like the same two
        // statements sharing one node, so the boundary waits until the run is over rather
        // than falling between them and splitting the read across two rows
        if      (breakAfter && node.type === 'io' && nodeMap.get(cur)?.type === 'io' && !rowOwed) rowOwed = true;
        else if (breakAfter) self.postMessage({ type: 'iteration' });
    }
}
