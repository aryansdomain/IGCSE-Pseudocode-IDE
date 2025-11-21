export function initFiles({codeEl, filesEl}) {

    const STORAGE_KEY = 'igcse_ide_files';

    // ------------------------ State ------------------------

    let editor, saveTimeout = null;
    let fileCounter = 0;

    let order = []; // array of ids
    let activeFileID = null;
    let files = {};

    // ------------------------ Utilities ------------------------

    function nextFilename() {
        const names = new Set(Object.values(files).map(f => f.name));

        let i = 1;
        let test = `file${i}`;
        while (names.has(test)) {
            i++;
            test = `file${i}`;
        }
        return test;
    }

    const DEFAULT_CODE = `// Type your code here!

DECLARE Name : STRING

FUNCTION Greet(Name : STRING) RETURNS STRING
    RETURN "Hello, ", Name, "!"
ENDFUNCTION

OUTPUT "Enter your name: "
INPUT Name
OUTPUT Greet(Name)
`;

    // ------------------------ Session Management ------------------------

    function createSession(id, content, mode) {
        const session = new ace.EditSession(content || '');
        session.setMode(mode || 'ace/mode/pseudocode');
        session.setUseSoftTabs(true);
        session.setTabSize(4);

        // undo manager
        try {
            const { UndoManager } = ace.require('ace/undomanager');
            session.setUndoManager(new UndoManager());
        } catch {}

        session.on('change', () => {
            if (!files[id]) return;
            saveToStorage();
        });
        
        return session;
    }

    function setSession() {
        const file = files[activeFileID];
        if (!file) return;

        editor.setSession(file.session);
    }

    // ------------------------ File Management ------------------------

    function isValidName(name) {
        return /^[A-Za-z0-9_-]{1,16}$/.test(name);
    }

    function addFileInternal({ id, name, content = '', setActive }) {
        const session = createSession(id, content, 'ace/mode/pseudocode');

        files[id] = { id, name, mode: 'ace/mode/pseudocode', session };

        if (!order.includes(id)) order.push(id);
        if (setActive) activeFileID = id;

        setSession();
        saveToStorage();
        setPreferWorkspace();
        renderFiles();
    }
    function addFile() {
        const id = 'f_' + (++fileCounter);
        addToHistory(
            () => { addFileInternal({ id, name: nextFilename(), content: '', setActive: true }) },
            () => { removeFileInternal(id); }
        );
    }

    // close without history
    function removeFileInternal(id) {
        if (order.length === 1) return; // keep at least one

        const idx = order.indexOf(id);
        if (idx >= 0) order.splice(idx, 1);

        const f = files[id];
        delete files[id];

        // remove event listeners
        if (f && f.session) {
            try { f.session.removeAllListeners && f.session.removeAllListeners('change'); } catch {}
        }

        // set the active file to something new
        if (activeFileID === id) {
            const next = order[Math.max(0, idx - 1)] || order[0] || null;
            activeFileID = next;
            setSession();
        }

        saveToStorage();
        renderFiles();
    }
    function removeFile(id) {
        if (!id) id = activeFileID;
        if (!id) return;
        if (order.length === 1) return;

        const idx = order.indexOf(id);
        const f = files[id];
        if (!f) return;
        const snapshot = {
            id: f.id,
            name: f.name,
            mode: f.mode,
            content: f.session.getValue()
        };

        addToHistory(
            () => { removeFileInternal(id); saveToStorage(); setPreferWorkspace(); },
            () => { restoreClosedFile(snapshot, idx); }
        );
    }

    function renameFile(id, newName) {
        const file = files[id];
        if (!file) return;

        const name = String(newName).trim();
        if (!name || !isValidName(name) || name === file.name) return;
        const old = file.name;

        addToHistory(
            () => { file.name = name; saveToStorage(); renderFiles(); setPreferWorkspace(); },
            () => { file.name = old;  saveToStorage(); renderFiles(); }
        );
    }

    function startRename(id, btn) {
        const file = files[id];
        if (!file) return;
        const nameSpan = btn.querySelector('.name');
        if (!nameSpan) return;

        const cleanup = () => {
            nameSpan.contentEditable = 'false';
            nameSpan.removeEventListener('blur', handleBlur);
            nameSpan.removeEventListener('keydown', handleKeydown);
        };

        const revert = () => {
            nameSpan.textContent = file.name;
        };

        const handleBlur = () => {
            const newName = nameSpan.textContent.trim();
            if (!newName || !isValidName(newName)) {
                revert();
                return;
            }
            if (newName !== file.name) {
                renameFile(id, newName);
            } else {
                revert();
            }

            cleanup();
        };

        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameSpan.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                revert();
                cleanup();
            }
        };

        // highlight, make editable
        if (nameSpan.isConnected) {
            try {
                const range = document.createRange();
                range.selectNodeContents(nameSpan);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            } catch {}
        }

        nameSpan.contentEditable = 'true';
        nameSpan.focus();
        nameSpan.addEventListener('blur', handleBlur);
        nameSpan.addEventListener('keydown', handleKeydown);
    }

    // ------------------------ Saving to localStorage ------------------------

    function saveToStorage() {
        clearTimeout(saveTimeout);

        // save after 300ms
        saveTimeout = setTimeout(() => {
            const payload = {
                order: [...order],
                activeFileID: activeFileID,
                files: {},
            };
            for (const id of order) {
                const file = files[id];
                payload.files[id] = {
                    id: file.id,
                    name: file.name,
                    mode: file.mode,
                    content: file.session.getValue(),
                };
            }
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            } catch {}
        }, 300);
    }

    function loadFromStorage() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            try {
                const data = JSON.parse(raw);
                order = Array.isArray(data.order) ? data.order.slice() : [];
                activeFileID = data.activeFileID || null;
                files = {};
                
                let maxCounter = 0;
                for (const id of order) {
                    const file = data.files[id];
                    if (!file) continue;

                    const match = id.match(/^f_(\d+)$/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > maxCounter) maxCounter = num;
                    }

                    const session = createSession(id, file.content || '', file.mode);
                    files[id] = {
                        id: file.id,
                        name: file.name,
                        mode: file.mode,
                        session,
                    };
                }
                fileCounter = maxCounter;
                
                if (!activeFileID && order.length) activeFileID = order[0];
                return;
            } catch {}
        }
    }

    // ------------------------ Rendering ------------------------

    function renderFiles() {
        const frag = document.createDocumentFragment();

        for (const id of order) {
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
            if (order.length > 1) {
                const closeIcon = document.createElement('i');
                closeIcon.className = 'fa-solid fa-xmark close';
                closeIcon.title = 'Close';
                btn.appendChild(closeIcon);
            }
            
            frag.appendChild(btn);
        }

        // show add button if 5 or fewer files (6 max)
        if (order.length <= 6) {
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

    const HIST_LIMIT = 50;
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

    function restoreClosedFile(snapshot, index) {
        if (!snapshot || !snapshot.id) return;
        const { id, name, mode, content } = snapshot;
        const session = createSession(id, content || '', mode || 'ace/mode/pseudocode');
        files[id] = { id, name, mode: mode || 'ace/mode/pseudocode', session };

        if (index < 0 || index > order.length) index = order.length;
        order.splice(index, 0, id);

        const match = id.match(/^f_(\d+)$/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (!Number.isNaN(num) && num > fileCounter) fileCounter = num;
        }

        activeFileID = id;
        setSession();
        saveToStorage();
        renderFiles();
    }

    // ------------------------ Init ------------------------

    editor = ace.edit(codeEl);
    loadFromStorage();

    // make a new file if none exist
    if (!order.length) {
        addFileInternal({ id: 'f_1', name: "file1", content: DEFAULT_CODE, setActive: true });
        fileCounter = 1;
        saveToStorage();
    }

    renderFiles();
    setSession();


    // select active file, add or delete
    filesEl.addEventListener('click', (e) => {
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
        activeFileID = id;
        
        setSession();
        saveToStorage();
        renderFiles();
    });

    // enter to rename
    filesEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        
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

        const key = (e.key || '').toLowerCase();
    
        const session = editor && editor.getSession && editor.getSession();
        const um = session && session.getUndoManager && session.getUndoManager();
        const canTextUndo = !!(um && um.hasUndo && um.hasUndo());
        const canTextRedo = !!(um && um.hasRedo && um.hasRedo());

        // undo (Cmd/Ctrl+Z)
        if (key === 'z' && !e.shiftKey) {
            const routeWorkspace = shouldPreferWorkspace() || !canTextUndo;
            if (routeWorkspace && undo()) {
                e.preventDefault();
                e.stopPropagation();
            }
        }

        // redo (Shift+Cmd/Ctrl+Z or Cmd/Ctrl+Y)
        if ((key === 'z' && e.shiftKey) || key === 'y') {
            const routeWorkspace = shouldPreferWorkspace() || !canTextRedo;
            if (routeWorkspace && redo()) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }, { capture: true });

    return {
        addFile,
        removeFile,
        getActiveFileName: () => files[activeFileID].name,
    };
}
