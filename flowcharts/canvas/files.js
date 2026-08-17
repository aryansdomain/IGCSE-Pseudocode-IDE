import { storageKey } from '../traceTable/traceTable.js';

export const DEFAULT_FLOWCHART = {
    nodes: [
        { id: 'n1', type: 'terminator', x: 300, y: 120, text: { value: 'START',                x: 300, y: 120 } },
        { id: 'n2', type: 'process',    x: 300, y: 210, text: { value: 'count <- 0\nsum <- 0', x: 300, y: 210 } },
        { id: 'n3', type: 'decision',   x: 300, y: 338, text: { value: 'IS count < 10?',       x: 300, y: 338 } },
        { id: 'n4', type: 'io',         x: 300, y: 470, text: { value: 'INPUT num',            x: 300, y: 470 } },
        { id: 'n5', type: 'decision',   x: 300, y: 600, text: { value: 'IS num > 0?',          x: 300, y: 600 } },
        { id: 'n6', type: 'process',    x: 540, y: 742, text: { value: 'sum <- sum + num',     x: 540, y: 742 } },
        { id: 'n7', type: 'process',    x: 300, y: 742, text: { value: 'count <- count + 1',   x: 300, y: 742 } },
        { id: 'n8', type: 'io',         x: 527, y: 338, text: { value: 'OUTPUT sum',           x: 527, y: 338 } },
        { id: 'n9', type: 'terminator', x: 686, y: 338, text: { value: 'STOP',                 x: 686, y: 338 } }
    ],
    edges: [
        {
            type: 'polyline', sourceNodeId: 'n1', targetNodeId: 'n2',
            sourceAnchorId: 'n1_2', targetAnchorId: 'n2_0',
            pointsList: [{ x: 300, y: 140.5 }, { x: 300, y: 177 }]
        },
        {
            type: 'polyline', sourceNodeId: 'n2', targetNodeId: 'n3',
            sourceAnchorId: 'n2_2', targetAnchorId: 'n3_0',
            pointsList: [{ x: 300, y: 243 }, { x: 300, y: 280.4 }]
        },
        {
            type: 'polyline', sourceNodeId: 'n3', targetNodeId: 'n4',
            sourceAnchorId: 'n3_2', targetAnchorId: 'n4_0',
            pointsList: [{ x: 300, y: 395.6 }, { x: 300, y: 447.5 }],
            text: { value: 'YES' }
        },
        {
            type: 'polyline', sourceNodeId: 'n4', targetNodeId: 'n5',
            sourceAnchorId: 'n4_2', targetAnchorId: 'n5_0',
            pointsList: [{ x: 300, y: 492.5 }, { x: 300, y: 542.4 }]
        },
        {
            type: 'polyline', sourceNodeId: 'n5', targetNodeId: 'n6',
            sourceAnchorId: 'n5_1', targetAnchorId: 'n6_0',
            pointsList: [{ x: 371.2, y: 600 }, { x: 540, y: 600 }, { x: 540, y: 719.5 }],
            text: { value: 'YES' }
        },
        {
            type: 'polyline', sourceNodeId: 'n6', targetNodeId: 'n7',
            sourceAnchorId: 'n6_3', targetAnchorId: 'n7_1',
            pointsList: [{ x: 452.8, y: 742 }, { x: 395.6, y: 742 }]
        },
        {
            type: 'polyline', sourceNodeId: 'n5', targetNodeId: 'n7',
            sourceAnchorId: 'n5_2', targetAnchorId: 'n7_0',
            pointsList: [{ x: 300, y: 657.6 }, { x: 300, y: 719.5 }],
            text: { value: 'NO' }
        },
        {
            type: 'polyline', sourceNodeId: 'n7', targetNodeId: 'n3',
            sourceAnchorId: 'n7_3', targetAnchorId: 'n3_3',
            pointsList: [{ x: 204.4, y: 742 }, { x: 170, y: 742 }, { x: 170, y: 338 }, { x: 228.8, y: 338 }]
        },
        {
            type: 'polyline', sourceNodeId: 'n3', targetNodeId: 'n8',
            sourceAnchorId: 'n3_1', targetAnchorId: 'n8_3',
            pointsList: [{ x: 371.2, y: 338 }, { x: 455, y: 338 }],
            text: { value: 'NO' }
        },
        {
            type: 'polyline', sourceNodeId: 'n8', targetNodeId: 'n9',
            sourceAnchorId: 'n8_1', targetAnchorId: 'n9_3',
            pointsList: [{ x: 599, y: 338 }, { x: 648.7, y: 338 }]
        }
    ]
};

// `locked` blocks switching/adding/closing files (a run writes into the active file's
// trace table, so changing files mid-run would spill it into another chart's table)
export function initFiles({ filesEl, lf, onRender = null, locked = () => false }) {
    const STORAGE_KEY = 'igcse_ide_flowchart_files';
    const HIST_LIMIT = 50;

    let saveTimeout = null;
    let fileCounter = 0;
    let activeFileID = null;
    let files = {};

    function ids() { return Object.keys(files); } // list of ids

    // ------------------------ Utilities ------------------------

    function nextFilename() {
        const names = new Set(Object.values(files).map(f => f.name));
        let i = 1;
        while (names.has(`chart${i}`)) i++;
        return `chart${i}`;
    }

    function isValidName(name) {
        return /^[A-Za-z0-9_-]{1,20}$/.test(name);
    }

    // ------------------------ File Management ------------------------

    function setActiveFile(id) {
        if (activeFileID && files[activeFileID])
            files[activeFileID].graphData = lf.getGraphData();
        activeFileID = id;
        renderGraph();
        save();
        renderFiles();
    }

    function renderGraph() {
        const file = files[activeFileID];
        if (!file) return;

        lf.render(file.graphData || { nodes: [], edges: [] });
        onRender?.();
    }

    // add without history
    function addFileInternal(id, name, graphData = null, setActive) {
        files[id] = { id, name, graphData: graphData || { nodes: [], edges: [] } };

        if (setActive) {
            if (activeFileID && files[activeFileID])
                files[activeFileID].graphData = lf.getGraphData();
            activeFileID = id;
        }

        renderGraph();
        save();
        setPreferWorkspace();
        renderFiles();
    }
    function addFile() {
        const id = String(++fileCounter);
        addToHistory(
            () => { addFileInternal(id, nextFilename(), null, true); },
            () => { removeFileInternal(id); }
        );
    }

    // remove without history
    function removeFileInternal(id) {
        if (ids().length === 1) return; // keep at least one

        const index = ids().indexOf(id);
        delete files[id];
        localStorage.removeItem(storageKey(id)); // drop the file's trace table too

        // set the active file to something new
        if (activeFileID === id) {
            const all = ids();
            const next = all[Math.max(0, index - 1)] || all[0] || null;
            activeFileID = next;
            renderGraph();
        }

        save();
        renderFiles();
    }
    function removeFile(id) {
        if (!id) id = activeFileID;
        if (!id) return;
        if (ids().length === 1) return;

        const f = files[id];
        if (!f) return;
        const snapshot = {
            id:        f.id,
            name:      f.name,
            graphData: id === activeFileID ? lf.getGraphData() : f.graphData,
            trace:     localStorage.getItem(storageKey(id)) // so undo brings the trace table back
        };

        addToHistory(
            () => { removeFileInternal(id); save(); setPreferWorkspace(); },
            () => { restoreClosedFile(snapshot); }
        );
    }

    function renameFileInternal(id, newName) {
        const file = files[id];
        if (!file) return;

        newName = String(newName).trim();
        if (!isValidName(newName) || newName === file.name) return;
        if (Object.values(files).some(f => f !== file && f.name === newName)) return;
        const oldName = file.name;

        addToHistory(
            () => {
                file.name = newName;
                save(); renderFiles(); setPreferWorkspace();
            },
            () => {
                file.name = oldName;
                save(); renderFiles();
            }
        );
    }
    function renameFile(oldName, newName) {
        const id = Object.keys(files).find(k => files[k].name === oldName); // find oldName

        if (!id)                                                return { ok: false, error: `File ${oldName} not found`                                         };
        if (Object.values(files).some(f => f.name === newName)) return { ok: false, error: `Name ${newName} already exists`                                    };
        if (!isValidName(newName))                              return { ok: false, error: `Invalid name (use 1-20 letters, numbers, underscores, or hyphens)` };

        renameFileInternal(id, newName);
        return { ok: true };
    }

    function startRename(id, btn) {
        const file = files[id];
        if (!file) return;
        const nameSpan = btn.querySelector('.name');
        if (!nameSpan) return;

        const input = document.createElement('input');
        input.className = 'name-input';
        input.value = file.name;
        input.spellcheck = false;
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.style.width = nameSpan.getBoundingClientRect().width + 'px';

        nameSpan.replaceWith(input);
        input.focus();
        input.select();

        let done = false;

        const finish = () => {
            if (done) return;
            done = true;
            const newName = input.value.trim();
            const oldName = file.name;
            input.replaceWith(nameSpan);
            if (!newName || newName === oldName) return;
            renameFileInternal(id, newName);
            if (file.name !== newName) nameSpan.textContent = file.name; // revert on failure
        };

        const stop = () => {
            if (done) return;
            done = true;
            input.replaceWith(nameSpan);
        };

        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
            else if (e.key === 'Escape') { e.preventDefault(); stop(); }
        });
    }

    // ------------------------ localStorage ------------------------

    function save() {
        clearTimeout(saveTimeout);

        // save after 300ms
        saveTimeout = setTimeout(() => {
            if (activeFileID && files[activeFileID])
                files[activeFileID].graphData = lf.getGraphData();

            const payload = {
                activeFileID,
                fileCounter, // persisted so a deleted file's id is never handed out again
                files: {}
            };
            for (const id of ids()) {
                const file = files[id];
                payload.files[id] = {
                    id:        file.id,
                    name:      file.name,
                    graphData: file.graphData
                };
            }
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            } catch {}
        }, 300);
    }

    function load() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            activeFileID = data.activeFileID != null ? String(data.activeFileID) : null;
            files = {};

            let maxCounter = 0;
            for (const id of Object.keys(data.files || {})) {
                const file = data.files[id];
                if (!file) continue;

                const match = id.match(/^(\d+)$/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxCounter) maxCounter = num;
                }

                files[id] = {
                    id,
                    name:      file.name,
                    graphData: file.graphData || { nodes: [], edges: [] }
                };
            }
            // never fall back below the saved counter: reusing a deleted file's id
            // would hand the new file that file's leftover trace table
            fileCounter = Math.max(maxCounter, parseInt(data.fileCounter, 10) || 0);

            if (!activeFileID && ids().length) activeFileID = ids()[0];
            return;
        }

        // Migration: old single-flowchart key
        const oldRaw = localStorage.getItem('igcse_ide_flowcharts');
        if (oldRaw) {
            const graphData = JSON.parse(oldRaw);
            files = { '1': { id: '1', name: 'chart1', graphData } };
            activeFileID = '1';
            fileCounter  = 1;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeFileID, fileCounter, files }));
            localStorage.removeItem('igcse_ide_flowcharts');
        }
    }

    // ------------------------ Rendering ------------------------

    function renderFiles() {
        const frag = document.createDocumentFragment();

        for (const id of ids()) {
            const file = files[id];
            const btn = document.createElement('button');

            btn.className = 'file' + (id === activeFileID ? ' active' : '');
            btn.setAttribute('data-id', id);
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', id === activeFileID ? 'true' : 'false');
            btn.title = file.name;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            nameSpan.textContent = file.name;

            btn.appendChild(nameSpan);

            // show close button if more than one file
            if (ids().length > 1) {
                const closeIcon = document.createElement('i');
                closeIcon.className = 'fa-solid fa-xmark close';
                closeIcon.title = 'Close';
                btn.appendChild(closeIcon);
            }

            frag.appendChild(btn);
        }

        // show add button if 6 or fewer files (7 max)
        if (ids().length <= 6) {
            const addBtn = document.createElement('button');
            addBtn.className = 'file add';
            addBtn.setAttribute('data-add', '1');
            addBtn.setAttribute('aria-label', 'New file');
            addBtn.textContent = '+';
            frag.appendChild(addBtn);
        }

        filesEl.replaceChildren(frag);
    }

    // ------------------------ Undo/Redo & History ------------------------

    let hist = [];
    let histIndex = -1;
    let preferUntil = 0;

    function setPreferWorkspace(delay = 2500) {
        preferUntil = Date.now() + delay;
    }
    function shouldPreferWorkspace() {
        return Date.now() < preferUntil;
    }

    function addToHistory(redo, undo) {
        if (histIndex < hist.length - 1) hist.splice(histIndex + 1);
        hist.push({ redo, undo });
        if (hist.length > HIST_LIMIT) { hist.shift(); histIndex--; } // too many actions

        // apply action now
        redo();
        histIndex++;
        setPreferWorkspace();
    }

    function undo() {
        const entry = hist[histIndex];
        if (!entry) return false;
        histIndex--;

        try { entry.undo && entry.undo(); } catch {}
        return true;
    }
    function redo() {
        const entry = hist[histIndex + 1];
        if (!entry) return false;
        histIndex++;

        try { entry.redo && entry.redo(); } catch {}
        return true;
    }

    function restoreClosedFile(snapshot) {
        if (!snapshot || !snapshot.id) return;
        const { id, name, graphData, trace } = snapshot;

        if (activeFileID && files[activeFileID])
            files[activeFileID].graphData = lf.getGraphData();

        files[id] = { id, name, graphData: graphData || { nodes: [], edges: [] } };

        // put the trace table back before rendering, so the reload below picks it up
        if (trace != null) localStorage.setItem(storageKey(id), trace);

        const match = id.match(/^(\d+)$/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (!Number.isNaN(num) && num > fileCounter) fileCounter = num;
        }

        activeFileID = id;
        renderGraph();
        save();
        renderFiles();
    }

    // ------------------------ Init ------------------------

    load();

    // make a new chart if none exist
    if (!ids().length) {
        addFileInternal('1', 'chart1', DEFAULT_FLOWCHART, true);
        fileCounter = 1;
        save();
    }

    pruneTraceTables();
    renderFiles();
    renderGraph();

    // clear out trace tables left behind by files that no longer exist
    function pruneTraceTables() {
        const prefix = storageKey('');
        const live = new Set(ids());
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (!key?.startsWith(prefix)) continue;
            if (!live.has(key.slice(prefix.length))) localStorage.removeItem(key);
        }
    }

    // select active file, add or delete
    filesEl.addEventListener('click', (e) => {
        if (locked()) return;
        setPreferWorkspace();

        // add button
        if (e.target.closest('[data-add]')) {
            addFile();
            return;
        }

        const btn = e.target.closest('[data-id]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');

        // close button
        if (e.target.matches('.close')) {
            removeFile(id);
            return;
        }

        // activate the file
        if (id === activeFileID || !files[id] || !id) return;

        setActiveFile(id);
    });

    // enter to rename
    filesEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || locked()) return;

        const btn = e.target.closest('[data-id]');
        if (!btn) return;

        const id = btn.getAttribute('data-id');
        const file = files[id];
        if (!file) return;

        e.preventDefault();
        startRename(id, btn);
    });

    // undo and redo
    document.addEventListener('keydown', (e) => {
        if (!e.metaKey && !e.ctrlKey) return;
        if (locked()) return; // undoing a close would switch files mid-run

        const key = (e.key || '').toLowerCase();

        // undo (Cmd/Ctrl+Z)
        if (key === 'z' && !e.shiftKey) {
            if (shouldPreferWorkspace() && undo()) {
                e.preventDefault();
                e.stopPropagation();
            }
        }

        // redo (Shift+Cmd/Ctrl+Z or Cmd/Ctrl+Y)
        if ((key === 'z' && e.shiftKey) || key === 'y') {
            if (shouldPreferWorkspace() && redo()) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }, { capture: true });

    return {
        addFile, renameFile, save,
        getActiveId:   () =>       activeFileID,
        getActiveName: () => files[activeFileID]?.name ?? 'flowchart'
    };
}
