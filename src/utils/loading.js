(function () {
    let shown = false;
    let timer;
    let loadingEl = null;
  
    // style for dots and text
    const style = document.createElement('style');
    style.setAttribute('data-boot-style', 'true');
    style.textContent = `
        #appLoader { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; z-index:2147483647; transform:translateY(-20px); }
        #appLoader .spinner-container { display:flex; flex-direction:column; align-items:center; gap:12px; }
        #appLoader .dots { display:flex; gap:8px; }
        #appLoader .dot { width:10px; height:10px; border-radius:50%; animation:boot-b 1s infinite alternate; background: white; }
        #appLoader .dot:nth-child(2) { animation-delay:.15s }
        #appLoader .dot:nth-child(3) { animation-delay:.3s }
        #appLoader .loading-text { font-family:system-ui,-apple-system,sans-serif; font-size:14px; color:white; font-weight:500; transform:translateX(3px); }
        #appLoader .error-message { font-family:system-ui,-apple-system,sans-serif; font-size:12px; color:rgba(255,255,255,0.7); font-weight:400; margin-top:4px; text-align:center; }
        @keyframes boot-b{ from {transform:scale(.6); opacity:.5 } to { transform:scale(1); opacity:1} }
    `;
    document.head.appendChild(style);
  
    function showLoadingDots() {
        if (shown || window.appReady) return;
        shown = true;
        
        // make the element
        const el = document.createElement('div');
        el.id = 'appLoader';
        el.setAttribute('aria-live', 'polite');
        el.innerHTML = `
            <div class="spinner-container">
                <div class="dots">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
                <div class="loading-text">Loading...</div>
            </div>
        `;
        loadingEl = el;
        
        // add to the page
        if (document.body) {
            document.body.appendChild(el);
        } else {
            // wait for body through readystatechange
            const tryAppend = () => {
                if (document.body) {
                    document.body.appendChild(el);
                    document.removeEventListener('readystatechange', tryAppend);
                }
            };
            document.addEventListener('readystatechange', tryAppend);
        }
    }
    function showReloadPrompt() {
        if (!loadingEl || window.appReady) return;
        const spinnerContainer = loadingEl.querySelector('.spinner-container');
        if (!spinnerContainer) return;
        if (spinnerContainer.querySelector('.error-message')) return; // already shown
        
        const errorMsg = document.createElement('div');
        errorMsg.className = 'error-message';
        errorMsg.textContent = 'Loading is taking longer than usual. Please reload the page.';
        spinnerContainer.appendChild(errorMsg);
    }
  
    function clear() {
        if (shown || window.appReady) clearTimeout(timer);
        loadingEl = null;
        document.getElementById('appLoader')?.remove();
    }
  
    // errors during loading
    function onError() {
        if (!window.appReady && loadingEl) showReloadPrompt();
    }
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onError);
  
    // signal that app is usable
    window.setAppReady = () => {
        window.appReady = true;

        // remove error listeners
        window.removeEventListener('error', onError, true);
        window.removeEventListener('unhandledrejection', onError);

        clear();
    };

    timer = setTimeout(showLoadingDots, 750); // show if 750 ms have passed
})();
