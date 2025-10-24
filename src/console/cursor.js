export function initCursor({ console, consoleOutput, setAwaitingInput, isAwaitingInput }) {
    let inputStartCol = 0;      // column where program input begins
    let line = '';              // current line content
    let cursorPos = 0;          // cursor position in line, does not account for propmt

    // ------------------------ Utilities ------------------------
    async function setLine(newLine) {
        line = newLine;

        consoleOutput.hideCursor();

        if (isAwaitingInput()) {
            consoleOutput.moveCursorTo(inputStartCol); // go to start of input region
            consoleOutput.clearToLineEnd();
            consoleOutput.print(line);
            await new Promise(resolve => setTimeout(resolve, 5)); // delay for printing
            consoleOutput.moveCursorTo(inputStartCol + cursorPos);
        } else {
            consoleOutput.clearline();
            consoleOutput.writePrompt();
            consoleOutput.print(line);

            cursorPos = Math.min(cursorPos, line.length);
            const back = line.length - cursorPos;
            if (back > 0) consoleOutput.moveCursorLeft(back);
        }
        
        consoleOutput.showCursor();
    }

    async function insertChar(char) {
        const before = line.slice(0, cursorPos);
        const after  = line.slice(cursorPos);

        await setLine(before + char + after);
        moveCursorRight();
    }
    async function deleteChar() {
        if (cursorPos <= 0) return; // cant delete further

        const before = line.slice(0, cursorPos - 1);
        const after  = line.slice(cursorPos);

        await setLine(before + after);
        if (after.length > 0) moveCursorLeft();
        else if (isAwaitingInput()) moveCursorLeft();
    }

    function moveCursorLeft(n = 1) {
        if (cursorPos <= 0 || n === 0) return; // cant move left further

        cursorPos -= n;
        consoleOutput.moveCursorLeft(n);
    }
    function moveCursorRight(n = 1) {
        if (cursorPos >= line.length || n == 0) return; // cant move right further

        cursorPos += n;
        consoleOutput.moveCursorRight(n);
    }

    // ------------------------ Getters & Setters ------------------------
    function focus() { console.focus(); }
    function getLine() { return line; }
    function getCursorPos() { return cursorPos; }
    
    // set the input start column (where program input begins)
    function setInputStartCol(col) {
        inputStartCol = col;
    }

    // reset everything
    function reset() {
        inputStartCol = 0;
        cursorPos = 0;
        line = '';
    }

    return {
        setLine, insertChar, deleteChar, moveCursorLeft, moveCursorRight,
        getLine, getCursorPos,
        focus, reset, setInputStartCol
    };
}
