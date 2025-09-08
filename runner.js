/* Runs the IGCSE interpreter off the main thread */
self.window = self;                // some code may expect window
self.__ide_input_queue = [];
self.__ide_stop_flag = false;

// simple INPUT source for the interpreter
self.readInput = function () {
  return String(self.__ide_input_queue.length ? self.__ide_input_queue.shift() : "");
};

let imported = false;

self.onmessage = async (e) => {
  const { type } = e.data || {};
  if (type === 'run') {
    const { code, inputQueue } = e.data;
    // fresh run state
    self.__ide_stop_flag = false;
    self.__ide_input_queue = Array.isArray(inputQueue) ? inputQueue.slice() : [];

    try {
      if (!imported) {
        importScripts('interpreter.js');
        imported = true;
      }

      // run the program
      const output = self.interpretPseudocode(code);
      self.postMessage({ type: 'done', output: String(output ?? '') });
    } catch (err) {
      self.postMessage({ type: 'error', error: (err && err.message) ? err.message : String(err) });
    }
  } else if (type === 'stop') {
    // cooperative stop (your interpreter should check __ide_stop_flag periodically)
    self.__ide_stop_flag = true;
    // optional: if the interpreter ignores the flag, the main thread may terminate us.
    self.postMessage({ type: 'stopped' });
  }
};
