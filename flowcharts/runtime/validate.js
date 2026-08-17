function format(e) {
    return `${e.type}: ${e.message}`;
}

function throwErr(type, message, nodeId = null, reason = '') {
    const e = new Error(message);
    e.type    = type;
    e.message = message;
    e.nodeId  = nodeId;
    e.reason  = reason;
    e.formatted = format(e);
    throw e;
}

// ensures flowchart structure is all correct
// throws an Error if problem is found
export function validate(nodes, inEdges, outEdges) {
    const terminators = nodes.filter(n => n.type === 'terminator');
    const starts      = terminators.filter(n =>      /^START$/i.test(n.text?.value));
    const stops       = terminators.filter(n => /^(STOP|END)$/i.test(n.text?.value));

    // number of terminators
    if (starts.length === 0) throwErr('TerminatorError', 'no START terminator present',            null, 'no_start'      );
    if (starts.length   > 1) throwErr('TerminatorError', 'more than one START terminator present', null, 'multiple_start');
    if (stops.length  === 0) throwErr('TerminatorError', 'no STOP terminator present',             null, 'no_stop'       );

    // each node check
    for (const node of nodes) {
        const outs = outEdges.get(node.id) ?? [];
        const text = node.text?.value ?? ''; // a node with no text has no text key at all

        // no text
        if (!text.trim())                               throwErr('NodeError', 'node has no text',             node.id, 'node_no_text'); // no text
        if (outs.some(e => e.targetNodeId === node.id)) throwErr('EdgeError', 'node must not lead to itself', node.id, 'self_loop'   ); // leads to itself

        if (node.type === 'terminator') {
                   if (     /^START$/i.test(text)) {
                if (outs.length !== 1)           throwErr('EdgeError', 'START must have exactly one outgoing edge', node.id, 'start_edges'   );
                if (inEdges.get(node.id).length) throwErr('EdgeError', 'START must not have an incoming edge',      node.id, 'start_incoming');
            } else if (/^(STOP|END)$/i.test(text)) {
                // no outgoing edges
                if (outs.length > 0) throwErr('EdgeError', 'STOP must not have an outgoing edge', node.id, 'stop_outgoing');
            } else {
                // invalid label
                throwErr('TerminatorError', 'invalid label', node.id, 'bad_terminator_label');
            }

        } else if (node.type === 'decision') {
            // decision
            if (!outs.some(e => e.text?.value === 'YES')) throwErr('EdgeError', 'decision must have a YES edge',                     node.id, 'decision_no_yes'  );
            if (!outs.some(e => e.text?.value === 'NO' )) throwErr('EdgeError', 'decision must have a NO edge',                      node.id, 'decision_no_no'   );
            if ( outs.length > 2)                         throwErr('EdgeError', 'decision cannot have more than two outgoing edges', node.id, 'decision_too_many');

            // no edge cannot be labeled no
            for (const e of outs) {
                if (e.text?.value !== 'YES' && e.text?.value !== 'NO') throwErr('EdgeError', 'decision edges must be labelled YES or NO', node.id, 'decision_bad_label');
            }

            // no two edges can share the same label
            const yesCount = outs.filter(e => e.text?.value === 'YES').length;
            const noCount  = outs.filter(e => e.text?.value === 'NO' ).length;
            if (yesCount > 1 || noCount > 1) throwErr('EdgeError', 'decision edges must have unique labels', node.id, 'decision_dup_label');

        } else {
            // process, io
            if (outs.length !== 1) throwErr('EdgeError', 'node must have exactly one outgoing edge', node.id, 'node_edges');

            // io node must tart with I/O
            if (node.type === 'io' && !/^(INPUT|OUTPUT)\b/i.test(text.trim()))
                throwErr('NodeError', 'input/output node must start with INPUT or OUTPUT', node.id, 'io_needs_input_output');
        }
    }

    // find nodes reachable from start
    const reachable = new Set();
    const queue = [starts[0].id];
    while (queue.length) {
        const cur = queue.shift();
        if (reachable.has(cur)) continue; reachable.add(cur);
        for (const e of outEdges.get(cur)) queue.push(e.targetNodeId);
    }
    // some node is unreachable
    for (const node of nodes) {
        if (!reachable.has(node.id)) throwErr('NodeError', 'node must be reachable from START', node.id, 'unreachable');
    }
}