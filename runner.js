self.window = self;
self.__ide_stop_flag = false;

// Ask main thread for a line of input
self.readInput = function () {
    self.postMessage({ type: 'input_request' });
    return new Promise((resolve) => {
        const handle = (e) => {
            if (e.data && e.data.type === 'input_response') {
                self.removeEventListener('message', handle);
                resolve(String(e.data.value || ''));
            }
        };
        self.addEventListener('message', handle);
    });
};

let imported = false;

self.onmessage = async (e) => {
    if (e.data?.type === 'run') {
        try {
            if (!imported) { importScripts('interpreter.js'); imported = true; }
            const output = await self.interpretPseudocode(e.data.code); // <-- await
            self.postMessage({ type: 'done', output: String(output ?? '') });
        } catch (err) {
            self.postMessage({ type: 'error', error: err?.message || String(err) });
        }
    } else if (e.data?.type === 'stop') {
        self.__ide_stop_flag = true;
        self.postMessage({ type: 'stopped' });
    }
};
