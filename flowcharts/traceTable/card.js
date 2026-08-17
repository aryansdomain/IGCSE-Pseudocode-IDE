// Dragging and edge-resizing of the floating trace-table card.
import { card } from './traceTable.js';
import { save } from './storage.js';

// how far the card may sit from each edge of the canvas area
function bounds() {
    const parent = card.offsetParent;
    if (!parent) return null;
    return {
        maxLeft: Math.max(0, parent.clientWidth  - card.offsetWidth ),
        maxTop:  Math.max(0, parent.clientHeight - card.offsetHeight)
    };
}

// keep the card inside the canvas area. its position is saved per file, so a card
// dragged off the edge — or restored onto a smaller window — would stay unreachable
export function clampCard() {
    const b = bounds();
    if (!b) return;
    // only when explicitly positioned: by default the card sits at right: 16px
    if (card.style.left) card.style.left = Math.min(Math.max(0, parseFloat(card.style.left) || 0), b.maxLeft) + 'px';
    if (card.style.top ) card.style.top  = Math.min(Math.max(0, parseFloat(card.style.top ) || 0), b.maxTop ) + 'px';
}

export function initCard() {
    // a shrinking window must not strand the card outside the canvas
    window.addEventListener('resize', clampCard);

    // dragging
    card.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, table, input, select, textarea, [contenteditable="true"], .trace-error')) return;
        e.preventDefault();

        const startX = e.clientX - card.offsetLeft;
        const startY = e.clientY - card.offsetTop;

        function onMove(e) {
            const b = bounds() ?? { maxLeft: Infinity, maxTop: Infinity };
            card.style.left  = Math.min(Math.max(0, e.clientX - startX), b.maxLeft) + 'px';
            card.style.top   = Math.min(Math.max(0, e.clientY - startY), b.maxTop ) + 'px';
            card.style.right = 'auto';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp  );
            save();
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp  );
    });

    // resizing
    ['top', 'right', 'bottom', 'left'].forEach(edge => {
        // add a resize handle
        const handle = document.createElement('div'); handle.className = `card-resize card-resize-${edge}`;
        card.appendChild(handle);

        // mousedown on the handle
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const  rect = card             .getBoundingClientRect();
            const pRect = card.offsetParent.getBoundingClientRect();

            const startX = e.clientX;
            const startY = e.clientY;
            const startW = rect.width;
            const startH = rect.height;
            const startLeft = rect.left - pRect.left;
            const startTop  = rect.top  - pRect.top;

            card.style.right = 'auto';
            card.style.left   = startLeft + 'px';
            card.style.top    = startTop  + 'px';
            card.style.width  = startW    + 'px';
            card.style.height = startH    + 'px';

            function onMove(e) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (edge === 'right' )   card.style.width  = Math.max(160, startW + dx) + 'px';
                if (edge === 'left'  ) { card.style.width  = Math.max(160, startW - dx) + 'px'; card.style.left = (startLeft + startW - parseFloat(card.style.width )) + 'px'; }
                if (edge === 'bottom')   card.style.height = Math.max(80,  startH + dy) + 'px';
                if (edge === 'top'   ) { card.style.height = Math.max(80,  startH - dy) + 'px'; card.style.top  = (startTop  + startH - parseFloat(card.style.height)) + 'px'; }
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup',   onUp  );
                save();
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',   onUp  );
        });
    });
}
