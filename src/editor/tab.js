export function initSpacingControls({editor, editorApis, slider, valueEl, infoEl, tickSelector = null} = {}) {
    if (!editor || !editorApis) throw new Error('initSpacingControls: editor & editorApis are required');

    const Range = ace.require('ace/range').Range;

    function getCurrentTabSize(session) {
        return typeof session.getTabSize === 'function'
            ? session.getTabSize()
            : (session.$tabSize || 4);
    }

    // convert leading indent to newSize
    function retabDocumentByUnits(session, oldSize, newSize) {
        const doc = session.getDocument();
        const lineCount = session.getLength();

        const changeSpacing = () => {
            for (let row = 0; row < lineCount; row++) {
                const line = session.getLine(row);
                const m = line.match(/^[\t ]+/);
                if (!m) continue;

                const oldIndent = m[0];

                // measure current columns
                let cols = 0;
                for (const ch of oldIndent) {
                    if (ch === '\t') cols += oldSize - (cols % oldSize);
                    else cols += 1;
                }

                const units = Math.floor(cols / oldSize);
                const remainder = cols % oldSize;

                const newIndent = ' '.repeat(units * newSize + remainder);
                if (newIndent !== oldIndent) {
                    doc.replace(new Range(row, 0, row, oldIndent.length), newIndent);
                }
            }
        };

        const um = session.getUndoManager();
        if (um && typeof um.transact === 'function') um.transact(changeSpacing);
        else changeSpacing();
    }

    function setTabSpaces(n) {
        const session = editor.session;
        const newSize = parseInt(n, 10);
        const oldSize = getCurrentTabSize(session);
        if (!Number.isFinite(newSize) || newSize === oldSize) return oldSize;

        editorApis.setTab(newSize);
        retabDocumentByUnits(session, oldSize, newSize);

        // refresh ui
        valueEl && (valueEl.textContent = newSize);
        infoEl  && (infoEl.textContent  = `Tab Spaces: ${newSize}`);
        editor.renderer.updateFull();
        return newSize;
    }

    // tab slider
    const onSlider = (e) => setTabSpaces(e.target.value);
    slider?.addEventListener('input', onSlider);
    slider?.addEventListener('change', onSlider);

    // clickable ticks
    if (tickSelector) {
        document.querySelectorAll(tickSelector).forEach((tick, idx) => {
            tick.addEventListener('click', () => {
                const val = idx + 1; // 1, 2 ... n
                if (slider) slider.value = String(val);
                setTabSpaces(val);
            });
        });
    }

    // initial ui
    const initial = getCurrentTabSize(editor.session);
    if (slider) slider.value = String(initial);
    valueEl && (valueEl.textContent = initial);
    infoEl  && (infoEl.textContent  = `Tab Spaces: ${initial}`);

    function getTabSpaces() {
        return getCurrentTabSize(editor.session);
    }

    function destroy() {
        slider?.removeEventListener('input', onSlider);
        slider?.removeEventListener('change', onSlider);
        if (tickSelector) {
            document.querySelectorAll(tickSelector).forEach((tick) => {
                tick.replaceWith(tick.cloneNode(true));
            });
        }
    }

    return { setTabSpaces, getTabSpaces, destroy };
}
