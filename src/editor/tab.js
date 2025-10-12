export function initSpacingControls({editor, editorApis, slider, valueEl, infoEl, tickSelector = null} = {}) {

    const Range = ace.require('ace/range').Range;

    function getTabSpaces() {

        const session = editor.session;

        return typeof session.getTabSize === 'function'
            ? session.getTabSize()
            : (session.$tabSize);
    }

    // convert original indent to the new size
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

    let tabSpacesChangeTimeout = null;
    let originalSpaces = getTabSpaces();

    function setTabSpaces(n) {
        const session = editor.session;
        const newSize = parseInt(n, 10);
        const oldSize = getTabSpaces();
        if (!Number.isFinite(newSize) || newSize === oldSize) return oldSize;

        editorApis.setTab(newSize);
        retabDocumentByUnits(session, oldSize, newSize);

        // refresh ui
        slider  && (slider.value = String(newSize));
        valueEl && (valueEl.textContent = newSize);
        infoEl  && (infoEl.textContent  = `Tab Spaces: ${newSize}`);
        editor.renderer.updateFull();

        // track tab spaces change analytics
        if (oldSize !== newSize) {
            if (tabSpacesChangeTimeout) clearTimeout(tabSpacesChangeTimeout); // clear existing timeout
            
            // set timeout to track after user stops dragging
            tabSpacesChangeTimeout = setTimeout(() => {
                window.tab_spaces_changed && window.tab_spaces_changed({
                    from_spaces: originalSpaces,
                    to_spaces: newSize
                });
                
                originalSpaces = newSize;
                tabSpacesChangeTimeout = null;
            }, 2000); // delay after user stops dragging
        }

        return newSize;
    }

    // tab slider
    const onSlider = (e) => setTabSpaces(e.target.value);
    slider?.addEventListener('input', onSlider);
    slider?.addEventListener('change', onSlider);

    // slider ticks are clickable
    if (tickSelector) {
        document.querySelectorAll(tickSelector).forEach((tick, idx) => {
            tick.addEventListener('click', () => {
                const val = idx; // 0, 1, 2, ... 8
                if (slider) slider.value = String(val);
                setTabSpaces(val);
            });
        });
    }

    // initial ui
    const initial = getTabSpaces();
    if (slider) slider.value = String(initial);
    valueEl && (valueEl.textContent = initial);
    infoEl  && (infoEl.textContent  = `Tab Spaces: ${initial}`);

    return { setTabSpaces, getTabSpaces };
}
