(function () {
    let shown = false;
    let timer;
  
    // style for the dots and text
    const css = `
        #boot-loader{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2147483647;transform:translateY(-20px)}
        #boot-loader .spinner-container{display:flex;flex-direction:column;align-items:center;gap:12px}
        #boot-loader .dots{display:flex;gap:8px}
        #boot-loader .dot{width:10px;height:10px;border-radius:50%;animation:boot-b 1s infinite alternate;background:white}
        #boot-loader .dot:nth-child(2){animation-delay:.15s}
        #boot-loader .dot:nth-child(3){animation-delay:.3s}
        #boot-loader .loading-text{font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:white;font-weight:500;transform:translateX(3px)}
        @keyframes boot-b{from{transform:scale(.6);opacity:.5}to{transform:scale(1);opacity:1}}
    `;
    const style = document.createElement('style');
    style.setAttribute('data-boot-style', 'true');
    style.textContent = css;
    document.head.appendChild(style);
  
    function show() {
        console.log('[boot-loader] show() called, shown:', shown, 'appReady:', window.appReady);
        if (shown || window.appReady) return;
        shown = true;
        console.log('[boot-loader] Creating and showing loading spinner');
        
        const el = document.createElement('div');
        el.id = 'boot-loader';
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
        
        if (document.body) {
            console.log('[boot-loader] Body exists, appending spinner immediately');
            document.body.appendChild(el);
        } else {
            console.log('[boot-loader] Body not ready, waiting for readystatechange');
            // wait for body through readystatechange
            const tryAppend = () => {
                if (document.body) {
                    console.log('[boot-loader] Body ready, appending spinner');
                    document.body.appendChild(el);
                    document.removeEventListener('readystatechange', tryAppend);
                }
            };
            document.addEventListener('readystatechange', tryAppend);
        }
    }
  
    function hide() {
        console.log('[boot-loader] hide() called');
        clearTimeout(timer);
        const loader = document.getElementById('boot-loader');
        if (loader) {
            console.log('[boot-loader] Removing spinner element');
            loader.remove();
        } else {
            console.log('[boot-loader] No spinner element found to remove');
        }
    }
  
    // signal that app is usable
    window.setAppReady = () => {
        console.log('[boot-loader] setAppReady() called');
        window.appReady = true;
        hide();
    };
  
    console.log('[boot-loader] Initializing, timer set for 750ms');
    timer = setTimeout(show, 750); // show if 750 ms have passed
  
    // fallback: hide when window is loaded
    window.addEventListener('load', () => { 
        console.log('[boot-loader] Window load event fired, appReady:', window.appReady);
        if (!window.appReady) hide(); 
    }, { once: true });
})();
