export function initFiles({codeEl, filesEl, onRename = null}) {
    const STORAGE_KEY = 'igcse_ide_files';
    const HIST_LIMIT = 50;
    const DEFAULT_CODE = `// Type your code here!

DECLARE Name : STRING

FUNCTION Greet(Name : STRING) RETURNS STRING
    RETURN "Hello, ", Name, "!"
ENDFUNCTION

OUTPUT "Enter your name: "
INPUT Name
OUTPUT Greet(Name)
`;

    let editor, saveTimeout = null;
    let fileCounter = 0;

    let activeFileID = null;
    let files = {};

    function ids() { return Object.keys(files); } // list of ids

    // ------------------------ Utilities ------------------------

    function nextFilename() {
        const names = new Set(Object.values(files).map(f => f.name));
        let i = 1;
        while (names.has(`file${i}.psc`)) i++;
        return `file${i}.psc`;
    }

    function isValidName(name) {
        // position of dot
        const dotCol = name.indexOf('.');
        if (dotCol < 1 || dotCol !== name.lastIndexOf('.')) return false; // more than one, or zero

        const left  = name.slice(0, dotCol);
        const right = name.slice(   dotCol + 1);
        return /^[A-Za-z0-9_-]{1,16}$/.test(left) && (right === 'psc' || right === 'txt');
    }

    function modeForName(name) {
        return name.endsWith('.txt') ? 'ace/mode/text' : 'ace/mode/pseudocode';
    }

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
            save();
        });

        return session;
    }

    function setSession() {
        const file = files[activeFileID];
        if (!file) return;

        editor.setSession(file.session);
        const isText = file.mode === 'ace/mode/text';
        editor.setOptions({
            enableBasicAutocompletion: !isText,
            enableLiveAutocompletion:  !isText
        });
    }

    // ------------------------ File Management ------------------------

    function setActiveFile(name) {
        const file = Object.values(files).find(f => f.name === name);
        activeFileID = file.id;
        setSession();
        save();
        renderFiles();
    }

    // add without history
    function addFileInternal(id, name, content = '', setActive) {
        const mode = modeForName(name);
        const session = createSession(id, content, mode);

        files[id] = { id, name, mode, session };

        if (setActive) activeFileID = id;

        setSession();
        save();
        setPreferWorkspace();
        renderFiles();
    }
    function addFile() {
        const id = String(++fileCounter);
        addToHistory(
            () => { addFileInternal(id, nextFilename(), '', true); },
            () => { removeFileInternal(id); }
        );
    }

    // remove without history
    function removeFileInternal(id) {
        if (ids().length === 1) return; // keep at least one

        const index = ids().indexOf(id);
        const f = files[id];
        delete files[id];

        // remove event listeners
        if (f && f.session) {
            try { f.session.removeAllListeners && f.session.removeAllListeners('change'); } catch {}
        }

        // set the active file to something new
        if (activeFileID === id) {
            const all = ids();
            const next = all[Math.max(0, index - 1)] || all[0] || null;
            activeFileID = next;
            setSession();
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
            id: f.id,
            name: f.name,
            mode: f.mode,
            content: f.session.getValue()
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
        const oldMode = file.mode;

        addToHistory(
            () => {
                const newMode = modeForName(newName);
                file.name = newName;
                file.mode = newMode;
                file.session.setMode(newMode);
                if (id === activeFileID) setSession();
                save(); renderFiles(); setPreferWorkspace();
            },
            () => {
                file.name = oldName;
                file.mode = oldMode;
                file.session.setMode(oldMode);
                if (id === activeFileID) setSession();
                save(); renderFiles();
            }
        );
    }
    function renameFile(oldName, newName) {
        const id = Object.keys(files).find(k => files[k].name === oldName); // find oldName

        if (!id)                                                return { ok: false, error: `File ${oldName} not found`                                                 }; // file not found
        if (Object.values(files).some(f => f.name === newName)) return { ok: false, error: `Name ${newName} already exists`                                            }; // file already exists

        const dotCol = newName.indexOf('.');
        if (dotCol < 1)                                         return { ok: false, error: `Name must have an extension (.psc or .txt)`                                }; // no extension
        if (dotCol !== newName.lastIndexOf('.'))                return { ok: false, error: `Name must have exactly one dot`                                            };

        const ext  = newName.slice(   dotCol);
        const name = newName.slice(0, dotCol);
        if (ext !== '.psc' && ext !== '.txt')                   return { ok: false, error: `Invalid extension ${ext} (.psc or .txt)`                                   };
        if (name.length > 16)                                   return { ok: false, error: `Name too long (max 16 characters)`                                         };
        if (!/^[A-Za-z0-9_-]+$/.test(name))                     return { ok: false, error: `Invalid character in name (use letters, numbers, underscores, or hyphens)` };

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
            if (onRename) setTimeout(() => onRename(oldName, newName), 0);
            else renameFileInternal(id, newName);
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
            const payload = {
                activeFileID,
                files: {}
            };
            for (const id of ids()) {
                const file = files[id];
                payload.files[id] = {
                    id:      file.id,
                    name:    file.name,
                    mode:    file.mode,
                    content: file.session.getValue()
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
            try {
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

                    const session = createSession(id, file.content || '', file.mode);
                    files[id] = {
                        id,
                        name: file.name,
                        mode: file.mode,
                        session
                    };
                }
                fileCounter = maxCounter;

                if (!activeFileID && ids().length) activeFileID = ids()[0];
                return;
            } catch {}
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

    function restoreClosedFile(file) {
        if (!file || !file.id) return;
        const { id, name, mode, content } = file;
        const session = createSession(id, content || '', mode || 'ace/mode/pseudocode');
        files[id] = { id, name, mode: mode || 'ace/mode/pseudocode', session };

        const match = id.match(/^(\d+)$/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (!Number.isNaN(num) && num > fileCounter) fileCounter = num;
        }

        activeFileID = id;
        setSession();
        save();
        renderFiles();
    }

    // ------------------------ Init ------------------------

    editor = ace.edit(codeEl);
    load();

    // make a new file if none exist
    if (!ids().length) {
        addFileInternal('1', 'file1.psc', DEFAULT_CODE, true);
        fileCounter = 1;
        save();
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
        save();
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

    function getLines(name) {
        const file = Object.values(files).find(f => f.name === name);
        if (!file) return null;
        return file.session.getValue().split('\n');
    }
    function addLine(name, line) {
        const file = Object.values(files).find(f => f.name === name);
        const val = file.session.getValue();
        if (val === '') file.session.setValue(             line);
        else            file.session.setValue(val + '\n' + line);
    }
    function clearFile(name) {
        const file = Object.values(files).find(f => f.name === name);
        file.session.setValue('');
    }

    return {
        addFile, renameFile, clearFile,
        setActiveFile, getActiveFileName: () => files[activeFileID].name,
        getLines, addLine
    };
}
