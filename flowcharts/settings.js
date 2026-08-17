import { getFont, saveFont } from '../shared/font.js';

let styleEl = null;

function applyFont(size, family) {
    if (!styleEl) {
        styleEl = document.createElement('style');
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
        #canvas text {
            font-family: ${family} !important;
            font-size: ${size}px !important;
        }
    `;
}

export function initSettings({ openBtn, closeBtn, overlayEl, sizeSlider, sizeValueEl, familySelect, onChange }) {
    let { size, family } = getFont();
    applyFont(size, family);
    syncUI(size, family);

    openBtn.addEventListener('click', () => {
        overlayEl.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        sizeSlider.focus();
    });
    closeBtn.addEventListener('click', close);
    overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) close(); });

    function trackSize(from, to) {
        try {
            window.font_size_changed && window.font_size_changed({
                font_size_changed_from: from,
                font_size_changed_to:   to
            });
        } catch {}
    }
    function trackFamily(from, to) {
        try {
            window.font_family_changed && window.font_family_changed({
                font_family_changed_from: from,
                font_family_changed_to:   to
            });
        } catch {}
    }

    sizeSlider.nextElementSibling.querySelectorAll('.tick').forEach(tick => {
        if (!tick.textContent.trim()) return;
        tick.addEventListener('click', () => {
            const from = size;
            size = parseInt(tick.textContent, 10);
            sizeSlider.value = size;
            sizeValueEl.textContent = size;
            applyFont(size, family);
            saveFont(size, family);
            onChange?.();
            trackSize(from, size);
        });
    });

    let sizeFrom = null, sizeTimer = null;
    sizeSlider.addEventListener('input', () => {
        if (sizeFrom === null) sizeFrom = size;
        size = parseInt(sizeSlider.value, 10);
        sizeValueEl.textContent = size;
        applyFont(size, family);
        saveFont(size, family);
        onChange?.();

        clearTimeout(sizeTimer);
        sizeTimer = setTimeout(() => { trackSize(sizeFrom, size); sizeFrom = null; }, 500);
    });

    familySelect.addEventListener('change', () => {
        const from = family;
        family = familySelect.value;
        applyFont(size, family);
        saveFont(size, family);
        onChange?.();
        trackFamily(from, family);
    });

    // sync font changes made on the code page
    window.addEventListener('storage', (e) => {
        if (e.key !== 'igcse_ide_editor_font' || !e.newValue) return;
        try {
            const saved = JSON.parse(e.newValue);
            if (typeof saved.size   === 'number') size   = saved.size;
            if (typeof saved.family === 'string') family = saved.family;
            applyFont(size, family);
            syncUI(size, family);
            onChange?.();
        } catch {}
    });

    function close() {
        overlayEl.style.display = 'none';
        document.body.style.overflow = '';
        openBtn.focus();
    }

    function syncUI(size, family) {
        sizeSlider.value        = size;
        sizeValueEl.textContent = size;
        familySelect.value      = family;
    }
}
