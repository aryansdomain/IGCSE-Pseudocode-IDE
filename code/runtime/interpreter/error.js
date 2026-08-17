import { isDeclared, isInitialized, getValType } from './scope.js';

export let currentLineNum = 0;
export let lines = [];

export const KEYWORDS = new Set([
    'AND', 'ARRAY', 'BOOLEAN', 'CALL', 'CASE', 'CHAR', 'CONSTANT',
    'DECLARE', 'DIV', 'DO', 'ELSE', 'ENDFUNCTION', 'ENDCASE',
    'ENDPROCEDURE', 'ENDIF', 'ENDWHILE', 'FALSE', 'FOR', 'FUNCTION', 'IF',
    'INPUT', 'INTEGER', 'LCASE', 'LENGTH', 'MOD', 'NEXT', 'NOT', 'OF',
    'OPENFILE', 'OR', 'OTHERWISE', 'OUTPUT', 'PROCEDURE', 'RANDOM', 'READ',
    'READFILE', 'REAL', 'REPEAT', 'RETURNS', 'RETURN', 'ROUND', 'STEP',
    'STRING', 'SUBSTRING', 'THEN', 'TO', 'TRUE', 'UNTIL', 'UCASE', 'WHILE',
    'CLOSEFILE', 'WRITE', 'WRITEFILE'
]);

export function initError(linesWithComments) {
    lines = linesWithComments;
    currentLineNum = 0;
}

// ------------------------ Utilities ------------------------

// sync error line number with interpreter
export function setCurrentLineNum(lineNum) {
    const n = Number(lineNum);
    if (Number.isFinite(n) && n >= 0) {
        currentLineNum = n;
    }
}

// convert string to regex
export function toRegex(str) {
    if (str instanceof RegExp) return str;
    str = String(str);

    if (str !== '') {
        str = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // replace special chars with escape
        return new RegExp(str, 'i');
    }
    return null;
}
// find occurrence of string in text
export function findPos(text, str) {
    // get regex
    const regex = toRegex(str);
    if (!regex) return { col: '', len: '' };

    // find match
    const match = regex.exec(text);
    if (!match) return { col: '', len: '' };
    return { col: match.index, len: match[0].length };
}

// format thrown error
function formatError(e) {
    const type    = e.type;
    const msg     = e.message || String(e);
    const lineNum = e.lineNum || currentLineNum;
    const col     = e.col;
    const len     = e.len;
    const hint    = e.hint;

    const line = lines[lineNum - 1].text;

    // make pointer
    let pointer;
    if (col !== '' && len !== '') {
        pointer = ' '.repeat(Math.max(0, Number(col))) + '^'.repeat(Math.max(1, Number(len)));
    } else {
        pointer = '^'.repeat(line.length);
    }

    return `Line ${lineNum}:` + '\n' +
            line              + '\n' +
            pointer           + '\n' +
            `${type}: ${msg}` + '\n' +
            (hint ? hint      + '\n' : '');
}
export function throwErr(
    type = 'Error',
    message = '',
    lineNum = currentLineNum, col = '', len = '',
    hint = ''
) {
    const e = new Error(message);
    e.type      = type;
    e.message   = message;
    e.lineNum   = lineNum;
    e.col       = col;
    e.len       = len;
    e.hint      = hint;
    e.formatted = formatError(e);
    throw e;
}

// ------------------------ Assertions ------------------------

// a <- b
export function assertAssignCompatible(aType, b,        bText,         line = lines[currentLineNum - 1].text,          hint = '') {
    const bType = getValType(b, bText);
    const pos = findPos(line, bText);

    // condition for throwing error
    let cond;
    switch (aType) {
        case 'INTEGER':
            cond = !Number.isInteger(b);
            break;
        case 'REAL':
            if (typeof b === 'number' && !Number.isFinite(b)) {
                throwErr('ValueError',
                         'cannot assign non-finite value',
                         currentLineNum, pos.col, pos.len,
                         hint || 'Expression evaluated to NaN or Infinity.');
            }
            cond = typeof b !== 'number';
            break;
        case 'BOOLEAN':
            cond = typeof b !== 'boolean';
            break;
        case 'CHAR':
            cond = typeof b !== 'string' || b.length > 1 ||
            //                  contains empty ""
                       (b.length === 0 && /^\s*""\s*$/.test(String(bText)));
            break;
        case 'STRING':
            cond = typeof b !== 'string';
            break;
    }

    if (cond) {
        throwErr('TypeError',
                 'cannot assign ' + bType + ' value to ' + aType,
                 currentLineNum, pos.col, pos.len,
                 hint);
    }
}
// a =/</>/... b
export function assertCompareCompatible(a,    b, aText, bText,         line = lines[currentLineNum - 1].text, op = '', hint = '') {
    if (typeof a === typeof b && (!Array.isArray(a) && !Array.isArray(b))) return;

    const pos = findPos(line, op);
    throwErr('TypeError',
             `cannot compare ${getValType(a, aText)} with ${getValType(b, bText)}`,
             currentLineNum, pos.col, pos.len,
             hint);
}

export function assertDeclared(   scope, name,                         line = lines[currentLineNum - 1].text                    ) {
    if (isDeclared(scope, name)) return;

    const pos = findPos(line, name);
    throwErr('NameError',
             `name ${String(name)} is not defined`,
             currentLineNum, pos.col, pos.len);
}
export function assertInitialized(scope, name,                         line = lines[currentLineNum - 1].text                    ) {
    if (isInitialized(scope, name)) return;

    const pos = findPos(line, name);
    throwErr('NameError',
             `name ${String(name)} referenced before initialization`,
             currentLineNum, pos.col, pos.len);
}

export function assertNotKeyword(              val,                    line = lines[currentLineNum - 1].text,          hint = '') {
    if (!KEYWORDS.has(val.toUpperCase())) return;

    const pos = findPos(line, val);
    throwErr('NameError',
             `identifier ${val} is a reserved keyword`,
             currentLineNum, pos.col, pos.len,
             hint);
}
export function assertValidType(               val,                    line = lines[currentLineNum - 1].text,          hint = '') {
    const type = String(val).trim();
    const upper = type.toUpperCase();

    if (['INTEGER', 'REAL', 'BOOLEAN', 'CHAR', 'STRING'].includes(upper))               return; // regular
    if (/^ARRAY\s*\[\s*.+\s*\]\s+OF\s+(INTEGER|REAL|BOOLEAN|CHAR|STRING)$/i.test(type)) return;  // array

    // throw error if just array
    const pos = findPos(line.split(':')[1] ?? line, type);
    if (upper === 'ARRAY') hint = 'The type should be ARRAY OF <INTEGER|STRING|...>';

    throwErr('TypeError',
             `invalid type ${type}`,
             currentLineNum, pos.col + line.indexOf(':') + 2, pos.len,
             hint);
}

export function assertNum(               name, val, valText,           line = lines[currentLineNum - 1].text,          hint = '') {
    if (typeof val === 'number' && Number.isFinite(val)) return;

    const pos = findPos(line, valText);
    throwErr('TypeError',
             `${String(name)} must be a number`,
             currentLineNum, pos.col, pos.len,
             hint);
}
export function assertInt(               name, val, valText,           line = lines[currentLineNum - 1].text,          hint = '') {
    assertNum(name, val, valText, line, hint);
    if (Number.isInteger(val)) return;

    const pos = findPos(line, valText);
    throwErr('TypeError',
             `${String(name)} must be an integer`,
             currentLineNum, pos.col, pos.len,
             hint);
}
export function assertBool(              name, val, valText,           line = lines[currentLineNum - 1].text,          hint = '') {
    if (typeof val === 'boolean') return;

    const pos = findPos(line, valText);
    throwErr('TypeError',
             `${String(name)} must be a boolean`,
             currentLineNum, pos.col, pos.len,
             hint);
}
export function assertString(            name, val, valText,           line = lines[currentLineNum - 1].text,          hint = '') {
    if (typeof val === 'string') return;

    const pos = findPos(line, valText);
    throwErr('TypeError',
             `${String(name)} must be a string`,
             currentLineNum, pos.col, pos.len,
             hint);
}
export function assertLiteral(           name,      valText,           line = lines[currentLineNum - 1].text,          hint = '') {
    const text = String(valText).trim();
    if (/^[+-]?(?:\d+\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(text) || // number
        /^(TRUE|FALSE)$/i.test(text) ||                          // bool
        /^"[^"]*"$/.test(text) ||                                // string
        /^'[^']?'$/.test(text)) {                                // char
        return;
    }

    const pos = findPos(line, valText);
    throwErr('TypeError',
             `${String(name)} must be a literal`,
             currentLineNum, pos.col, pos.len,
             hint);
}

export function assertArgCount(          name, expected, receivedArgs, line = lines[currentLineNum - 1].text                    ) {
    const actual = receivedArgs / 2;  // / 2 because each arg is a pair of value and text
    if (actual === expected || receivedArgs === expected) return;

    const pos = findPos(line, name);
    throwErr('TypeError',
             `incorrect number of arguments in call`,
             currentLineNum, pos.col, pos.len,
             `Expected ${expected} arguments, got ${actual}.`);
}
