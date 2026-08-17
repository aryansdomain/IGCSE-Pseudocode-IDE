const ROW_GAP = 60; // vertical space between rows, beyond node height
const COL_GAP = 60; // minimum horizontal space between nodes in the same row
const RELAX_ITERATIONS = 200; // barycenter passes; stops early once the layout settles
const STUB = 35; // pixels to extend outside node before turning

export function initArrange({ arrangeBtn, lf, resize, save }) {
    arrangeBtn.addEventListener('click', () => {
        const moved = arrange(lf);
        resize();
        save();

        try {
            window.flowchart_arranged && window.flowchart_arranged({
                flowchart_arranged_size:  lf.graphModel.nodes.length,
                flowchart_arranged_moved: moved
            });
        } catch {}
    });
}

// DFS retreating-edge detection, walked with an explicit stack (same technique as
// runtime/graph.js's findBackEdges, kept independent since this runs on the canvas
// model, not the flowchart data shape). also returns the set of ids reached, so a
// single traversal answers both "which edges are loop-backs" and "what's reachable"
function walkFromStart(startId, outEdges) {
    const GRAY = 1, BLACK = 2;
    const color = new Map([[startId, GRAY]]);
    const backEdges = new Set();
    const stack = [{ id: startId, edges: outEdges.get(startId) ?? [], next: 0 }];

    while (stack.length) {
        const frame = stack[stack.length - 1];
        if (frame.next >= frame.edges.length) { color.set(frame.id, BLACK); stack.pop(); continue; }

        const edge = frame.edges[frame.next++];
        const c = color.get(edge.target);
        if      (c === GRAY)      backEdges.add(edge);
        else if (c === undefined) { color.set(edge.target, GRAY); stack.push({ id: edge.target, edges: outEdges.get(edge.target) ?? [], next: 0 }); }
    }
    return { reachable: new Set(color.keys()), backEdges };
}

// each reachable node's row: the length of the LONGEST path to it from START along
// forward edges only (loop-back edges excluded, so a loop body gets one row per
// pass through it rather than being folded onto its header's row). forward edges
// restricted to the reachable set are guaranteed acyclic (removing a DFS's back
// edges always yields a DAG on the reachable nodes), so Kahn's algorithm can't loop
function computeRows(startId, reachable, forwardOut) {
    const inDegree = new Map([...reachable].map(id => [id, 0]));
    for (const id of reachable) {
        for (const v of forwardOut.get(id)) inDegree.set(v, inDegree.get(v) + 1);
    }

    const row   = new Map([[startId, 0]]);
    const queue = [...reachable].filter(id => inDegree.get(id) === 0);
    while (queue.length) {
        const u = queue.shift();
        for (const v of forwardOut.get(u)) {
            row.set(v, Math.max(row.get(v) ?? 0, (row.get(u) ?? 0) + 1));
            inDegree.set(v, inDegree.get(v) - 1);
            if (inDegree.get(v) === 0) queue.push(v);
        }
    }
    return row;
}

// group nodes that lie on an unambiguous straight run into one rigid block: A joins B
// when A's only forward successor is B AND B's only forward predecessor is A. Every
// node in a block is given the exact same x, so a straight run of statements comes out
// perfectly straight rather than merely close — averaging alone can approach alignment
// but never actually reach it, which is why edges kept a slight bend before
function buildBlocks(reachable, forwardOut, forwardIn) {
    const parent = new Map([...reachable].map(id => [id, id]));
    const find = (id) => {
        let root = id;
        while (parent.get(root) !== root) root = parent.get(root);
        while (parent.get(id) !== root) { const next = parent.get(id); parent.set(id, root); id = next; }
        return root;
    };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

    for (const id of reachable) {
        const succ = forwardOut.get(id) ?? [];
        if (succ.length !== 1) continue;                    // a branch point anchors nothing
        const next = succ[0];
        if ((forwardIn.get(next) ?? []).length !== 1) continue; // a merge point anchors nothing
        union(id, next);
    }
    return find;
}

// place each block's column so that connected blocks line up, then pull apart anything
// that would overlap inside a row. blocks move rigidly, so straight runs stay straight
function layoutBlocks({ reachable, rows, rowCenterY, width, height, x0, edgeList, find,
                       costNodes = null, costEdges = null, fixed = new Set(), swaps = new Set() }) {
    const blockNodes = new Map(); // block -> its node ids
    for (const id of reachable) {
        const b = find(id);
        if (!blockNodes.has(b)) blockNodes.set(b, []);
        blockNodes.get(b).push(id);
    }

    const rowEntries = new Map(); // row -> [{ block, id }], one entry per node in that row
    for (const id of reachable) {
        const r = rows.get(id);
        if (!rowEntries.has(r)) rowEntries.set(r, []);
        rowEntries.get(r).push({ block: find(id), id });
    }

    const neighbors = new Map([...blockNodes.keys()].map(b => [b, []]));
    for (const { source, target } of edgeList) {
        const a = find(source), b = find(target);
        if (a === b) continue; // an edge inside a block is already straight
        neighbors.get(a).push(b);
        neighbors.get(b).push(a);
    }

    // start each block at the average of where its members already are
    const x = new Map();
    for (const [b, ids] of blockNodes) x.set(b, ids.reduce((sum, id) => sum + x0.get(id), 0) / ids.length);

    // one left-to-right order for the whole drawing, ranked by where each block starts,
    // fixed before solving and never re-derived from the moving positions.
    //
    // it has to be a total order over BLOCKS rather than a per-row order over nodes.
    // ordering each row independently can demand P left of Q in one row and Q left of P
    // in another — impossible to satisfy at once, since a block holds a single x — and
    // enforcement then shoves the two apart forever. ranking blocks makes every row's
    // order a slice of the same order, so the constraints are always jointly satisfiable
    const blockRank = new Map([...blockNodes.keys()]
        .sort((a, b) => x.get(a) - x.get(b))
        .map((b, i) => [b, i]));

    // taking that order straight from where the nodes happen to sit means it is never
    // questioned: a node drawn on the wrong side of its row stays there however much
    // tidier the other side would be. the caller hands back pairs to exchange so the
    // orderings can be compared like anything else
    for (const pair of swaps) {
        const [a, b] = pair.split('|');
        if (!blockRank.has(a) || !blockRank.has(b)) continue;
        const ra = blockRank.get(a);
        blockRank.set(a, blockRank.get(b));
        blockRank.set(b, ra);
    }
    for (const entries of rowEntries.values()) entries.sort((p, q) => blockRank.get(p.block) - blockRank.get(q.block));

    for (let pass = 0; pass < RELAX_ITERATIONS; pass++) {
        let maxShift = 0;

        // pull every block toward the average column of the blocks it connects to
        for (const [b, list] of neighbors) {
            if (!list.length) continue;
            const before = x.get(b);
            x.set(b, list.reduce((sum, other) => sum + x.get(other), 0) / list.length);
            maxShift = Math.max(maxShift, Math.abs(x.get(b) - before));
        }

        // resolve overlaps within each row. a block can appear in several rows, so the
        // corrections it receives are averaged and applied to the block as a whole
        const delta = new Map(), count = new Map();
        for (const sorted of rowEntries.values()) {
            if (sorted.length < 2) continue;

            const desired = sorted.map(e => x.get(e.block));
            const placed  = [...desired];
            for (let i = 1; i < placed.length; i++) {
                const gap = width.get(sorted[i - 1].id) / 2 + COL_GAP + width.get(sorted[i].id) / 2;
                if (placed[i] < placed[i - 1] + gap) placed[i] = placed[i - 1] + gap;
            }

            // spreading a row only ever pushes rightward, which quietly walks the whole
            // drawing to the right over successive rows. re-centering on where the row
            // wanted to be cancels that bias while leaving the gaps just opened intact
            let shift = 0;
            for (let i = 0; i < placed.length; i++) shift += desired[i] - placed[i];
            shift /= placed.length;

            for (let i = 0; i < placed.length; i++) {
                const b = sorted[i].block;
                delta.set(b, (delta.get(b) ?? 0) + (placed[i] + shift - x.get(b)));
                count.set(b, (count.get(b) ?? 0) + 1);
            }
        }
        for (const [b, d] of delta) {
            const shift = d / count.get(b);
            x.set(b, x.get(b) + shift);
            maxShift = Math.max(maxShift, Math.abs(shift));
        }

        // settled: keep going only while something is still meaningfully moving, so the
        // result is a fixed point and pressing Arrange twice doesn't drift the chart
        if (maxShift < 0.01) break;
    }

    // a block spans several rows, so the averaged corrections above satisfy each row's
    // spacing only approximately and can leave real overlaps behind. this final pass
    // enforces the gaps outright; clearing one row can crowd another, so it repeats
    // until nothing needs moving
    for (let round = 0; round < 20; round++) {
        let changed = false;
        for (const sorted of rowEntries.values()) {
            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1], cur = sorted[i];
                const gap  = width.get(prev.id) / 2 + COL_GAP + width.get(cur.id) / 2;
                const minX = x.get(prev.block) + gap;
                if (x.get(cur.block) < minX - 0.01) { x.set(cur.block, minX); changed = true; }
            }
        }
        if (!changed) break;
    }

    // where the solver settled before any cost-driven nudging. refinement is measured
    // against this, so a block can sidestep an obstacle but never wander off: each round
    // otherwise steps a little further from the last, and a few rounds of that carries a
    // node hundreds of pixels away from the drawing it belongs to
    const settled = new Map(x);
    const widest  = Math.max(0, ...[...width.values()]);
    const MAX_SIDESTEP = widest + 2 * COL_GAP;

    // a candidate column is only allowed if it still clears the spacing either side of
    // every row the block sits in, which also keeps the fixed left-to-right order intact
    const canSitAt = (block, candidate) => {
        if (Math.abs(candidate - settled.get(block)) > MAX_SIDESTEP) return false;
        for (const sorted of rowEntries.values()) {
            const i = sorted.findIndex(e => e.block === block);
            if (i === -1) continue;
            if (i > 0) {
                const prev = sorted[i - 1];
                const gap  = width.get(prev.id) / 2 + COL_GAP + width.get(sorted[i].id) / 2;
                if (candidate < x.get(prev.block) + gap - 0.01) return false;
            }
            if (i < sorted.length - 1) {
                const next = sorted[i + 1];
                const gap  = width.get(sorted[i].id) / 2 + COL_GAP + width.get(next.id) / 2;
                if (candidate > x.get(next.block) - gap + 0.01) return false;
            }
        }
        return true;
    };

    // ---- cost-driven refinement ----
    //
    // everything above is heuristic. this last stage scores the drawing outright and only
    // keeps a move that measurably improves the score, so each term is optimised rather
    // than hoped for. only the terms a block actually touches are compared before/after:
    // every other term is unchanged by the move, so the comparison is equivalent to
    // scoring the whole drawing but cheap enough to run per candidate
    // the score is taken over the drawing the reader actually sees — the real nodes and
    // real edges — even though the layout above also arranges the reserved lanes
    const cost = costModel({
        blockNodes, neighbors, rowEntries, rows, rowCenterY, width, height, find, x,
        nodeIds:   costNodes ?? [...blockNodes.values()].flat(),
        edgeList:  costEdges ?? edgeList
    });

    const byDegree = [...blockNodes.keys()]
        .filter(b => !fixed.has(b))
        .sort((a, b) => (neighbors.get(b) ?? []).length - (neighbors.get(a) ?? []).length);
    for (let round = 0; round < 6; round++) {
        let improved = false;
        for (const b of byDegree) {
            const current = x.get(b);

            // aligning with a neighbour is what straightens an edge, so those columns are
            // the candidates worth trying, plus the average as a compromise position, plus
            // any column that would step clear of an overlap this block is caught in
            const near = [...new Set(neighbors.get(b) ?? [])].map(o => x.get(o));
            if (near.length) near.push(near.reduce((s, v) => s + v, 0) / near.length);

            let bestX = current, bestCost = cost.around(b);
            for (const candidate of near) {
                if (Math.abs(candidate - current) < 0.01 || !canSitAt(b, candidate)) continue;
                x.set(b, candidate);
                const score = cost.around(b);
                if (score < bestCost - 1e-6) { bestCost = score; bestX = candidate; }
            }
            x.set(b, bestX);
            if (Math.abs(bestX - current) > 0.01) improved = true;
        }
        if (!improved) break; // a strict improvement each time means this always terminates
    }

    return x;
}

// how good is a drawing? lower is better.
//
//   overlaps     nodes sitting on top of each other, or an edge cutting through a node
//   crossings    two edges crossing over one another
//   notStraight  a flat charge per edge that is not exactly vertical
//   bend         how far a bent edge's ends differ in x
//   length       total edge length as vertical + horizontal distance, so the rectangle
//                each edge spans has the smallest perimeter it can
//   perimeter    the bounding box around the whole drawing, keeping it compact
//
// the weights are ordered by how much each one hurts to look at: an overlap ruins a chart,
// a crossing is bad, a bent edge is untidy, and length only breaks ties between the rest.
//
// notStraight is charged separately from bend because summed bend alone has no preference
// between two edges bent a little and one edge straight with another bent twice as far —
// the totals match. the flat charge is what makes landing exactly on a neighbour's column,
// and so drawing a genuinely straight line, worth more than shaving pixels off two
const W_OVERLAP     = 100000;
const W_CROSSING    = 90000; // a crossing is nearly as bad to read as an overlap
const W_NOT_STRAIGHT = 500;
const W_BEND        = 10;
const W_LENGTH      = 1;
const W_PERIMETER   = 1;

// a corner in a drawn route. length alone cannot stand in for this: a jog around a node
// that has drifted a few pixels out of line costs only twice that drift in length, so
// anything at all — a repair sliding a block clear of something else, a plan that packs
// the drawing slightly tighter — outweighs it, and the chart fills up with small kinks
// that each looked free at the time. priced above the pixels they save, and far below a
// crossing, so a corner is still gladly taken to get out of something's way
const W_CORNER = 8000;

// the geometric terms compare every edge against every node and edge, which is fine for a
// hand-drawn chart but wasteful on a very large generated one, where they also matter far
// less than simply keeping the thing compact
const GEOMETRY_LIMIT = 120;

// where a lane runs: down one side of everything it passes, or in a column of its own
// immediately beside its two ends, with whatever was there pushed out of the way
const LANE_CHOICES = ['left', 'right', 'inleft', 'inright'];

// which side a lane runs down, without saying how far out. this is the half of the choice
// that decides whether edges cross — going round the left of the drawing or the right of
// it — while inner-vs-outer only decides how wide the detour is, and can be settled one
// lane at a time afterwards. separating the two is what lets every lane be searched: at
// four choices each, a chart with four loop-backs spends the entire budget on three of
// them and leaves the fourth on its opening guess, which on the sort chart is precisely
// the lane that has to move for the crossing to go away
const LANE_SIDES = ['left', 'right'];
const facesRight = (choice) => choice === 'right' || choice === 'inright';
const isInner    = (choice) => choice === 'inleft' || choice === 'inright';

function orientation(ax, ay, bx, by, cx, cy) {
    const v = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
    return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0;
}
function segmentsCross(p1, p2, p3, p4) {
    const d1 = orientation(p3.x, p3.y, p4.x, p4.y, p1.x, p1.y);
    const d2 = orientation(p3.x, p3.y, p4.x, p4.y, p2.x, p2.y);
    const d3 = orientation(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    const d4 = orientation(p1.x, p1.y, p2.x, p2.y, p4.x, p4.y);
    return d1 !== d2 && d3 !== d4; // proper crossing only; touching at a shared end doesn't count
}
function segmentHitsBox(p, q, box) {
    if (Math.max(p.x, q.x) < box.l || Math.min(p.x, q.x) > box.r) return false;
    if (Math.max(p.y, q.y) < box.t || Math.min(p.y, q.y) > box.b) return false;
    if (p.x > box.l && p.x < box.r && p.y > box.t && p.y < box.b) return true;
    if (q.x > box.l && q.x < box.r && q.y > box.t && q.y < box.b) return true;

    const corners = [{ x: box.l, y: box.t }, { x: box.r, y: box.t }, { x: box.r, y: box.b }, { x: box.l, y: box.b }];
    for (let i = 0; i < 4; i++) if (segmentsCross(p, q, corners[i], corners[(i + 1) % 4])) return true;
    return false;
}

function costModel({ blockNodes, neighbors, rowEntries, rows, rowCenterY, width, height, edgeList, find, x, nodeIds }) {
    const useGeometry = edgeList.length <= GEOMETRY_LIMIT;

    const at = (id) => ({ x: x.get(find(id)), y: rowCenterY.get(rows.get(id)) });
    const boxOf = (id) => {
        const p = at(id), w = width.get(id) / 2, h = height.get(id) / 2;
        return { l: p.x - w, r: p.x + w, t: p.y - h, b: p.y + h };
    };

    // edges touching a block, and the rows its nodes occupy
    const edgesOf = new Map([...blockNodes.keys()].map(b => [b, []]));
    for (const e of edgeList) {
        const a = find(e.source), c = find(e.target);
        edgesOf.get(a)?.push(e);
        if (c !== a) edgesOf.get(c)?.push(e);
    }
    const rowsOf = new Map([...blockNodes.keys()].map(b => [b, new Set((blockNodes.get(b) ?? []).map(id => rows.get(id)))]));

    const edgeCost = (e) => {
        const s = at(e.source), t = at(e.target);
        const dx = Math.abs(s.x - t.x), dy = Math.abs(s.y - t.y);
        let c = W_BEND * dx + W_LENGTH * (dx + dy);
        if (dx > 0.01) c += W_NOT_STRAIGHT;
        if (useGeometry) {
            for (const id of nodeIds) {
                if (id === e.source || id === e.target) continue;
                if (segmentHitsBox(s, t, boxOf(id))) c += W_OVERLAP;
            }
        }
        return c;
    };

    const crossingsWith = (e) => {
        if (!useGeometry) return 0;
        const s = at(e.source), t = at(e.target);
        let c = 0;
        for (const f of edgeList) {
            if (f === e) continue;
            if (f.source === e.source || f.source === e.target || f.target === e.source || f.target === e.target) continue;
            if (segmentsCross(s, t, at(f.source), at(f.target))) c += W_CROSSING;
        }
        return c;
    };

    const rowCost = (r) => {
        const entries = rowEntries.get(r) ?? [];
        let c = 0;
        for (let i = 1; i < entries.length; i++) {
            const prev = entries[i - 1], cur = entries[i];
            const need = width.get(prev.id) / 2 + COL_GAP + width.get(cur.id) / 2;
            const have = x.get(cur.block) - x.get(prev.block);
            if (have < need) c += W_OVERLAP * (need - have);
        }
        return c;
    };

    const perimeter = () => {
        let minL = Infinity, maxR = -Infinity, minT = Infinity, maxB = -Infinity;
        for (const id of nodeIds) {
            const box = boxOf(id);
            if (box.l < minL) minL = box.l;
            if (box.r > maxR) maxR = box.r;
            if (box.t < minT) minT = box.t;
            if (box.b > maxB) maxB = box.b;
        }
        return W_PERIMETER * 2 * ((maxR - minL) + (maxB - minT));
    };

    const blockOwns = (b, e) => find(e.source) === b || find(e.target) === b;

    return {
        // the part of the score a single block can change
        around(b) {
            let c = perimeter();
            for (const e of edgesOf.get(b) ?? []) c += edgeCost(e) + crossingsWith(e);
            for (const r of rowsOf.get(b) ?? []) c += rowCost(r);

            // a block also carries its nodes into the path of edges it has nothing to do
            // with. leaving those out let the optimiser slide a node straight through an
            // unrelated edge for free — the charge for that landed on the edge, which was
            // never re-scored because the edge itself had not moved
            if (useGeometry) {
                for (const e of edgeList) {
                    if (blockOwns(b, e)) continue; // already scored above
                    const s = at(e.source), t = at(e.target);
                    for (const id of blockNodes.get(b) ?? []) {
                        if (id === e.source || id === e.target) continue;
                        if (segmentHitsBox(s, t, boxOf(id))) c += W_OVERLAP;
                    }
                }
            }
            return c;
        }
    };
}

// returns how many nodes actually moved
function planLayout(lf, sides, swaps = new Set(), lifts = new Set(), headLifts = new Set()) {
    const nodes = lf.graphModel.nodes;
    const edges = lf.graphModel.edges;
    if (!nodes.length) return null;

    const start = nodes.find(n => n.type === 'terminator' && /^START$/i.test(n.text?.value ?? ''));
    if (!start) return null; // nothing to anchor a layout to

    const x0 = new Map(nodes.map(n => [n.id, n.x]));
    const y0 = new Map(nodes.map(n => [n.id, n.y]));
    const width  = new Map(nodes.map(n => [n.id, n.width]));
    const height = new Map(nodes.map(n => [n.id, n.height]));

    const outEdges = new Map(nodes.map(n => [n.id, []]));
    for (const e of edges) outEdges.get(e.sourceNodeId)?.push({ target: e.targetNodeId });

    const { reachable, backEdges } = walkFromStart(start.id, outEdges);

    // forward-only adjacency: loop-backs are excluded so a loop's header still counts as
    // having one way in, keeping the run through the loop body a single straight block
    const forwardOut = new Map([...reachable].map(id => [id, []]));
    const forwardIn  = new Map([...reachable].map(id => [id, []]));
    for (const id of reachable) {
        for (const e of outEdges.get(id) ?? []) {
            if (backEdges.has(e) || !reachable.has(e.target)) continue;
            forwardOut.get(id).push(e.target);
            forwardIn.get(e.target).push(id);
        }
    }

    const rows = computeRows(start.id, reachable, forwardOut);

    // rows come from the longest path down from START, which puts every node below
    // whatever leads to it. that is right for anything the flow continues through, but
    // wrong for a side branch that does one thing and hands control straight back: it
    // gets pushed a row below the branch it came from and drags a long return edge back
    // up past everything. such a node — nothing below it, only a way back — can sit level
    // with what it returns to instead, which is where these are drawn by hand and makes
    // the return a short hop across. whether it actually helps is measured, not assumed
    const liftable = new Map();
    for (const id of reachable) {
        if ((forwardOut.get(id) ?? []).length) continue; // the flow carries on below it
        const back = (outEdges.get(id) ?? []).filter(e => backEdges.has(e));
        if (!back.length) continue;
        const home = rows.get(back[0].target);
        if (home != null && home < rows.get(id)) liftable.set(id, home);
    }
    for (const id of lifts) if (liftable.has(id)) rows.set(id, liftable.get(id));
    const find = buildBlocks(reachable, forwardOut, forwardIn);

    // a block that only ever enters from one place, and never sends the flow anywhere
    // but back into itself, has no reason to sit at whatever row counting steps down
    // from START happened to give it. levelled instead with the row of the one thing
    // that feeds it, the entering edge meets a side anchor with a straight line (the
    // rs === rt case below) rather than bending into the block's top — which is also
    // the only way that case can ever fire for such a block, since routing decides
    // "level with" by row number, not by pixel position: shifting a block's y after the
    // fact without moving its row too leaves the routing still thinking it is a row
    // away, so it draws the same bent, top-entry path — now cutting through the box
    // instead of clearing it, because the bend has shrunk to nothing.
    //
    // the whole block moves together, by the same number of rows, so a chain packed
    // tight in the step below stays exactly as tight afterward
    const chainRoot = new Map(); // block root -> its member ids
    for (const id of reachable) {
        const b = find(id);
        if (!chainRoot.has(b)) chainRoot.set(b, []);
        chainRoot.get(b).push(id);
    }
    const headLiftable = new Map(); // block root -> row delta
    for (const [block, members] of chainRoot) {
        // a forward edge leaving the block and it is not a dead end. counted over forward
        // edges only, not every edge: rows come from the forward graph alone, so a block
        // whose one way out is a loop-back sits below nothing and is as free to move as
        // one with no way out at all. counting the loop-back as well refused the lift to
        // every chain that ends by returning to the top — the tail of a chart that loops
        // round to run again — which is exactly the shape that wants it, since the branch
        // it hangs off is then left reaching a whole row down to meet it
        const external = members.some(id => (forwardOut.get(id) ?? []).some(t => find(t) !== block));
        if (external) continue;

        const head = members.slice().sort((a, b) => rows.get(a) - rows.get(b))[0];
        const preds = new Set();
        for (const id of members) for (const p of forwardIn.get(id) ?? []) if (find(p) !== block) preds.add(p);
        if (preds.size !== 1) continue; // only an unambiguous single entry point is worth chasing

        const [pred] = preds;
        const delta = rows.get(pred) - rows.get(head);
        if (delta) headLiftable.set(block, delta);
    }
    for (const block of headLifts) {
        const delta = headLiftable.get(block);
        if (delta == null) continue;
        for (const id of chainRoot.get(block)) rows.set(id, rows.get(id) + delta);
    }

    // row -> y center, stacked by each row's tallest node, so a multi-line process box
    // gets the extra room it needs without shrinking the gap around its neighbors.
    // rows depend only on the graph, so the vertical layout is settled before the columns
    // are — which is what lets the cost function below score real geometry
    const rowIds = new Map();
    for (const [id, r] of rows) { if (!rowIds.has(r)) rowIds.set(r, []); rowIds.get(r).push(id); }
    const sortedRows = [...rowIds.keys()].sort((a, b) => a - b);
    const rowCenterY = new Map();
    let cursor = 0;
    for (const r of sortedRows) {
        const h = Math.max(...rowIds.get(r).map(id => height.get(id)));
        rowCenterY.set(r, cursor + h / 2);
        cursor += h + ROW_GAP;
    }

    // every drawn edge pulls, loop-backs included: they are just as visible as any other
    // carries the edge's own id, not just the pair of nodes it joins: a decision can send
    // both of its branches to the same node, and everything keyed on "source|target" then
    // treats the two as one — one lane, one side, one route — so the second is drawn
    // exactly over the first and disappears
    const edgeList = edges
        .filter(e => reachable.has(e.sourceNodeId) && reachable.has(e.targetNodeId))
        .map(e => ({ id: e.id, source: e.sourceNodeId, target: e.targetNodeId }));

    // ---- reserved lanes ----
    //
    // an edge that skips over a row — every loop-back, and any branch that jumps ahead —
    // has to get past whatever sits in the rows between its ends. no arrangement of the
    // nodes alone can help: with nothing holding a column open for it, the edge is drawn
    // straight over the top of them. so each such edge is given a stand-in node in every
    // row it passes through. the stand-ins take part in the spacing like any other node,
    // which keeps a clear column open along the whole run, and they are chained together
    // so that column comes out straight. they are scaffolding: never drawn, never moved.
    const laneWidth  = new Map(width);
    const laneHeight = new Map(height);
    const laneRows   = new Map(rows);
    const laneX0     = new Map(x0);
    const laneEdges  = [];
    const laneOf     = new Map(); // "source|target" -> the lane's own id, for routing later
    const laneRoot   = new Map(); // stand-in id -> the id its chain is grouped under
    const lanes      = new Set();

    // which side of the drawing each lane runs down. this is not guessed: planLayout is
    // run once per combination of sides and the tidiest result wins (see below), so the
    // choice is made by counting crossings rather than by a rule of thumb
    const laneSide = new Map(sides);
    const spanExtent = (from, to, pick) => {
        const lo = Math.min(from, to), hi = Math.max(from, to);
        const xs = [...reachable].filter(id => rows.get(id) > lo && rows.get(id) < hi).map(id => x0.get(id));
        return xs.length ? pick(...xs) : 0;
    };

    let laneCount = 0;
    for (const { id: edgeId, source, target } of edgeList) {
        const from = rows.get(source), to = rows.get(target);
        if (Math.abs(to - from) <= 1) { laneEdges.push({ source, target }); continue; }

        const choice = laneSide.get(edgeId);
        const right  = facesRight(choice);

        // seeded outside everything the lane passes, which is what puts it on that side of
        // the fixed left-to-right order. the spacing pass then pulls it back in to sit just
        // clear of the nodes it runs past, so the seed sets the side, not the final gap.
        //
        // going round the outside is not always the tidiest way past, though. a lane exiled
        // beyond every node it passes still has to come back in along its target's row, and
        // anything parked out that way is crossed on the return. seeded next to its own ends
        // instead, the lane takes a column immediately beside them and the drawing opens up
        // around it — whatever was in the corridor is pushed further out, rather than run
        // over. which of the two reads better is not something a rule can say, so both are
        // offered to the search and the score decides
        const seed = isInner(choice)
            ? (right ? Math.max(x0.get(source), x0.get(target)) + 1
                     : Math.min(x0.get(source), x0.get(target)) - 1)
            : (right ? spanExtent(from, to, Math.max) + 1000
                     : spanExtent(from, to, Math.min) - 1000);

        const step  = to > from ? 1 : -1;
        const chain = [];
        let prev = source;
        for (let r = from + step; r !== to; r += step) {
            const id = `__lane${laneCount++}`;
            lanes.add(id);
            laneRows.set(id, r);
            laneWidth.set(id, 1);   // no width of its own; the spacing either side is the lane
            laneHeight.set(id, 1);
            laneX0.set(id, seed);
            laneEdges.push({ source: prev, target: id });
            chain.push(id);
            prev = id;
        }
        laneEdges.push({ source: prev, target });
        for (const id of chain) laneRoot.set(id, chain[0]);

        // the lane also has to be clear in the two rows it starts and ends on. those hold
        // the horizontal runs that reach the lane, and without a claim there the lane can
        // settle inside a wide node beside its own endpoint — so the edge leaves by one
        // side and immediately doubles back across whatever shares that row. these belong
        // to the lane's block, so they claim the column without linking into the chain
        for (const r of [from, to]) {
            const id = `__lane${laneCount++}`;
            lanes.add(id);
            laneRows.set(id, r);
            laneWidth.set(id, 1);
            laneHeight.set(id, 1);
            laneX0.set(id, seed);
            laneRoot.set(id, chain[0]);
        }

        laneOf.set(edgeId, chain[0]);
    }

    const findLane = (id) => laneRoot.has(id) ? laneRoot.get(id) : find(id);
    const posX = layoutBlocks({
        reachable: new Set([...reachable, ...lanes]),
        rows: laneRows, rowCenterY, width: laneWidth, height: laneHeight, x0: laneX0,
        edgeList: laneEdges, find: findLane,
        costNodes: [...reachable], costEdges: edgeList,
        fixed: new Set([...lanes].map(id => findLane(id))), // lanes are placed by spacing, not by the search
        swaps
    });

    // the layout is built in its own coordinates and has to be dropped back onto the
    // canvas somewhere. pinning it by START keeps the chart roughly in place, but only
    // START is actually guaranteed not to move: reshape anything above a node and the
    // whole run below it slides, so a chart that barely changed still comes back shifted
    // and every node looks like it moved.
    //
    // the offset each node would need to stay exactly where it is is worked out instead,
    // and the one the most nodes agree on wins — so whatever part of the chart the layout
    // did not disturb is left untouched, and only what actually changed shape moves. a
    // rearrangement that comes out identical agrees on a single offset everywhere and so
    // puts every node back exactly where it was. ties go to the smaller move
    const offsets = new Map(); // offset rounded to the pixel -> how many nodes want it
    for (const id of reachable) {
        const ox = x0.get(id) - posX.get(find(id));
        const oy = y0.get(id) - rowCenterY.get(rows.get(id));
        const key = `${Math.round(ox)}|${Math.round(oy)}`;
        const seen = offsets.get(key);
        if (seen) seen.count++;
        else offsets.set(key, { count: 1, ox, oy });
    }

    let anchor = null;
    for (const candidate of offsets.values()) {
        const closer = Math.abs(candidate.ox) + Math.abs(candidate.oy) < Math.abs(anchor?.ox ?? 0) + Math.abs(anchor?.oy ?? 0);
        if (!anchor || candidate.count > anchor.count || (candidate.count === anchor.count && closer)) anchor = candidate;
    }

    const dx = anchor ? anchor.ox : x0.get(start.id) - posX.get(find(start.id));
    const dy = anchor ? anchor.oy : y0.get(start.id) - rowCenterY.get(rows.get(start.id));

    const at = new Map();
    for (const n of nodes) {
        if (!reachable.has(n.id)) { at.set(n.id, { x: n.x, y: n.y, w: n.width, h: n.height }); continue; }
        at.set(n.id, {
            x: posX.get(find(n.id)) + dx,
            y: rowCenterY.get(rows.get(n.id)) + dy,
            w: n.width, h: n.height
        });
    }

    // ---- edge routing ----
    //
    // moving the nodes is only half of it. an edge that skips a row now has a clear lane
    // reserved for it, but nothing yet sends it down that lane: left to itself it leaves
    // by whichever anchor it used before and is drawn straight over whatever lies between.
    // so the ones that need it are routed by hand — out of the side facing their lane,
    // along it, and back in the same side at the far end
    const anchorOf = (p, side) => (
        side === 'top'    ? { x: p.x,           y: p.y - p.h / 2 } :
        side === 'bottom' ? { x: p.x,           y: p.y + p.h / 2 } :
        side === 'left'   ? { x: p.x - p.w / 2, y: p.y           } :
                            { x: p.x + p.w / 2, y: p.y           }
    );

    const routeAll = () => {
    const routes = new Map();
    for (const e of edges) {
        const src = at.get(e.sourceNodeId), tar = at.get(e.targetNodeId);
        if (!src || !tar) continue;

        // a fragment with no way in from START is left exactly as the user drew it, and
        // that has to include how its edges are drawn. routing them anyway rewrote the
        // path and the anchors of a piece of the chart nothing else here had touched
        if (!reachable.has(e.sourceNodeId) || !reachable.has(e.targetNodeId)) continue;

        // an edge back to its own node has nowhere to travel between two anchors: taken
        // as an ordinary level pair it comes out as a line straight across the middle of
        // the box. it loops out to one side and back in over the top instead
        if (e.sourceNodeId === e.targetNodeId) {
            const out = anchorOf(src, 'right'), back = anchorOf(src, 'top');
            const lip = src.x + src.w / 2 + STUB, crown = src.y - src.h / 2 - STUB;
            routes.set(e.id, {
                points: [out, { x: lip, y: out.y }, { x: lip, y: crown }, { x: back.x, y: crown }, back],
                srcSide: 'right', tarSide: 'top'
            });
            continue;
        }

        const lane = laneOf.get(e.id);
        const rs   = rows.get(e.sourceNodeId), rt = rows.get(e.targetNodeId);

        // level with each other: the two simply face off across the gap, which is the
        // whole point of lifting a returning branch up beside what it returns to.
        //
        // "level" means the same row, not necessarily the same pixel: a repair elsewhere
        // can shift one side's block to clear something in its own path, without knowing
        // it was standing in for the other side's height too, and the two drift apart in
        // y even though they still share a row. squared off with a jog when that happens,
        // rather than drawn straight across — a straight line between two side anchors at
        // different heights is a diagonal, not the flat hop this case exists to draw.
        //
        // the turn goes at the midpoint of the gap between them, not hard against the
        // target: dropping at the target's own edge lays the vertical leg flat along the
        // node's side, close enough to read as part of the outline rather than as an edge
        // arriving at it
        if (rs != null && rt != null && rs === rt) {
            const goRight = tar.x > src.x;
            const a = anchorOf(src, goRight ? 'right' : 'left');
            const b = anchorOf(tar, goRight ? 'left' : 'right');
            const points = Math.abs(a.y - b.y) < 0.5
                ? [a, b]
                : [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b];
            routes.set(e.id, {
                points,
                srcSide: goRight ? 'right' : 'left',
                tarSide: goRight ? 'left'  : 'right'
            });
            continue;
        }

        let laneX = null, side = null;
        if (lane !== undefined && posX.has(findLane(lane))) {
            laneX = posX.get(findLane(lane)) + dx;
            side  = facesRight(laneSide.get(e.id)) ? 'right' : 'left';
        } else if (rs != null && rt != null && rt < rs) {
            // one row up and off to the side: cut across and come in underneath. looping
            // out past the target and back in along its far side covers the same ground
            // twice over. the loop out is only needed when the two share a column, to stay
            // clear of the edge running down between them
            if (rs - rt === 1 && Math.abs(tar.x - src.x) > COL_GAP) {
                const srcSide = tar.x > src.x ? 'right' : 'left';
                const a = anchorOf(src, srcSide);
                const b = anchorOf(tar, 'bottom');
                routes.set(e.id, { points: [a, { x: b.x, y: a.y }, b], srcSide, tarSide: 'bottom' });
                continue;
            }

            // a loop back to the row directly above gets no reserved lane, but it still
            // cannot be left on the default anchors: those send it straight back down the
            // line the forward edge already occupies, drawing one exactly over the other.
            // it goes out to the side instead, clear of everything in the rows it spans,
            // facing the target so it takes the short way round
            const goRight = tar.x > src.x;
            const lo = Math.min(rs, rt), hi = Math.max(rs, rt);
            const spanned = nodes.filter(n => { const r = rows.get(n.id); return r >= lo && r <= hi; })
                                 .map(n => at.get(n.id));

            side  = goRight ? 'right' : 'left';
            laneX = goRight ? Math.max(...spanned.map(p => p.x + p.w / 2)) + COL_GAP
                            : Math.min(...spanned.map(p => p.x - p.w / 2)) - COL_GAP;
        }

        if (laneX !== null && side !== null) {
            const a = anchorOf(src, side), b = anchorOf(tar, side);
            routes.set(e.id, {
                points: [a, { x: laneX, y: a.y }, { x: laneX, y: b.y }, b],
                srcSide: side, tarSide: side
            });
            continue;
        }

        // a step down to the next row. it leaves from the bottom when the target sits
        // below, and from the facing side when the target is off to one side — which is
        // also what stops a decision's two branches from setting off along the same line
        // before they split, drawing one on top of the other
        const sideways = Math.abs(tar.x - src.x) > src.w / 2;
        const srcSide = sideways ? (tar.x > src.x ? 'right' : 'left') : 'bottom';
        const a = anchorOf(src, srcSide);
        const b = anchorOf(tar, 'top');

        // a step down to a node that is not quite in the same column still has to be
        // drawn in right angles: joining the two anchors directly slants the line, which
        // is the odd diagonal it used to leave behind. it drops, steps across halfway
        // between the rows, then drops again
        const points = sideways            ? [a, { x: b.x, y: a.y }, b]
                     : Math.abs(a.x - b.x) < 1 ? [a, b]
                     : [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b];

        routes.set(e.id, { points, srcSide, tarSide: 'top' });
    }

    // the two ways down to the next row, kept so a step that runs into something can be
    // offered the other one. leaving sideways sends the edge along its own row, which is
    // the wrong way past anything sharing that row; dropping first and crossing halfway
    // between the rows travels through the gap instead, where nothing sits. the choice is
    // made on the whole drawing rather than here, since only the score can tell whether
    // the extra corner is worth what it avoids
    for (const e of edges) {
        const route = routes.get(e.id);
        if (!route || route.alt) continue;
        if (route.tarSide !== 'top' || e.sourceNodeId === e.targetNodeId) continue;

        const src = at.get(e.sourceNodeId), tar = at.get(e.targetNodeId);
        const b = anchorOf(tar, 'top');

        if (route.srcSide === 'bottom') {
            const side = tar.x > src.x ? 'right' : 'left';
            const a = anchorOf(src, side);
            route.alt = { points: [a, { x: b.x, y: a.y }, b], srcSide: side, tarSide: 'top' };
        } else {
            const a = anchorOf(src, 'bottom');
            route.alt = Math.abs(a.x - b.x) < 1
                ? { points: [a, b], srcSide: 'bottom', tarSide: 'top' }
                : { points: [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b], srcSide: 'bottom', tarSide: 'top' };
        }
    }

    // two edges that ended up on the very same path — a decision sending both branches to
    // one node, most often — are one visible line, and the reader has no way to tell the
    // chart has two. giving each its own lane only separates the ones long enough to get a
    // lane; the rest are pulled apart here, bowing out a little further to alternating
    // sides so each is drawn distinctly and both labels have somewhere to sit
    const drawn = new Map();
    for (const e of edges) {
        const route = routes.get(e.id);
        if (!route) continue;

        const shape = JSON.stringify(route.points);
        const seen = drawn.get(shape) ?? 0;
        drawn.set(shape, seen + 1);
        if (!seen) continue;

        const src = at.get(e.sourceNodeId), tar = at.get(e.targetNodeId);
        const right = seen % 2 === 1;
        const reach = COL_GAP * Math.ceil(seen / 2);
        const side  = right ? 'right' : 'left';
        const a = anchorOf(src, side), b = anchorOf(tar, side);
        const bowX = right ? Math.max(src.x + src.w / 2, tar.x + tar.w / 2) + reach
                           : Math.min(src.x - src.w / 2, tar.x - tar.w / 2) - reach;

        routes.set(e.id, {
            points: [a, { x: bowX, y: a.y }, { x: bowX, y: b.y }, b],
            srcSide: side, tarSide: side
        });
    }

    return routes;
    };

    let routes = routeAll();

    // ---- taking the other way down ----
    //
    // a step to the next row that runs over a node is often just the wrong shape rather
    // than badly placed: leaving sideways sends it along its own row, past everything
    // sharing that row, when dropping first and crossing in the gap between the rows
    // would have missed all of it. swapping the shape costs nothing to try and needs no
    // node to move, so it comes before the passes that start shifting blocks around
    for (const e of edges) {
        const route = routes.get(e.id);
        if (!route?.alt) continue;

        const hits = (r) => {
            for (let i = 0; i + 1 < r.points.length; i++) {
                for (const n of nodes) {
                    if (n.id === e.sourceNodeId || n.id === e.targetNodeId || !reachable.has(n.id)) continue;
                    const p = at.get(n.id);
                    if (segmentHitsBox(r.points[i], r.points[i + 1],
                        { l: p.x - p.w / 2, r: p.x + p.w / 2, t: p.y - p.h / 2, b: p.y + p.h / 2 })) return true;
                }
            }
            return false;
        };
        if (!hits(route)) continue;

        const before = tangle({ at, routes }, nodes, edges);
        const swapped = new Map(routes);
        swapped.set(e.id, route.alt);
        if (tangle({ at, routes: swapped }, nodes, edges) < before) routes = swapped;
    }

    // ---- clearing a blocked run ----
    //
    // a run that has to reach across the drawing can be blocked by a node with no real
    // reason to be at that height. rows count steps down from START, so a branch that
    // never merges back is pinned level with whatever else happens to be that many steps
    // in — even though nothing about the chart says it belongs there. it can slide up or
    // down freely, and moving what is in the way is far cheaper than sending the whole
    // edge round the other side of the drawing.
    //
    // the run still has to get past the branch somewhere, so this trades passing over a
    // node for passing between two of them — over the short edge joining them, which is
    // the readable version of the same journey. the shift is kept only when the drawing
    // scores better for it, so it can never make things worse
    const CLEAR = 12;                    // gap left between a run and the boxes either side
    const MIN_STEP = ROW_GAP / 2;        // vertical room a shifted block must leave its neighbours

    const blockMembers = new Map();
    for (const id of reachable) {
        if (!blockMembers.has(find(id))) blockMembers.set(find(id), []);
        blockMembers.get(find(id)).push(id);
    }

    // two blocks sitting level with each other, joined by the flat edge that runs between
    // them, have to move as one. shifting only the blocked side to get it out of a run's
    // way tilts that flat edge into a jog — and the jog is cheap enough beside a run
    // drawn over a node that the trade always looks worth making, so the drawing quietly
    // loses a straight line every time a run needs to get past something. moved together,
    // the line between them stays flat and the run still gets its gap
    const levelRoot = new Map([...blockMembers.keys()].map(b => [b, b]));
    const levelFind = (b) => {
        let root = b;
        while (levelRoot.get(root) !== root) root = levelRoot.get(root);
        while (levelRoot.get(b) !== root) { const next = levelRoot.get(b); levelRoot.set(b, root); b = next; }
        return root;
    };
    for (const e of edges) {
        const rs = rows.get(e.sourceNodeId), rt = rows.get(e.targetNodeId);
        if (rs == null || rt == null || rs !== rt) continue;

        const a = levelFind(find(e.sourceNodeId)), b = levelFind(find(e.targetNodeId));
        if (a !== b && blockMembers.has(a) && blockMembers.has(b)) levelRoot.set(a, b);
    }

    // every node that has to travel with this one
    const groupOf = (block) => {
        const root = levelFind(block);
        const ids = [];
        for (const [b, members] of blockMembers) if (levelFind(b) === root) ids.push(...members);
        return ids;
    };

    // how far the group can move before it would sit level with what leads into it, or
    // with what it leads to. edges wholly inside the group travel with it and do not bind
    const slackOf = (ids) => {
        const inGroup = new Set(ids);
        let up = Infinity, down = Infinity;
        for (const id of ids) {
            const p = at.get(id);
            for (const pred of forwardIn.get(id) ?? []) {
                if (inGroup.has(pred)) continue;
                const q = at.get(pred);
                up = Math.min(up, (p.y - p.h / 2) - (q.y + q.h / 2) - MIN_STEP);
            }
            for (const succ of forwardOut.get(id) ?? []) {
                if (inGroup.has(succ)) continue;
                const q = at.get(succ);
                down = Math.min(down, (q.y - q.h / 2) - (p.y + p.h / 2) - MIN_STEP);
            }
        }
        return { up: Math.max(0, up), down: Math.max(0, down) };
    };

    const boxAt = (id, dy = 0) => {
        const p = at.get(id);
        return { l: p.x - p.w / 2, r: p.x + p.w / 2, t: p.y - p.h / 2 + dy, b: p.y + p.h / 2 + dy };
    };

    // the horizontal runs that are drawn straight over a node, and what they hit
    const blockages = (routes) => {
        const found = [];
        for (const e of edges) {
            const pts = routes.get(e.id)?.points ?? [];
            for (let i = 0; i + 1 < pts.length; i++) {
                const p = pts[i], q = pts[i + 1];
                if (Math.abs(p.y - q.y) > 0.5) continue; // a vertical run is cleared by its lane
                for (const n of nodes) {
                    if (n.id === e.sourceNodeId || n.id === e.targetNodeId) continue;
                    if (!reachable.has(n.id)) continue;
                    if (segmentHitsBox(p, q, boxAt(n.id))) found.push({ runY: p.y, blocker: n.id });
                }
            }
        }
        return found;
    };

    // the smallest shift that leaves the run in a gap between the block's members rather
    // than through one of them, within what the block's own edges allow
    const shiftFor = (ids, runY) => {
        const { up, down } = slackOf(ids);

        const options = [];
        for (const id of ids) {
            const b = boxAt(id);
            options.push(runY - b.t + CLEAR, runY - b.b - CLEAR); // this member below / above the run
        }

        // the run must miss every member, not just the one it was caught on: the block is
        // rigid, so clearing one box can slide another into the same line.
        //
        // each candidate is the exact shift that leaves one box CLEAR away from the run, so
        // the test has to treat "exactly CLEAR away" as clearing it — comparing without the
        // tolerance rejects every candidate on the boundary it was built to sit on, which
        // left the pass finding a shift for nothing and moving no one
        const clears = (dy) => ids.every(id => {
            const b = boxAt(id, dy);
            return runY < b.t - CLEAR + 0.5 || runY > b.b + CLEAR - 0.5;
        });

        // the least movement that works, and upward when up and down are equally short:
        // a branch pulled up tightens the drawing, where the same step down only stretches it
        return options
            .filter(dy => dy <= down && -dy <= up && clears(dy))
            .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)[0] ?? null;
    };

    for (let pass = 0; pass < 4; pass++) {
        let shifted = false;

        for (const { runY, blocker } of blockages(routes)) {
            const ids = groupOf(find(blocker));
            const dy = shiftFor(ids, runY);
            if (dy === null || Math.abs(dy) < 0.5) continue;

            const before = tangle({ at, routes }, nodes, edges);
            for (const id of ids) at.get(id).y += dy;

            const moved = routeAll();
            if (tangle({ at, routes: moved }, nodes, edges) < before) { routes = moved; shifted = true; break; }
            for (const id of ids) at.get(id).y -= dy; // no better: put it back and leave it alone
        }

        if (!shifted) break;
    }

    // ---- packing a branch that ends where it is ----
    //
    // a row is as tall as the tallest thing in it. that is right along the spine, where
    // the rows line up what happens at the same point in the flow, but a branch that runs
    // off and stops has nothing to line up with: its boxes are simply dealt one row each,
    // and small ones dealt rows sized for a big decision elsewhere end up strung out, with
    // the gap showing as a long edge going nowhere. nothing holds them there, so they are
    // closed up to their own spacing — and, as everywhere else here, only if the drawing
    // scores better for it
    // forward edges only, for the same reason the head-lift counts them that way: a chain
    // that finishes by looping back to the top carries on nowhere, so the rows below it
    // hold nothing of its own and it is as free to close up as one that simply stops. read
    // over every edge, its loop-back looked like a continuation and left the chain strung
    // out down rows sized by the decisions beside it
    const endsHere = (block) => {
        const ids = blockMembers.get(block) ?? [];
        if (ids.length < 2) return false;
        for (const id of ids) {
            for (const t of forwardOut.get(id) ?? []) if (find(t) !== block) return false;
        }
        return true;
    };

    for (const block of blockMembers.keys()) {
        if (!endsHere(block)) continue;

        const ids = [...blockMembers.get(block)].sort((a, b) => at.get(a).y - at.get(b).y);
        const was = ids.map(id => at.get(id).y);

        // the head stays where the rows put it, keeping the branch level with whatever it
        // came from; the rest close up behind it
        const packedY = [was[0]];
        let cursor = at.get(ids[0]).y + at.get(ids[0]).h / 2;
        for (let i = 1; i < ids.length; i++) {
            cursor += ROW_GAP + at.get(ids[i]).h / 2;
            packedY.push(cursor);
            cursor += at.get(ids[i]).h / 2;
        }
        if (packedY.every((y, i) => Math.abs(y - was[i]) < 1)) continue; // already tight

        const before = tangle({ at, routes }, nodes, edges);
        ids.forEach((id, i) => { at.get(id).y = packedY[i]; });

        const packed = routeAll();
        if (tangle({ at, routes: packed }, nodes, edges) < before) routes = packed;
        else ids.forEach((id, i) => { at.get(id).y = was[i]; });
    }

    // ---- straightening a step that only just misses ----
    //
    // a step down to the next row is drawn as a jog — down, across, down — whenever the
    // two ends are not quite in the same column. often nothing wants them apart: the
    // spacing simply had to hold one of them clear of whatever else shares its row, and
    // it came to rest a few pixels off the column its own parent sits in. the offset is
    // small enough that the score barely notices (a jog costs only its own width twice
    // over in length) and no choice in the plan search can slide a block sideways to
    // close it, so it survives to the drawing.
    //
    // closed here by moving one whole block over — the target under its source, or
    // failing that the source over its target — since a block moves rigidly and whatever
    // was straight inside it stays straight. the row spacing still has the final say: a
    // shift is refused if it would crowd any two nodes sharing a row closer than they
    // already are, so this can only take up slack that was genuinely spare
    const rowMembers = new Map();
    for (const id of reachable) {
        const r = rows.get(id);
        if (!rowMembers.has(r)) rowMembers.set(r, []);
        rowMembers.get(r).push(id);
    }

    // how much room the tightest pair sharing a row has to spare, negative once they are
    // closer than the spacing wants. compared before and after rather than tested against
    // COL_GAP outright, so a layout that already sits hard against the limit stays workable
    const tightest = () => {
        let worst = Infinity;
        for (const list of rowMembers.values()) {
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    const p = at.get(list[i]), q = at.get(list[j]);
                    worst = Math.min(worst, Math.abs(p.x - q.x) - (p.w + q.w) / 2 - COL_GAP);
                }
            }
        }
        return worst;
    };

    // corners over the whole drawing. a block sits in the middle of several edges at once,
    // so sliding it to square up one of them pulls it out of line with all the others —
    // and going by length alone that reads as an improvement, since a jog costs so little
    // that trading one for two or three still comes out shorter. counted and compared
    // directly instead: this pass exists to remove corners, so it is only allowed to
    // accept a move that removes one
    const bendsIn = (rs) => {
        let n = 0;
        for (const r of rs.values()) n += Math.max(0, r.points.length - 2);
        return n;
    };

    // every block that would be pulled out of line by moving this one: everything joined
    // to it by an edge that is drawn exactly straight as things stand. those are precisely
    // the edges a sideways move would bend, so they travel with it and stay straight —
    // anything already bent is no worse for the move and is left where it is.
    //
    // moving a single block was not enough. a jog whose far end sits in a run of blocks
    // that already share a column — a branch and the statement it merges back into, which
    // is the commonest shape there is — could not be closed from either end: shifting the
    // one block traded the jog being fixed for a fresh one the other side of it, the bend
    // count came out equal rather than lower, and the move was refused. shifting the other
    // end instead ran into the row spacing. so the jog survived to the drawing, a few
    // pixels wide and entirely avoidable. the whole run slides together now
    const straightGroup = (block) => {
        const group = new Set([block]);
        const queue = [block];
        while (queue.length) {
            const b = queue.pop();
            for (const e of edges) {
                // find() walks a parent map built only over the reachable nodes, so an
                // edge touching a disconnected fragment must not be handed to it
                if (!reachable.has(e.sourceNodeId) || !reachable.has(e.targetNodeId)) continue;

                const s = find(e.sourceNodeId), t = find(e.targetNodeId);
                const other = s === b ? t : t === b ? s : null;
                if (other === null || group.has(other) || !blockMembers.has(other)) continue;
                if (Math.abs(at.get(e.sourceNodeId).x - at.get(e.targetNodeId).x) > 0.5) continue;

                group.add(other);
                queue.push(other);
            }
        }
        const ids = [];
        for (const b of group) ids.push(...(blockMembers.get(b) ?? []));
        return ids;
    };

    for (let pass = 0; pass < 4; pass++) {
        let straightened = false;

        for (const e of edges) {
            const route = routes.get(e.id);
            if (!route || route.points.length !== 4) continue;

            // the jog, and only the jog: down, across, down, so it begins and ends with a
            // vertical run. four points alone does not say that — a lane route and a bowed
            // duplicate have four too, and both set out sideways. neither is a near miss to
            // be closed, and counting them spent this pass's attempts on edges it could
            // never help while the real jogs waited behind them
            const [a, m1, m2, b] = route.points;
            if (Math.abs(a.x - m1.x) > 0.5 || Math.abs(m2.x - b.x) > 0.5) continue;

            const dx = b.x - a.x;
            if (!dx || Math.abs(dx) > COL_GAP) continue; // a near miss, not a real sidestep

            for (const [anchorId, shift] of [[e.targetNodeId, -dx], [e.sourceNodeId, dx]]) {
                const ids = straightGroup(find(anchorId));
                if (!ids.length) continue;

                const before = tangle({ at, routes }, nodes, edges);
                const wasBends = bendsIn(routes);
                const room = tightest();

                for (const id of ids) at.get(id).x += shift;
                const slid = routeAll();

                if (bendsIn(slid) < wasBends &&
                    tightest() >= Math.min(room, 0) - 0.5 &&
                    tangle({ at, routes: slid }, nodes, edges) <= before) {
                    routes = slid;
                    straightened = true;
                    break;
                }
                for (const id of ids) at.get(id).x -= shift;
            }

            if (straightened) break;
        }

        if (!straightened) break;
    }

    // pairs of blocks that share a row, and so could sensibly trade places
    const sameRow = new Set();
    const byRow = new Map();
    for (const id of reachable) {
        const r = rows.get(id);
        if (!byRow.has(r)) byRow.set(r, new Set());
        byRow.get(r).add(find(id));
    }
    for (const blocks of byRow.values()) {
        const list = [...blocks];
        for (let i = 0; i < list.length; i++)
            for (let j = i + 1; j < list.length; j++)
                sameRow.add([list[i], list[j]].sort().join('|'));
    }

    return {
        at, routes, reachable, multiRow: new Set(laneOf.keys()), sameRow,
        liftable: new Set(liftable.keys()), headLiftable: new Set(headLiftable.keys())
    };
}

// how tangled a planned drawing is: crossings and overlaps, counted on the paths that
// will actually be drawn rather than on straight lines between node centres
// ---- which anchors an edge uses ----
//
// every route above picks its anchors from its own local rule: a lane takes the side
// facing it at both ends, a step down leaves the bottom and arrives at the top, a level
// pair faces off left to right. no rule can see any of the others, so nothing ever stands
// at a node with four anchors and several edges wanting them and asks which way round is
// cheapest — a loop-back climbing to a node's side anchor when its bottom one was right
// there, and the branch leaving that bottom anchor when its side was free, is a swap that
// no plan in the search can even express.
//
// so it is settled afterwards, by trying an edge on each pair of anchors and keeping
// whichever the drawing scores best on. run once against the chosen layout rather than
// inside every plan, since it moves no nodes and only re-draws what is already placed
const SIDES = ['top', 'right', 'bottom', 'left'];
const STEP  = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

// an orthogonal path leaving one anchor facing outwards and arriving at the other the
// same way: out to a stub, across or down to meet the far stub, then in
function routeVia(src, tar, srcSide, tarSide) {
    const anchor = (p, side) => (
        side === 'top'    ? { x: p.x,           y: p.y - p.h / 2 } :
        side === 'bottom' ? { x: p.x,           y: p.y + p.h / 2 } :
        side === 'left'   ? { x: p.x - p.w / 2, y: p.y           } :
                            { x: p.x + p.w / 2, y: p.y           }
    );

    const a = anchor(src, srcSide), b = anchor(tar, tarSide);
    const da = STEP[srcSide], db = STEP[tarSide];
    const p = { x: a.x + da.x * STUB, y: a.y + da.y * STUB };
    const q = { x: b.x + db.x * STUB, y: b.y + db.y * STUB };

    const points = [a, p];
    if (Math.abs(p.x - q.x) > 0.5 && Math.abs(p.y - q.y) > 0.5) {
        points.push(da.x !== 0 ? { x: q.x, y: p.y } : { x: p.x, y: q.y });
    }
    points.push(q, b);

    // drop anything that repeats a point or continues in a straight line through it, so
    // the corner count reflects the corners actually drawn
    const out = [];
    for (const pt of points) {
        const last = out[out.length - 1];
        if (last && Math.abs(last.x - pt.x) < 0.5 && Math.abs(last.y - pt.y) < 0.5) continue;
        out.push(pt);
    }
    for (let i = out.length - 2; i > 0; i--) {
        const before = out[i - 1], here = out[i], after = out[i + 1];
        const straight = (Math.abs(before.x - here.x) < 0.5 && Math.abs(here.x - after.x) < 0.5)
                      || (Math.abs(before.y - here.y) < 0.5 && Math.abs(here.y - after.y) < 0.5);
        if (straight) out.splice(i, 1);
    }
    return { points: out, srcSide, tarSide };
}

function refineAnchors(plan, nodes, edges) {
    if (edges.length > GEOMETRY_LIMIT) return; // the scoring this leans on is off at that size

    let trials = 400;
    for (let round = 0; round < 2 && trials > 0; round++) {
        let improved = false;

        for (const e of edges) {
            const route = plan.routes.get(e.id);
            if (!route || e.sourceNodeId === e.targetNodeId) continue;

            const src = plan.at.get(e.sourceNodeId), tar = plan.at.get(e.targetNodeId);
            if (!src || !tar) continue;

            // a path that doubles back over the node it just left reads far worse than
            // whatever it was avoiding, and the score would not catch it: an edge is never
            // charged for crossing its own two ends
            const boxes = [src, tar].map(p => ({ l: p.x - p.w / 2 + 1, r: p.x + p.w / 2 - 1, t: p.y - p.h / 2 + 1, b: p.y + p.h / 2 - 1 }));
            const doublesBack = (points) => {
                for (let i = 0; i + 1 < points.length; i++) {
                    for (const box of boxes) if (segmentHitsBox(points[i], points[i + 1], box)) return true;
                }
                return false;
            };

            let bestRoute = route, bestScore = tangle(plan, nodes, edges);
            for (const s of SIDES) {
                for (const t of SIDES) {
                    if (trials-- <= 0) break;
                    if (s === route.srcSide && t === route.tarSide) continue;

                    const candidate = routeVia(src, tar, s, t);
                    if (doublesBack(candidate.points)) continue;

                    plan.routes.set(e.id, candidate);
                    const score = tangle(plan, nodes, edges);
                    if (score < bestScore) { bestScore = score; bestRoute = candidate; improved = true; }
                }
            }
            plan.routes.set(e.id, bestRoute);
        }

        if (!improved) break;
    }
}

function tangle(plan, nodes, edges) {
    const box = (id) => {
        const p = plan.at.get(id);
        return { l: p.x - p.w / 2, r: p.x + p.w / 2, t: p.y - p.h / 2, b: p.y + p.h / 2 };
    };
    const segmentsOf = (e) => {
        const pts = plan.routes.get(e.id)?.points ?? [];
        const out = [];
        for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i], pts[i + 1]]);
        return out;
    };

    // two runs lying along each other, which reads as one line and hides an edge. this is
    // counted even for edges that meet at a shared node: two loop-backs returning to the
    // same node from the same side approach it along the very same stretch, and skipping
    // pairs that share an end — as a plain crossing test must — misses it entirely
    const runsAlong = (a, b) => {
        const [p1, p2] = a, [p3, p4] = b;
        if (Math.abs(p1.x - p2.x) < 0.5 && Math.abs(p3.x - p4.x) < 0.5 && Math.abs(p1.x - p3.x) < 2) {
            const lo = Math.max(Math.min(p1.y, p2.y), Math.min(p3.y, p4.y));
            const hi = Math.min(Math.max(p1.y, p2.y), Math.max(p3.y, p4.y));
            return hi - lo > 5;
        }
        if (Math.abs(p1.y - p2.y) < 0.5 && Math.abs(p3.y - p4.y) < 0.5 && Math.abs(p1.y - p3.y) < 2) {
            const lo = Math.max(Math.min(p1.x, p2.x), Math.min(p3.x, p4.x));
            const hi = Math.min(Math.max(p1.x, p2.x), Math.max(p3.x, p4.x));
            return hi - lo > 5;
        }
        return false;
    };

    const endsOf = (e) => {
        const pts = plan.routes.get(e.id)?.points ?? [];
        return { first: pts[0], last: pts[pts.length - 1] };
    };

    // where two segments meet, for telling a real crossing from two edges joining at a node
    const crossPoint = (p1, p2, p3, p4) => {
        const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
        if (!d) return null;
        const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    };

    let through = 0, crossings = 0, overlaps = 0, alongside_ = 0;
    // the pairwise terms below compare every edge against every node and every other edge,
    // and this runs once per plan and several more times inside each repair. that is
    // affordable for a chart someone drew by hand and ruinous for a very large generated
    // one, where the same guard the column solver already uses applies: past a certain
    // size, keeping the drawing compact and unkinked matters more than the last crossing,
    // and the terms that cost nothing to compute carry the score on their own
    const useGeometry = edges.length <= GEOMETRY_LIMIT;

    if (useGeometry) {
    for (const e of edges) {
        for (const [p, q] of segmentsOf(e)) {
            for (const n of nodes) {
                if (n.id === e.sourceNodeId || n.id === e.targetNodeId) continue;
                if (segmentHitsBox(p, q, box(n.id))) { through++; break; }
            }
        }
    }
    for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
            const e = edges[i], f = edges[j];

            // where the two are entitled to touch. an edge leaving a node and an edge
            // arriving at it meet at that node's anchor, and every such pair "crosses"
            // there — which is why a shared end used to rule the pair out of the crossing
            // test altogether. that also excused the crossings a shared end does not
            // explain: a loop-back coming into a node's side cuts clean through the edge
            // leaving that same side, well away from the anchor, and went uncounted
            const ee = endsOf(e), fe = endsOf(f);
            const meet = [];
            if (e.sourceNodeId === f.sourceNodeId) meet.push(ee.first, fe.first);
            if (e.sourceNodeId === f.targetNodeId) meet.push(ee.first, fe.last);
            if (e.targetNodeId === f.sourceNodeId) meet.push(ee.last,  fe.first);
            if (e.targetNodeId === f.targetNodeId) meet.push(ee.last,  fe.last);

            // counted apart, because a pair can be guilty of both at once and lumping them
            // into one verdict prices that pair as a single blemish. it is two, and a plan
            // that trades them for one genuine crossing elsewhere is the tidier drawing
            let crossed = false, alongside = false;
            for (const a of segmentsOf(e)) {
                for (const b of segmentsOf(f)) {
                    if (runsAlong(a, b)) { alongside = true; continue; }
                    if (crossed || !segmentsCross(a[0], a[1], b[0], b[1])) continue;

                    const hit = crossPoint(a[0], a[1], b[0], b[1]);
                    if (hit && meet.some(m => m && Math.abs(m.x - hit.x) < 3 && Math.abs(m.y - hit.y) < 3)) continue;
                    crossed = true;
                }
            }
            if (crossed)   crossings++;
            if (alongside) alongside_++;
        }
    }
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = box(nodes[i].id), b = box(nodes[j].id);
            if (a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t) overlaps++;
        }
    }
    }
    // length is the tie-breaker. plans very often come out level on crossings and overlaps,
    // and without this the first one tried simply wins — leaving a node parked far from
    // what it connects to, trailing a long edge across the drawing, when an equally clean
    // plan had it close by. weighted far below the rest so it only settles genuine ties
    let length = 0;
    for (const e of edges) {
        for (const [p, q] of segmentsOf(e)) length += Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
    }

    let corners = 0;
    for (const e of edges) corners += Math.max(0, (plan.routes.get(e.id)?.points?.length ?? 2) - 2);

    return overlaps * W_OVERLAP + (crossings + alongside_) * W_CROSSING + through * W_OVERLAP
         + corners * W_CORNER + length * W_LENGTH;
}

// returns how many nodes actually moved
export function arrange(lf) {
    const nodes = lf.graphModel.nodes;
    const edges = lf.graphModel.edges;
    if (!nodes.length) return 0;

    // two things are genuinely open: which side of the drawing each loop-back runs down,
    // and which way round two nodes sharing a row should sit. neither can be settled by a
    // rule — the right answer depends on everything else in the way — and taking either
    // from where the nodes happen to be right now means a chart drawn awkwardly stays
    // awkward. so both are treated as choices: the whole layout is planned once per
    // combination and the tidiest is kept. charts offer very few of these, so it stays
    // cheap; past a handful, fall back to one sensible guess rather than 2^n plans
    const guess = new Map();
    for (const e of edges) {
        guess.set(e.id, (lf.getNodeModelById(e.sourceNodeId)?.x ?? 0) > (lf.getNodeModelById(e.targetNodeId)?.x ?? 0) ? 'right' : 'left');
    }

    const probe = planLayout(lf, guess);
    if (!probe) return 0;

    const headLiftables = [...probe.headLiftable];

    // a head-lift moves a whole block to another row, and changed rows change which edges
    // span a row and which blocks share one. candidates read only off the unlifted probe
    // therefore hide exactly the moves a lift needs in order to pay off — and a lift whose
    // partner move is missing scores worse than no lift at all, so it is rejected, and the
    // partner never becomes visible. that is a deadlock, not a preference: on the sum/count
    // chart the lift wants the branch it uncovers swapped to the other side of the row, and
    // neither the lift nor the swap is an improvement without the other. the lifted probe's
    // candidates are unioned in so the search can reach the two together
    const lifted = headLiftables.length
        ? planLayout(lf, guess, new Set(), new Set(), new Set(headLiftables))
        : null;
    const union = (a, b) => [...new Set([...a, ...(b ?? [])])];

    const multiRow  = new Set(union(probe.multiRow, lifted?.multiRow));
    const spanning  = edges.map(e => e.id).filter(id => multiRow.has(id));
    const liftables = union(probe.liftable, lifted?.liftable);
    const swappable = union(probe.sameRow,  lifted?.sameRow);

    // the choices are counted in mixed bases rather than read off a bitmask, and the count
    // stops before it can outgrow the budget — anything left over keeps the opening guess
    // and is left to the refinement rounds below. lanes are enumerated by side only, which
    // is what halves them from four choices to two and is why they now all fit; how far out
    // each one runs is refined afterwards, a lane at a time.
    //
    // head-lifts are claimed before the lanes, and a couple of them at most. tried after
    // the search instead — against whichever lane choice already won — they cannot be
    // taken at all when the lift and the lane side only pay off together: the search
    // settles the lanes while every plan is unlifted, and against that lane choice the
    // lift is a loss, so it is refused and its lane is never reconsidered. that is what
    // strung the sum/count chart's loop body out into three columns when one was
    // available. going first they cost a factor of two or four, which the lanes can
    // spare; the cap is what stops a chart full of them from crowding the lanes out
    // altogether, and any beyond it still get their sequential try in the refinement
    // rounds below, exactly as all of them used to.
    //
    // each plan is a full re-solve — relaxation, routing, repairs, scoring — and scoring
    // alone compares every edge against every other, so the cost of one plan climbs with
    // the square of the chart while the number of plans climbs with its loop-backs. left
    // at a flat few hundred the two multiply: a chart of eighty nodes took seven seconds
    // to arrange, which is not a button press any more.
    //
    // so the budget is what the chart can afford. small charts — which is nearly all of
    // them, and the ones whose every kink is visible — still get the full search; bigger
    // ones trade breadth for finishing promptly, and lose little by it, since their score
    // is carried by compactness that the opening guess already comes close to
    const BUDGET = edges.length <= 25  ? 256
                 : edges.length <= 45  ? 64
                 : edges.length <= 80  ? 16
                 : 8;
    const HEAD_AXES = 2; // leaves the lanes at least a quarter of the budget
    const radix = [];
    for (const b of headLiftables.slice(0, HEAD_AXES)) if (radix.reduce((n, r) => n * r, 1) * 2 <= BUDGET) radix.push(2);
    const headCount = radix.length;
    for (const key of spanning)   if (radix.reduce((n, r) => n * r, 1) * LANE_SIDES.length <= BUDGET) radix.push(LANE_SIDES.length);
    const sideCount = radix.length - headCount;
    for (const id of liftables)   if (radix.reduce((n, r) => n * r, 1) * 2 <= BUDGET) radix.push(2);
    const liftCount = radix.length - headCount - sideCount;
    for (const pair of swappable) if (radix.reduce((n, r) => n * r, 1) * 2 <= BUDGET) radix.push(2);

    const plans = radix.reduce((n, r) => n * r, 1);

    let best = null, bestScore = Infinity, bestSides = guess, bestSwaps = new Set(), bestLifts = new Set(), bestHeads = new Set();
    for (let index = 0; index < plans; index++) {
        const digits = [];
        let rest = index;
        for (const r of radix) { digits.push(rest % r); rest = Math.floor(rest / r); }

        const heads = new Set();
        for (let i = 0; i < headCount; i++) if (digits[i]) heads.add(headLiftables[i]);

        const sides = new Map(guess);
        for (let i = 0; i < sideCount; i++) sides.set(spanning[i], LANE_SIDES[digits[headCount + i]]);

        const lifts = new Set();
        for (let i = 0; i < liftCount; i++) if (digits[headCount + sideCount + i]) lifts.add(liftables[i]);

        const swaps = new Set();
        for (let i = 0; i < radix.length - headCount - sideCount - liftCount; i++) {
            if (digits[headCount + sideCount + liftCount + i]) swaps.add(swappable[i]);
        }

        const plan = planLayout(lf, sides, swaps, lifts, heads);
        if (!plan) continue;
        const score = tangle(plan, nodes, edges);
        if (score < bestScore) { bestScore = score; best = plan; bestSides = sides; bestSwaps = swaps; bestLifts = lifts; bestHeads = heads; }
    }
    if (!best) best = probe;

    // the remaining choices are refined against the winning plan rather than searched
    // alongside the lanes, which would multiply the count past the budget for no gain.
    //
    // the candidates come from the plan in hand, not from the opening probe: lifting a
    // branch changes the rows, and changed rows mean different branches are worth
    // levelling and different pairs share a row — a list taken once at the start goes
    // stale the moment the search picks a plan unlike the guess. re-read each round, and
    // the round repeats while anything still improves, so a choice that only pays off
    // once another has been made is still reachable — taking them strictly one at a time
    // and never looking again cannot find those
    // every trial here is another full re-solve, and the candidate lists grow with the
    // chart — a big one offers dozens of same-row pairs alone, which at four rounds is
    // hundreds of re-solves on top of the search. capped, so refinement costs a bounded
    // amount however large the chart gets
    let trials = edges.length <= 25 ? 60 : edges.length <= 45 ? 24 : 8;

    // lanes get an allowance of their own rather than drawing on the one above, so that a
    // chart with several loop-backs cannot spend it all on same-row pairs and leave its
    // lanes — the choice that decides the most — untried
    let laneTrials = edges.length <= 25 ? 48 : edges.length <= 45 ? 24 : 8;

    let headLifts = bestHeads;
    for (let round = 0; round < 4 && (trials > 0 || laneTrials > 0); round++) {
        let improved = false;

        // ---- lane sides, one lane at a time ----
        //
        // the enumeration above can only afford so many lanes before the budget stops it,
        // and every lane past that point kept the opening guess and was never looked at
        // again — the guess being read off wherever the nodes happened to already sit. a
        // chart with four loop-backs spends its whole budget on three of them, so the
        // fourth is decided by nothing at all. that is the difference between a crossing
        // and none on the sort chart, whose bottom loop-back is exactly that fourth lane.
        //
        // tried here instead, where a lane costs three plans rather than multiplying every
        // other plan by four. one lane moves at a time and the rounds repeat while anything
        // improves, so lanes that only pay off together are still reachable across rounds
        for (const id of spanning) {
            if (laneTrials <= 0) break;

            const current = bestSides.get(id);
            let bestChoice = null;
            for (const choice of LANE_CHOICES) {
                if (choice === current || laneTrials-- <= 0) continue;

                const sides = new Map(bestSides);
                sides.set(id, choice);
                const trial = planLayout(lf, sides, bestSwaps, bestLifts, headLifts);
                if (!trial) continue;

                const score = tangle(trial, nodes, edges);
                if (score >= bestScore) continue;
                bestScore = score; best = trial; bestChoice = sides; // keep looking: another side may be better still
            }
            if (bestChoice) { bestSides = bestChoice; improved = true; }
        }

        for (const [candidates, chosen] of [[best.headLiftable, headLifts], [best.liftable, bestLifts], [best.sameRow, bestSwaps]]) {
            for (const candidate of candidates) {
                if (chosen.has(candidate) || trials-- <= 0) continue;

                const tried = new Set([...chosen, candidate]);
                const trial = planLayout(lf, bestSides,
                    chosen === bestSwaps ? tried : bestSwaps,
                    chosen === bestLifts ? tried : bestLifts,
                    chosen === headLifts ? tried : headLifts);
                if (!trial) continue;

                const score = tangle(trial, nodes, edges);
                if (score >= bestScore) continue;

                bestScore = score;
                best = trial;
                if      (chosen === headLifts) headLifts = tried;
                else if (chosen === bestLifts) bestLifts = tried;
                else                           bestSwaps = tried;
                improved = true;
            }
        }

        if (!improved) break;
    }

    refineAnchors(best, nodes, edges);

    // compared with a tolerance, not exactly: re-arranging a settled chart recomputes the
    // same positions to within floating-point dust, and treating that as movement would
    // both churn the model and overstate how much the button actually did
    let moved = 0;
    for (const n of nodes) {
        if (!best.reachable.has(n.id)) continue; // leave anything not connected to START untouched
        const p = best.at.get(n.id);
        if (Math.abs(p.x - n.x) > 0.01 || Math.abs(p.y - n.y) > 0.01) {
            lf.graphModel.moveNode2Coordinate(n.id, p.x, p.y);
            moved++;
        }
    }

    // the chosen anchors have to be written back, not just the path. an edge remembers
    // which anchor each end is tied to, and on the next render it pulls its ends back to
    // those — so a path drawn to a different side gets yanked sideways into the old one,
    // which is where the odd diagonal kinks came from. moving an edge onto whichever
    // anchor suits the new layout is the point, so the ids move with it
    const SIDE_INDEX = { top: 0, right: 1, bottom: 2, left: 3 };
    for (const e of edges) {
        const route = best.routes.get(e.id);
        if (!route) continue;

        const src = lf.getNodeModelById(e.sourceNodeId);
        const tar = lf.getNodeModelById(e.targetNodeId);
        const srcAnchor = src?.anchors?.[SIDE_INDEX[route.srcSide]];
        const tarAnchor = tar?.anchors?.[SIDE_INDEX[route.tarSide]];
        if (srcAnchor) e.sourceAnchorId = srcAnchor.id;
        if (tarAnchor) e.targetAnchorId = tarAnchor.id;

        // take the ends from the anchors themselves so the path meets the node exactly
        // where the anchor sits, rather than where the plan predicted it would
        const first = srcAnchor ? { x: srcAnchor.x, y: srcAnchor.y } : route.points[0];
        const last  = tarAnchor ? { x: tarAnchor.x, y: tarAnchor.y } : route.points[route.points.length - 1];
        const middle = route.points.slice(1, -1).map(p => ({ ...p }));

        e.startPoint = { ...first };
        e.endPoint   = { ...last };
        e.pointsList = [first, ...middle, last];
        e.initPoints();
        e.resetTextPosition();
    }

    return moved;
}
