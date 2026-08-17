import {
    KEYWORDS, assertNotKeyword, throwErr,
    currentLineNum, findPos, lines
} from './error.js';

import { BUILTIN, NUM, CMP, LOG } from './builtin.js';
import { readVar, readArr }       from './execute.js';
import { runFunction }            from './procsFuncs.js';

const LITERAL_START = '\uE000';
const LITERAL_END   = '\uE001';

const KEYWORDS_NOT_ALLOWED_IN_EXPRESSION = new Set([
    'ARRAY', 'CALL', 'CASE', 'CLOSEFILE', 'CONSTANT', 'DECLARE', 'DO', 'ELSE',
    'ENDCASE', 'ENDFUNCTION', 'ENDIF', 'ENDPROCEDURE', 'ENDWHILE',
    'FOR', 'FUNCTION', 'IF', 'INPUT', 'NEXT', 'OF', 'OPENFILE', 'OTHERWISE',
    'OUTPUT', 'PROCEDURE', 'READ', 'READFILE', 'REPEAT', 'RETURN', 'RETURNS',
    'STEP', 'THEN', 'TO', 'UNTIL', 'WHILE', 'WRITE', 'WRITEFILE'
]);

// ------------------------ Replacing ------------------------

let replaced = [];

// protect strings temporarily so they are not affected by operations
function replace(text) {
    return String(text)
        //         ? d.  .?d. | .d. eE  += -d.
        .replace(/(?:\d+\.?\d*|\.\d+)[eE][+-]\d+/g, (num) => { // protect scientific notation
            replaced.push(num);
            return `${LITERAL_START}${replaced.length - 1}${LITERAL_END}`;
        })
        //        " ?  ^" \ | \   " ' ?  ^' \ | \   '
        .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (str) => { // allow escaped quotes from JSON.stringify
            replaced.push(str);
            return `${LITERAL_START}${replaced.length - 1}${LITERAL_END}`;
        });
}
// unprotect them
function unreplace(text) {
    return String(text).replace(
        new RegExp(`${LITERAL_START}(\\d+)${LITERAL_END}`, 'g'), (_, i) => replaced[+i]
    );
}

// ------------------------ Utilities ------------------------

export function toString(val) {
    if        (val == null)      return '';
    if        (val === true)     return 'TRUE';
    if        (val === false)    return 'FALSE';
    if (typeof val === 'symbol') return val.description ?? val.toString();
    if (typeof val === 'number') {
        if (!Number.isFinite(val) || Number.isInteger(val)) return String(val);
        else                                                return String(parseFloat(val.toPrecision(15))); // avoid floating point
    }
    return String(val);
}

// split list string (like 4, 3, 2) into individual parts by comma
export function splitList(text, baseCol = null) {
    if (String(text).trim() === '') return [];

    const result = [];
    let item = '';
    let depth = 0;
    let quote = '';
    let col = 0;

    // add an item to the list
    function addItem(item, col) {
        item = item.trim();
        if (!item) {
            const errCol = baseCol != null ? baseCol + col : col;
            throwErr('SyntaxError',
                     'empty list item',
                     currentLineNum, errCol, 1);
        }

        result.push({ item, col: baseCol + col }); // text, offset from the start
    }

    for (let i = 0; i < text.length; i++) {
        const c = text[i];

        // if c is a quote
        //         "             '
        if (c === '"' || c === '\'') {
            if (quote === c) quote = ''; // outside string
            else if (!quote) quote = c;  // inside  string
        }

        if (c === '(' || c === '[') depth++; // open
        if (c === ')' || c === ']') depth--; // close

        // comma (separation)
        //            not in bracket && not in string
        if (c === ',' && depth === 0 && !quote) {
            addItem(item, col); // push item
            item = '';          // reset item
            col = i + 1;        // assign col
        } else {
            item += c;
        }
    }

    addItem(item, col); // everything else
    return result;
}

// get variable name, has indices, and the text of the indices
export function parseVar(v, line = lines[currentLineNum - 1].text) {
    v = String(v).trim();

    // make sure indentifier is proper syntax
    //                      ----------name---------     [chars], optional
    const match = v.match(/^([A-Za-z][A-Za-z0-9_]*)(\s*\[(.*)\])?$/);
    if (!match) {
        const pos = findPos(line || v, v);

        // calculate proper hint
        let hint;
        if (/-/.test(v)) {
            hint = 'Identifiers cannot have hyphens. Please use underscores instead.';
        } else if (/^\d|_/.test(v)) {
            hint = 'Identifiers must start with a letter.';
        } else if (/[()]/.test(v)) {
            hint = 'Function calls cannot be assigned to.';
        } else if (/\[/.test(v) && !/\]\s*$/.test(v)) {
            hint = 'Array access is missing a closing bracket.';
        } else if (/\s/.test(v)) {
            hint = 'Identifiers cannot contain spaces.';
        } else {
            hint = 'Identifiers must start with a letter, and then use only letters, numbers, or underscores.';
        }

        throwErr('SyntaxError',
                 'invalid identifier ' + String(v),
                 currentLineNum, pos.col, pos.len,
                 hint);
    }

    assertNotKeyword(match[1], line || v);

    return {
        name:               match[1],
        hasIndices: Boolean(match[2]),
        indicesText:        match[3]
    };
}

// find brackets after name in a line
function findArrBrackets(text, name) {
    if (!text) return {col: '', len: ''};

    // first get name of array
    const { col: nameCol } = findPos(text, name);
    const afterName = text.slice(nameCol + String(name).length);

    // check for brackets
    //                                        -chars-]
    const { col, len } = findPos(afterName, /\[[^\]]*\]/);
    return { col: nameCol + String(name).length + col, len };
}
// get array indices from line
export function getArrIndices(name, text, line) {
    text = String(text).trim();

    // find brackets
    const { col, len } = findArrBrackets(line, name);

    const indices = splitList(text, col + 1);
    // wrong number of indices
    if (indices.length < 1 || indices.length > 2) {
        throwErr('SyntaxError',
                 'invalid array access syntax',
                 currentLineNum, col, len,
                 'Only one or two indices are allowed.');
    }

    const iText = indices[0];
    const jText = indices[1]; // j = undefined if no second index
    
    // starts/ends with a comma
    if (text.startsWith(',') || text.endsWith(',')) {
        throwErr('SyntaxError',
                 'invalid array access syntax',
                 currentLineNum, col, len,
                 'The comma should be between the two indices.');
    }
    // there is a comma, but no second index
    if (text.includes(',') && !jText) {
        throwErr('SyntaxError',
                 'invalid array access syntax',
                 currentLineNum, col, len,
                 'Remove the comma or add the second index.');
    }
    // empty index between commas or at either end
    //       ,|,    |,   ,
    if (/^\s*,|,\s*$|,\s*,/.test(text)) {
        throwErr('SyntaxError',
                 'invalid array access syntax',
                 currentLineNum, col, len);
    }

    return { iText, jText, col, len };
}


// ------------------------ Checking For Errors ------------------------

// unmatched opening/closing token
function findUnmatched(text, baseCol) {
    let quote        = '';
    let parenDepth   = 0;
    let bracketDepth = 0;
    let quoteCol   = -1;
    let parenCol   = -1;
    let bracketCol = -1;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];

        // exiting a quote
        if (quote) {
            if (c === quote) {
                quote = '';
                quoteCol = -1;
            }
            continue;
        }

        // entering a quote
        if (c === '"' || c === '\'') {
            quote = c;
            quoteCol = i;
            continue;
        }

        // if c is an opening bracket
        if (c === '(' || c === '[') {
            if (c === '(') {
                if (parenDepth   === 0) parenCol   = i;
                parenDepth++;
            } else {
                if (bracketDepth === 0) bracketCol = i;
                bracketDepth++;
            }
        }

        // if c is a closing bracket
        if (c === ')' || c === ']') {
            const col = baseCol != null ? baseCol + i : i;
            if (c == ')') {
                if (parenDepth   === 0) return { message: 'unexpected token )', col, len: 1 };
                parenDepth--;
            } else {
                if (bracketDepth === 0) return { message: 'unexpected token ]', col, len: 1 };
                bracketDepth--;
            }
        }
    }

    // quote
    if (quote) {
        return {
            message: 'missing closing quote',
            col: baseCol != null ? baseCol + quoteCol    : quoteCol,   len: 1
        };
    }
    // parenthesis
    if (parenDepth > 0) {
        return {
            message: 'missing closing )',
            col: baseCol != null ? baseCol + parenCol    : parenCol ,   len: 1
        };
    }
    // bracket
    if (bracketDepth > 0) {
        return {
            message: 'missing closing ]',
            col: baseCol != null ? baseCol + bracketCol : bracketCol, len: 1
        };
    }
    return null;
}

// Arr[1][1] (not allowed)
function findBadArrAccess(text, baseCol) {
    //                   --------name--------     [
    const arrayAccess = /[A-Za-z][A-Za-z0-9_]*\s*\[/g;

    let r; // regex match result
    while (r = arrayAccess.exec(text)) {
        // r[0] is the full matched text - Arr[
        const name = r[0].slice(0, r[0].indexOf('[')).trim();

        const firstOpen = r.index + r[0].length - 1;                     // col of the first opening bracket
        const firstClosed = scanGroupedRight(text, firstOpen, '[', ']'); // one after matching ]

        // character immediately after spaces following ]
        const secondOpen = firstClosed + text.slice(firstClosed).match(/^\s*/)[0].length;
        if (text[secondOpen] === '[') { // secondOpen = [, so of the form Arr[1][1]
            // get indices
            const secondClosed = scanGroupedRight(text, secondOpen, '[', ']');
            const i = text.slice(firstOpen  + 1, firstClosed  - 1).trim();
            const j = text.slice(secondOpen + 1, secondClosed - 1).trim();

            const col = baseCol != null ? baseCol + firstOpen : firstOpen;
            const len = secondClosed - firstOpen;

            return { name, i, j, col, len };
        }

        arrayAccess.lastIndex = firstClosed; // finished this case
    }
    return null;
}

// keyword where there shouldn't be
function findUnexpectedKeyword(text, baseCol) {
    let quote = '';
    let depth = 0;

    for (let i = 0; i < text.length; i++) { // each char
        const c = text[i];

        // if c is a quote
        //         "             '
        if (c === '"' || c === '\'') {
            if (quote === c) quote = ''; // outside string
            else if (!quote) quote = c;  // inside  string
        }

        if (c === '(' || c === '[') depth++; // open
        if (c === ')' || c === ']') depth--; // close

        if (quote || depth !== 0) continue; // shouldn't be considered
        if (!/[A-Za-z]/.test(c)) continue;  // not a letter, not a keyword

        // read keyword(?)
        let j = i;
        while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
        const keyword = text.slice(i, j).toUpperCase();
        // if a keyword
        if (i > 0 && KEYWORDS_NOT_ALLOWED_IN_EXPRESSION.has(keyword)) {
            const col = baseCol != null ? baseCol + i : i;
            return { keyword, col, len: j - i };
        }

        // skip text
        i = j - 1;
    }

    return null;
}


export function checkSyntax(text, baseCol, isStatement = false) {
    //     ** used instead of ^
    if (/(\*\*)/.test(text)) {
        const pos = findPos(text, '**');
        const col = baseCol != null ? baseCol + pos.col : pos.col;

        throwErr('SyntaxError',
                 'unexpected token **',
                 currentLineNum, col, 2,
                 'Did you mean ^?');
    }
    //    && used instead of AND
    if (/(&&)/.test(text)) {
        const pos = findPos(text, '&&');
        const col = baseCol != null ? baseCol + pos.col : pos.col;

        throwErr('SyntaxError',
                 'unexpected token &&',
                 currentLineNum, col, 2,
                 'Did you mean AND?');
    }
    //    || used instead of OR
    if (/\|\|/.test(text)) {
        const pos = findPos(text, '||');
        const col = baseCol != null ? baseCol + pos.col : pos.col;

        throwErr('SyntaxError',
                 'unexpected token ||',
                 currentLineNum, col, 2,
                 'Did you mean OR?');
    }
    //    == used instead of =
    if (/(==)/.test(text)) {
        const pos = findPos(text, '==');
        const col = baseCol != null ? baseCol + pos.col : pos.col;

        throwErr('SyntaxError',
                 'unexpected token ==',
                 currentLineNum, col, 2,
                 'Did you mean =?');
    }
    //    != used instead of <>
    if (/(!=)/.test(text)) {
        const pos = findPos(text, '!=');
        const col = baseCol != null ? baseCol + pos.col : pos.col;

        throwErr('SyntaxError',
                 'unexpected token !=',
                 currentLineNum, col, 2,
                 'Did you mean <>?');
    } 
    // = used instead of <-
    if (isStatement) { // things like A = B valid in half-statements (IF A = B), not full
        //                ? ! <>!=  = ?! =
        const eqMatch = /(?<![<>!=])=(?![=])/.exec(text);
        if (eqMatch) {
            const col = baseCol != null ? baseCol + eqMatch.index : eqMatch.index;
            throwErr('SyntaxError',
                     'unexpected token =',
                     currentLineNum, col, 1,
                     'Did you mean <- or <--?');
        }
    }

    const unmatched = findUnmatched(text, baseCol);
    if (unmatched) {
        throwErr('SyntaxError',
                 unmatched.message,
                 currentLineNum, unmatched.col, unmatched.len);
    }

    // replace all strings with empty strings
    // preserves col, len
        //               " ^"  " ' ^'  '        => '     '
    text = text.replace(/"[^"]*"|'[^']*'/g, (m) => ' '.repeat(m.length));

    // nested array access
    const bAA = findBadArrAccess(text, baseCol); // baaaa
    if (bAA) {
        throwErr('SyntaxError',
                 'invalid array access syntax',
                 currentLineNum, bAA.col, bAA.len,
                 `Did you mean ${bAA.name}[${bAA.i}, ${bAA.j}]?`);
    }

    // misplaced keyword somewhere
    const unexpected = findUnexpectedKeyword(text, baseCol);
    if (unexpected) {
        throwErr('SyntaxError',
                 `unexpected keyword ${unexpected.keyword}`,
                 currentLineNum, unexpected.col, unexpected.len);
    }

    // . used without digits on both sides
    const dot = /(?<!\d)\.(?=\d)|(?<=\d)\.(?!\d)|(?<!\d)\.(?!\d)/.exec(text);
    if (dot) {
        const col = baseCol != null ? baseCol + dot.index : dot.index;
        throwErr('SyntaxError',
                 'unexpected token .',
                 currentLineNum, col, 1);
    }

    // unallowed characters like {, %, #
    const unallowed = /[{}%$#@!;\&|~`?]/.exec(text);
    if (unallowed) {
        const col = baseCol != null ? baseCol + unallowed.index : unallowed.index;
        throwErr('SyntaxError',
                 `unexpected token ${unallowed[0]}`,
                 currentLineNum, col, 1);
    }
}

// ------------------------ Replace Pseudocode with JS ------------------------

// scan text for matching closing/opening bracket, return col of the matching bracket
function scanGroupedLeft( text, closeCol, openChar, closeChar) {
    let i = closeCol - 1;
    let depth = 1;

    while (i >= 0 && depth > 0) {
        if      (text[i] === closeChar) depth++;
        else if (text[i] === openChar)  depth--;
        i--;
    }
    return i + 1;
}
function scanGroupedRight(text, openCol,  openChar, closeChar) {
    let i = openCol + 1;
    let depth = 1;

    while (i < text.length && depth > 0) {
        if      (text[i] === openChar)  depth++;
        else if (text[i] === closeChar) depth--;
        i++;
    }
    return i;
}

// given operator, get left/right operands
export function getLeftOperand( text, opText, opStartCol, baseCol) {
    let i = opStartCol - 1;
    while (i >= 0 && text[i] === ' ') i--; // read spaces

    // no left operand
    if (i < 0) {
        if (text[opStartCol] === '-') return { start: '', text: '' }; // op was a negative sign (-5, etc.)

        const col = baseCol != null ? baseCol + opStartCol : opStartCol;
        throwErr('SyntaxError',
                 'missing left operand',
                 currentLineNum, col, opText.length);
    }

    let j; // pointer for start of operand

    // literal seen, return that
    if (text[i] === LITERAL_END) {
        j = i - 1;                                              // j = literal start, i = literal end
        while (j >= 0 && text[j] !== LITERAL_START) j--;        // read whole literal
        return { start: j, text: text.slice(j, i + 1).trim() }; // include literal start/end
    }

    // closing bracket seen, return contents of brackets (and before if function/builtin)
    if (text[i] === ')' || text[i] === ']') {
        j = (text[i] === ']') ? scanGroupedLeft(text, i, '[', ']') - 1  // j = before opening bracket, i = closing bracket
                              : scanGroupedLeft(text, i, '(', ')') - 1;

        // scan for text before
        while (j >= 0 && /[A-Za-z0-9_.]/.test(text[j])) j--; // read numbers, letters, _.
        return { start: j + 1, text: text.slice(j + 1, i + 1).trim() };
    }

    j = i;                                               // j = operand start, i = operand end
    while (j >= 0 && /[A-Za-z0-9_.]/.test(text[j])) j--; // read numbers, letters, _.

    // negative sign (or subtraction) found, determine which one
    if (j >= 0 && text[j] === '-') {
        let k = j - 1;                                     // k = next non-space token
        while (k >= 0 && text[k] === ' ') k--;             // skip spaces
        if (k < 0 || /[,(\[+\-*/^<>=]/.test(text[k])) j--; // include negative sign, not part of subtraction
    }

    return { start: j + 1, text: text.slice(j + 1, i + 1).trim() };
}
export function getRightOperand(text, opText, opEndCol,   baseCol) {
    let i = opEndCol + 1;
    while (i < text.length && text[i] === ' ') i++; // skip spaces

    // no right operand
    if (i >= text.length) {
        const col = baseCol != null ? baseCol + opEndCol : opEndCol;
        throwErr('SyntaxError',
                 'missing right operand',
                 currentLineNum, col, opText.length);
    }

    let j; // pointer for end of operand

    // literal seen, return that
    if (text[i] === LITERAL_START) {
        j = i + 1;                                                // i = literal start, j = literal end
        while (j < text.length && text[j] !== LITERAL_END) j++;   // read whole literal
        return { end: j + 1, text: text.slice(i, j + 1).trim() }; // include literal start/end
    }

    // opening bracket seen, return contents of brackets (and after)
    if (text[i] === '(' || text[i] === '[') {
        j = (text[i] === '(') ? scanGroupedRight(text, i, '(', ')')  // i = opening bracket, j = closing bracket
                              : scanGroupedRight(text, i, '[', ']');

        return { end: j, text: text.slice(i, j).trim() };
    }

    if (text[i] === '-') i++;                                     // read negative sign
    while (i < text.length && /[A-Za-z0-9_.]/.test(text[i])) i++; // read numbers, letters, _.

    while (i < text.length) {
        let j = i;
        while (j < text.length && text[j] === ' ') j++; // read spaces

        // read parens/brackets
        if (j < text.length && text[j] === '(') {
            i = scanGroupedRight(text, j, '(', ')');
            continue;
        }
        if (j < text.length && text[j] === '[') {
            i = scanGroupedRight(text, j, '[', ']');
            continue;
        }
        break;
    }

    return { end: i, text: text.slice(opEndCol + 1, i).trim() };
}

function replaceBinaryOp(text, opRegex, replacement, associativity = 'left', baseCol) {
    let nextCol = associativity === 'right' ? text.length : 0;
    let r; // regex match result

    while (true) {
        // calculate next operator
        if (associativity === 'right') {
            opRegex.lastIndex = 0;
            // find rightmost operator not replaced yet
            let last = null;
            while ((r = opRegex.exec(text)) && r.index < nextCol) {
                last = r;
                if (r[0].length === 0) opRegex.lastIndex++;
            }
            r = last;
        } else {
            opRegex.lastIndex = nextCol;
            r = opRegex.exec(text); // next op
        }
        if (!r) break;

        const opText = r[0];
        const opCol  = r.index;
        const opLen  = opText.length;

        // get left and right operands
        const left  = getLeftOperand( text, opText, opCol,             baseCol);
        const right = getRightOperand(text, opText, opCol + opLen - 1, baseCol);

        // if no left or right operand exist, skip
        if (!left.text || !right.text) {
            nextCol = associativity === 'right' ? opCol : opCol + opLen;
            continue;
        }
        // unreplace
        const leftText  = replace(JSON.stringify(unreplace(left.text)));
        const rightText = replace(JSON.stringify(unreplace(right.text)));
        // before and after
        const before = text.slice(0, left.start);
        const after  = text.slice(right.end);
        // replace -> before + function(left, right, leftText, rightText) + after
        // replacement is either a function in opText (for arith) or just text
        const replaceText = (typeof replacement === 'function') ? replacement(opText) : replacement;
        const inserted = `${replaceText}(${left.text}, ${right.text}, ${leftText}, ${rightText})`;
        text = `${before}${inserted}${after}`;

        // recalculate nextCol
        nextCol = associativity === 'right' ? left.start
                                            : before.length + inserted.length;
    }
    return text;
}


// true/false
function replaceTrueFalse(    text         ) {
    text = text.replace(/\bTRUE\b/gi,  'true');  // true
    text = text.replace(/\bFALSE\b/gi, 'false'); // false

    return text;
}

// function calls
function replaceFuncCalls(    text, baseCol) {
    let next = replaceFuncCallsOnce(text, baseCol);
    let prev = text;
    while (next !== prev) {
        prev = next;
        next = replaceFuncCallsOnce(prev, undefined);
    }
    return next;
}
// multiple passes needed for nested calls
function replaceFuncCallsOnce(text, baseCol) { // baseCol defined only on first pass
    //                 -no ident. before  ---------name---------    (
    const funcRegex = /(?<![A-Za-z0-9_.])([A-Za-z][A-Za-z0-9_]*)\s*\(/g;
    let out = '';
    let endCol = 0;
    let r; // regex match result

    while (r = funcRegex.exec(text)) {
        const name = r[1];
        const upper = name.toUpperCase();
        const nameCol = r.index;
        if (nameCol < endCol) continue;

        out += text.slice(endCol, nameCol); // add everything before

        // already replaced          dont   set  AND (),            OR (),            NOT () as function calls
        if (name.startsWith('__') || (upper === 'AND' || upper === 'OR' || upper === 'NOT')) {
            const afterCol = nameCol + r[0].length;
            out += text.slice(nameCol, afterCol);
            endCol = afterCol;
            continue;
        }

        // get parentheses span
        const openCol = nameCol + r[0].length - 1;
        const closeCol = scanGroupedRight(text, openCol, '(', ')');
        if (closeCol > text.length || text[closeCol - 1] !== ')') { // no closing )
            throwErr('SyntaxError',
                     'missing closing )',
                     currentLineNum, baseCol != null ? baseCol + openCol : openCol, 1);
        }

        // get arguments
        const argsText = text.slice(openCol + 1, closeCol - 1);

        // replace
        if (BUILTIN[upper]) out += `(__BUILTIN.${upper}(${argsText}))`; // builtin call
        else {                                                          // func call
            const replacedArgsText = replace(JSON.stringify(unreplace(argsText)));
            out += `(await __CALL(${JSON.stringify(name)}, ${replacedArgsText}))`;
        }

        endCol = closeCol;
        funcRegex.lastIndex = endCol; // finished this case
    }

    return out + text.slice(endCol); // everything else
}

// round/length/substring/etc.
function replaceBuiltinOps(   text, baseCol) {
    // each builtin call is of the form __BUILTIN(...) due to replaceFuncCalls
    // now, unreplace args in each builtin call
    //                    __BUILTIN .----name----  (
    const builtinStart = /__BUILTIN\.[A-Za-z0-9_]+\(/g;
    let out = '';
    let endCol = 0;
    let r; // regex match result
    // for each builtin call
    while (r = builtinStart.exec(text)) {
        const startCol = r.index;                                   // index of first _ in __BUILTIN
        const openCol = startCol + r[0].length - 1;                 // index of (
        const closeCol = scanGroupedRight(text, openCol, '(', ')'); // one after )

        // add everything before
        out += text.slice(endCol, startCol);

        // no closing )
        if (closeCol > text.length || text[closeCol - 1] !== ')') {
            throwErr('SyntaxError',
                     'missing closing )',
                     currentLineNum, baseCol != null ? baseCol + openCol : openCol, 1);
        }

        // get args
        const argsText = text.slice(openCol + 1, closeCol - 1); // raw text of args
        const argsCol = findPos(text, argsText).col;
        const argsList = splitList(argsText, argsCol);
        const textArgs = argsList.map((part) =>
            replace(JSON.stringify(unreplace(part.item)))
        );

        // replace
        const prefix = text.slice(startCol, openCol);
        const inner = (argsList.length === 0) ? argsText : `${argsText}, ${textArgs.join(', ')}`;
        out += `${prefix}(${inner})`;

        endCol = closeCol;
        builtinStart.lastIndex = closeCol; // finished this case
    }

    return out + text.slice(endCol);
}

// *, /, +, -, ^
function replaceArithOps(     text, baseCol) {
    text = replaceBinaryOp(text, /\^/g,                        '__NUM.POW',               'right', baseCol); // ^
    text = replaceBinaryOp(text, /[*/]/g, (op) => op === '*' ? '__NUM.MUL' : '__NUM.DIV', 'left',  baseCol); // *, /
    text = replaceBinaryOp(text, /[+-]/g, (op) => op === '+' ? '__NUM.ADD' : '__NUM.SUB', 'left',  baseCol); // +, -

    return text;
}

// =, <>, <=, >=, <, >
function replaceCompOps(      text, baseCol) {
    text = replaceBinaryOp(text, /(?<![<>])=/g, '__CMP.EQ', 'left', baseCol);  // =, but not <=, >=
    text = replaceBinaryOp(text, /<>/g,         '__CMP.NE', 'left', baseCol); // <>
    text = replaceBinaryOp(text, /<=/g,         '__CMP.LE', 'left', baseCol); // <=
    text = replaceBinaryOp(text, />=/g,         '__CMP.GE', 'left', baseCol); // >=
    text = replaceBinaryOp(text, /</g,          '__CMP.LT', 'left', baseCol); // <
    text = replaceBinaryOp(text, />/g,          '__CMP.GT', 'left', baseCol); // >

    return text;
}

// not
function replaceNotOps(       text, baseCol) {
    //                --nothing before- NOT
    const notRegex = /(?<![A-Za-z0-9_.])NOT\b/gi;
    while (true) {
        notRegex.lastIndex = 0;
        let r;

        // find rightmost NOT not replaced yet
        let last = null;
        while (r = notRegex.exec(text)) {
            last = r;
            if (r[0].length === 0) notRegex.lastIndex++;
        }
        if (!last) break;

        const notCol = last.index;
        const rightOp = getRightOperand(text, 'NOT', notCol + 'NOT'.length - 1, baseCol);
        // no right operand
        if (!rightOp.text) {
            const col = baseCol != null ? baseCol + notCol : notCol;
            throwErr('SyntaxError',
                     'missing NOT operand',
                     currentLineNum, col, last[0].length);
        }

        const rightText = replace(JSON.stringify(unreplace(rightOp.text))); // unreplace
        const before = text.slice(0, notCol);
        const after  = text.slice(rightOp.end);
        text = `${before}__LOG.NOT(${rightOp.text}, ${rightText})${after}`;
    }
    return text;
}
// and/or
function replaceLogOps(       text, baseCol) {
    text = replaceNotOps(  text,                                                   baseCol);
    text = replaceBinaryOp(text, /(?<![A-Za-z0-9_.])AND\b/gi, '__LOG.AND', 'left', baseCol);
    text = replaceBinaryOp(text, /(?<![A-Za-z0-9_.])OR\b/gi,  '__LOG.OR',  'left', baseCol);

    return text;
}

// Arr[1, 2] ==> __ARR('Arr', 1, 2)
function replaceArrAccess(    text, baseCol) {
    //                  ------------------name------------------    [
    const arrayStart = /(?<![A-Za-z0-9_])([A-Za-z][A-Za-z0-9_]*)\s*\[/g;
    let out = '';
    let endCol = 0;

    let r; // regex match result
    while (r = arrayStart.exec(text)) { // find an array access
        const nameText = r[1];
        const nameCol = r.index;
        out += text.slice(endCol, nameCol); // add everything before

        const openCol = nameCol + r[0].length - 1;                  // index of [
        const closeCol = scanGroupedRight(text, openCol, '[', ']'); // one after ]

        // no closing ]
        if (text[closeCol - 1] !== ']') {
            throwErr('SyntaxError',
                     'missing closing ]',
                     currentLineNum, openCol, 1);
        }

        // already replaced           || name goes to end
        if (nameText.startsWith('__') || closeCol > text.length) {
            out += text.slice(nameCol, closeCol);
            endCol = closeCol;
            continue;
        }

        // get arguments
        const indices = splitList(text.slice(openCol + 1, closeCol - 1), baseCol != null ? baseCol + openCol + 1 : openCol + 1);
        // wrong number of indices
        if (indices.length < 1 || indices.length > 2) {
            const col = baseCol != null ? baseCol + nameCol : nameCol;
            throwErr('SyntaxError',
                     'invalid array access syntax',
                     currentLineNum, col, closeCol - nameCol,
                     'Only one or two indices are allowed.');
        }

        const i = indices[0]?.item;
        const j = indices[1]?.item;

        // replace
        if (j == null) out += `__ARR(${JSON.stringify(nameText)}, ${i})`;
        else           out += `__ARR(${JSON.stringify(nameText)}, ${i}, ${j})`;

        endCol = closeCol;
        arrayStart.lastIndex = closeCol;
    }
    return out + text.slice(endCol);
}

// comma becomes concatenation
function replaceCommaOps(     text, baseCol) {
    // first identify text inside parentheses
    //                   ? !-----name----
    const parenRegex = /(?<![A-Za-z0-9_.])\(/g; // dont match func/builtin
    let out = '';
    let endCol = 0;
    let r; // regex match result
    while (r = parenRegex.exec(text)) {
        const openCol = r.index;
        const closeCol = scanGroupedRight(text, openCol, '(', ')');

        // replace
        out += text.slice(endCol, openCol + 1); // include (
        out += replaceCommaOps(text.slice(openCol + 1, closeCol - 1), baseCol); // recurse on paren contents
        out += ')';

        // reassign
        endCol = closeCol;
        parenRegex.lastIndex = closeCol;
    }
    text = out + text.slice(endCol); // add the rest

    // concatenate each item
    const items = splitList(text, baseCol);
    if (items.length <= 1) return text;
    let result = items[0].item;
    for (let i = 1; i < items.length; i++) {
        result = `__NUM.CONCAT(${result}, ${items[i].item})`; // concatenate each part by adding result again
    }
    return result;
}

// Var + 1 ==> __VAR('Var') + 1
function replaceVarAccess(    text         ) {
    // temporarily protect strings, so text inside them are not considered variables
    return unreplace(replace(text).replace(
    //   before no ident.  --=------name--------  after no ident.
        /(?<![A-Za-z0-9_])([A-Za-z][A-Za-z0-9_]*)(?![A-Za-z0-9_])/g,
        (match, name, offset, text) => {
            // other functions, already replaced
            if (name.startsWith('__'))                               return match;
            // used before function calls
            if (name === 'await')                                    return match;
            // __NUM.ADD, __CMP.EQ, etc.
            if (offset > 0 && text[offset - 1] === '.')              return match;
            // calling/array
            if (/^\s*[\[(]/.test(text.slice(offset + match.length))) return match;
            // name is keyword
            if (KEYWORDS.has(name.toUpperCase()))                    return match;

            // otherwise, name is var
            return `__VAR(${JSON.stringify(name)})`;
        }
    ));
}

function rewriteToJS(         text, baseCol) {
    text = replace(text);
    
    text = replaceTrueFalse (text         );
    text = replaceFuncCalls (text, baseCol);
    text = replaceBuiltinOps(text, baseCol);
    text = replaceArithOps  (text, baseCol);
    text = replaceCompOps   (text, baseCol);
    text = replaceLogOps    (text, baseCol);
    text = replaceArrAccess (text, baseCol);
    text = replaceCommaOps  (text, baseCol);
    text = replaceVarAccess (text         );

    return unreplace(text);
}


// ------------------------ Expression Evaluation ------------------------

// evalExpr evaluates one expression string in a scope
// - first checksSyntax for any strange syntax
// - turns pseudocode into a JS expression: calls/var references turn into predefined function calls
//   - A + 1     -> __NUM.ADD(A, 1, 'A', '1')
//   - Arr[1, 2] -> __ARR('Arr', 1, 2)
// - function is run, those names bound to scope calls like writeArr() and runFunction()

export async function evalExpr(scope, expr, baseCol = undefined, sourceLine = undefined) {
    if (expr == null) return undefined;
    const text = String(expr).trim();
    replaced = []; // reset literal replacement list

    // make sure all syntax is correct
    checkSyntax(text, baseCol);

    try {
        // rewrite to JS
        const textJS = rewriteToJS(text, baseCol);
        // console.log(text + ' => ' + textJS); // debug

        // run evaluation
        const runner = Function(
            '__VAR', '__ARR', '__CALL', '__NUM', '__CMP', '__LOG', '__BUILTIN',
            `return (async function() { return (${textJS}); }).call(this);`
        );

        const result = await runner(
            (name)       => readVar(scope, name,       sourceLine),             // reading vars
            (name, i, j) => readArr(scope, name, i, j,
                { col: baseCol, len: text.length },
                sourceLine
            ),                                                                  // reading arrs
            async (name, argsText) => await runFunction(name, argsText, scope, lines[currentLineNum - 1]), // running functions
            NUM, CMP, LOG, BUILTIN
        );

        // reject non-finite numeric results
        if (typeof result === 'number' && !Number.isFinite(result)) {
            throwErr('ValueError',
                     'expression evaluated to a non-finite value',
                     currentLineNum, baseCol ?? '', text.length,
                     'Expression evaluated to NaN or Infinity.');
        }

        return result;
    } catch (e) {
        if (!e || !e.type) { // generic JS error
            throwErr('SyntaxError',
                     'invalid syntax',
                     currentLineNum, baseCol ?? '', text.length,
                     'If you believe this error is a bug, please report it.');
        }

        throwErr(e.type,
                 String(e.message),
                 e.lineNum ?? currentLineNum, e.col ?? '', e.len ?? '',
                 e.hint ?? '');
    }
}
