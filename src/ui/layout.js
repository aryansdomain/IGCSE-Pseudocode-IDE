export function initLayoutControls({
    workspace,
    layoutBtn,
    initialLayout = 'vertical',
    storageKey = 'ui.layout:editor-console',
} = {}) {
    
    // update workspace CSS classes
    function updateWorkspace() {
        workspace.classList.remove('layout-vertical', 'layout-horizontal');
        workspace.classList.add(layout === 'vertical' ? 'layout-vertical' : 'layout-horizontal');
    }
    
    // appearance of button
    function updateLayoutButton() {
        const icon = layoutBtn.querySelector('i');
        
        // rotation
        if (layout === 'vertical') icon.classList.remove('fa-rotate-90');
        else                       icon.classList.add('fa-rotate-90');
        
        // attributes
        layoutBtn.setAttribute('aria-pressed', layout === 'horizontal');
        layoutBtn.title = layout === 'vertical' ? 'Switch to side-by-side layout' : 'Switch to top-bottom layout';
    }
    
    // toggle between layouts
    function toggleLayout() {
        if (layout === 'vertical') layout = 'horizontal';
        else                       layout = 'vertical';
        
        try { localStorage.setItem(storageKey, layout); } catch {}
        
        updateWorkspace();
        updateLayoutButton();
        
        // track layout change analytics
        try {
            window.layout_changed && window.layout_changed({ layout_changed_to: layout });
        } catch {}
    }

    // init
    let layout = localStorage.getItem(storageKey) || initialLayout;
    updateWorkspace();
    updateLayoutButton();
    
    return {
        getLayout: () => layout,
        toggleLayout,
    };
}
