import { throwErr,
         assertAssignCompatible, assertValidType,
         assertBool, assertLiteral, assertInt, assertNotKeyword,
         findPos, currentLineNum, setCurrentLineNum
} from './error.js';

import { consts, globalScope, addProperties,
         setDeclared, isDeclared, setInitialized, isInitialized,
         getDeclaredScope, getDeclaredName, getDeclaredScopeName,
         setType, getDeclaredType, getValType
} from './scope.js';

import { evalExpr, splitList, parseVar, getArrIndices, checkSyntax } from './expressions.js';
import { procs, funcs, setArgs }                                     from './procsFuncs.js';
import { isArray, arrMake, arrGet, arrSet }                          from './array.js';
import { formatOutput, output }                                      from './output.js';

const LOOP_LIMIT = 1000000; // 1 million

// ------------------------ Utilities ------------------------

// remove comments from line, avoid  spaces
export function removeComments(text) {
    let quote = '';

    for (let i = 0; i < text.length - 1; i++) {
        const c = text[i];

        // if c is a quote
        //         "             '
        if (c === '"' || c === '\'') {
            if (quote === c) quote = ''; // outside string
            else if (!quote) quote = c;  // inside  string
            continue;
        }

        // outside quote, and comment found
        if (!quote && c === '/' && text[i + 1] === '/') {
            return text.slice(0, i).trim();
        }
    }
    return text.trim();
}

// turns a reference to a variable/array into an object that can be written to and read from
async function varToObj(scope, v, line = '') {
    const pos = findPos(line, v);
    checkSyntax(v, pos.col, false);

    const parsed = parseVar(v, line);
    const [, name] = getDeclaredScopeName(scope, parsed.name, false, line);

    if (parsed.hasIndices) { // array
        // get indices
        const { iText, jText, col, len } = getArrIndices(parsed.name, parsed.indicesText, line);
        const i =         await evalExpr(scope, iText?.item, iText?.col, line);
        const j = jText ? await evalExpr(scope, jText.item,  jText.col,  line) : undefined;
                   assertInt('array index', i, iText?.item, line);
        if (jText) assertInt('array index', j, jText.item,  line);

        return {
            name,
            read:  ()             => readArr( scope, parsed.name, i, j,               { col, len }, line),
            write: (val, valText) => writeArr(scope, parsed.name, i, j, val, valText, { col, len }, line)
        };
    } else { // variable
        return {
            name,
            read:  ()             => readVar( scope, parsed.name,               line),
            write: (val, valText) => writeVar(scope, parsed.name, val, valText, line)
        };
    }
}

export function readVar( scope, name,                                        line = '') {
    const [declaredScope, declaredName] = getDeclaredScopeName(scope, name, true, line);

    return declaredScope[declaredName];
}
export function writeVar(scope, name,       val, valText,                    line = '') {
    const [declaredScope, declaredName] = getDeclaredScopeName(scope, name, false, line);
    const lower = String(name).toLowerCase();

    // check if types are compatible
    const declaredType = getDeclaredType(scope, name);
    assertAssignCompatible(declaredType, val, valText, line);

    // check if var is a constant
    if (Object.prototype.hasOwnProperty.call(consts, lower) && declaredScope === globalScope) { // the scope is the global scope
        const pos = findPos(line, name);
        throwErr('TypeError',
                 'cannot reassign to a constant',
                 currentLineNum, pos.col, pos.len);
    }

    // assign
    declaredScope[declaredName] = val;
    setInitialized(scope, name);
}

export function readArr( scope, name, i, j,               { col, len } = {}, line = '') {
    const [declaredScope, declaredName] = getDeclaredScopeName(scope, name, true, line);

    return arrGet(declaredScope[declaredName], i, j, { col, len });
}
export function writeArr(scope, name, i, j, val, valText, { col, len } = {}, line = '') {
    const [declaredScope, declaredName] = getDeclaredScopeName(scope, name, false, line);

    // check if types are compatible
    const arrayType = getDeclaredType(scope, name).toUpperCase().replace('ARRAY OF ', '').trim();
    assertAssignCompatible(arrayType, val, valText, line);

    // assign
    arrSet(declaredScope[declaredName], i, j, val, { col, len });
    setInitialized(scope, name);
}

// obj <- val
export function assign(scope, obj, val, valText, isInput, line) {
    // get destination type
    const declaredType = getDeclaredType(scope, obj.name);
    const destType = declaredType ? String(declaredType).toUpperCase().replace('ARRAY OF ', '').trim() : '';

    // parse input - make a string into number or bool
    if (isInput && typeof val === 'string') {
        //                                                                     +-   ? --real-- -d.  ?  e   +-  -d.
        if ((!destType || destType === 'INTEGER' || destType === 'REAL') && /^[+-]?(?:\d+\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(val.trim())) {
            const n = Number(val.trim());
            if (Number.isNaN(n) || !Number.isFinite(n)) {
                const pos = findPos(line, valText);
                throwErr('ValueError',
                         'cannot input non-finite value',
                         currentLineNum, pos.col, pos.len,
                         'Expression evaluated to NaN or Infinity.');
            }
            val = n;
        }

        if ((!destType || destType === 'BOOLEAN') && typeof val === 'string') {
            const upper = val.trim().toUpperCase();
            if      (upper === 'TRUE')  val = true;
            else if (upper === 'FALSE') val = false;
        }
    }

    assertAssignCompatible(destType, val, valText, line);
    obj.write(val, valText);
}

// ------------------------ Main Functions ------------------------

// extracts a block of lines until endRegex found
export function readLines(lines, startIndex, startText, startRegex,
                                             endText,   endRegex,
                                             headerLine, allowNesting = false, depthRegex = null) {
    const block = [];
    let closeFound = false;
    let depth = 0;
    let i = startIndex;

    for (; i < lines.length; i++) {
        const lineNum = lines[i].lineNum;
        const text    = lines[i].text;
        const line    = removeComments(text).trim();

        if (/^(PROCEDURE|FUNCTION)\b/i.test(line)) {
            const pos = findPos(text, /^(PROCEDURE|FUNCTION)\b/i);
            throwErr('SyntaxError',
                     `${line.split(/\s+/)[0].toLowerCase()}s can only be declared in the global scope`,
                     lineNum, pos.col, pos.len,
                     `Move the ${line.split(/\s+/)[0].toLowerCase()} declaration outside all procedures and functions.`);
        }

        if (startRegex.test(line)) {
            if (allowNesting) depth++;
            else {
                const pos = findPos(text, startText);
                const lower = startText.toLowerCase();
                throwErr('SyntaxError',
                         `${lower}s can only be declared in the global scope`,
                         lineNum, pos.col, pos.len,
                         `Move the ${lower} declaration outside all procedures and functions.`);
            }
        }
        if (endRegex.test(line)) {
            if (allowNesting && depth > 0) {
                if (!depthRegex || depthRegex.test(line)) depth--;
                block.push({ lineNum, text });
                continue;
            } else {
                closeFound = true;
                break;
            }
        }
        block.push({ lineNum, text });
    }

    // throw error if no closing keyword found
    if (!closeFound) {
        const pos = findPos(headerLine, startText);
        throwErr('SyntaxError',
                 `missing ${endText} for ${startText}`,
                 currentLineNum, pos.col, pos.len);
    }
    return { block, nextLineNum: i };
}


// executes a block of code
export async function runCode(scope, code, allowReturn = false) {
    let r; // regex match result

    for (let i = 0; i < code.length; i++) {
        const lineNum          = code[i].lineNum;
        const lineWithComments = code[i].text;
        const line             = removeComments(lineWithComments).trim();
        if (!line) continue; // empty line

        setCurrentLineNum(lineNum);

        // skip proc/func bodies (already extracted)
        // also check if their names are declared
        //                    PROCEDURE|FUNCTION    ----------name---------
        if (r = line.match(/^(PROCEDURE|FUNCTION)\s+([A-Za-z][A-Za-z0-9_]*)\b/i)) {
            const name = r[2];
            const lower = String(name).toLowerCase();
            if (isDeclared(scope, name) || Object.prototype.hasOwnProperty.call(consts, lower)) {
                const pos = findPos(lineWithComments, name);
                throwErr('SyntaxError',
                         `name ${name} already declared`,
                         lineNum, pos.col, pos.len);
            }

            // read body
            if (r[1].toUpperCase() === 'PROCEDURE') {
                const {nextLineNum} = readLines(code, i + 1, 'PROCEDURE', /^PROCEDURE\b/i, 'ENDPROCEDURE', /^(ENDPROCEDURE)\b/i, lineWithComments);
                i = nextLineNum;
            } else {
                const {nextLineNum} = readLines(code, i + 1, 'FUNCTION',  /^FUNCTION\b/i,  'ENDFUNCTION',  /^(ENDFUNCTION)\b/i,  lineWithComments);
                i = nextLineNum;
            }
            continue;
        }

        // array
        //                   DECLARE   names   :   ARRAY ?     [---dims--] ?   OF   ----type---
        if (r = line.match(/^DECLARE\s+(.+?)\s*:\s*ARRAY(?:\s*\[([^\]]*)\])?\s*OF\s*([A-Za-z]+)\s*$/i)) {
            // declared in a subscope
            if (scope !== globalScope) {
                const pos = findPos(lineWithComments, /\bDECLARE\b/i);
                throwErr('SyntaxError',
                         'arrays cannot be declared in nonglobal scopes',
                         lineNum, pos.col, pos.len,
                         'Move the declaration outside of the block it is in.');
            }

            const namesText = r[1];
            const dimsText  = r[2];
            const type      = r[3];

            // no bounds
            if (!dimsText || !String(dimsText).trim()) {
                const pos = findPos(lineWithComments, /\bARRAY\b(?:\s*\[[^\]]*\])?/i);
                throwErr('SyntaxError',
                         'array declaration missing bounds',
                         lineNum, pos.col, pos.len,
                         `Expected ARRAY[l:u] or ARRAY[l1:u1, l2:u2].`);
            }

            const namesCol = findPos(lineWithComments, namesText).col;
            const dimsCol  = findPos(lineWithComments, dimsText).col;

            const names = splitList(namesText, namesCol).map((name) => parseVar(name.item, lineWithComments).name); // get identifier names
            const dims  = splitList(dimsText,   dimsCol).map((dim)  => dim.item);                                   // part of names/dims

            // pos of dimensions from bracket to bracket
            //                                      [    ^ ]      ]
            const pos = findPos(lineWithComments, /\[\s*[^\]]+\s*\]/);

            // if array is declared improperly
            function invalidArray() {
                throwErr('SyntaxError',
                         'invalid array declaration',
                         lineNum, pos.col, pos.len + 2, // +2 for brackets
                         'Expected ARRAY[l:u] or ARRAY[l1:u1, l2:u2].');
            };

            //  0 dims          || more than 2     || some dim is empty
            if (dims.length < 1 || dims.length > 2 || dims.some(dim => dim === '')) {
                invalidArray();
            }

            // get bounds
            const dimBounds = [];
            dims.forEach((dimText) => {
                // index of colon
                const colonCol = dimText.indexOf(':'); // colcol!
                if (colonCol === -1) invalidArray();

                // lower and upper bounds
                const l = dimText.slice(0, colonCol).trim();
                const u = dimText.slice(colonCol + 1).trim();
                if (!l || !u) invalidArray();

                dimBounds.push({ l, u });
            });

            let l, u, l1, u1, l2, u2;
            if (dims.length === 1) { // 1d
                l  = await evalExpr(scope, dimBounds[0].l, undefined, lineWithComments);
                u  = await evalExpr(scope, dimBounds[0].u, undefined, lineWithComments);
            } else {                 // 2d
                l1 = await evalExpr(scope, dimBounds[0].l, undefined, lineWithComments);
                u1 = await evalExpr(scope, dimBounds[0].u, undefined, lineWithComments);
                l2 = await evalExpr(scope, dimBounds[1].l, undefined, lineWithComments);
                u2 = await evalExpr(scope, dimBounds[1].u, undefined, lineWithComments);
            }

            // ensure type stated is an actual type
            assertValidType(type, lineWithComments);

            // create arrays
            for (const name of names) {
                assertNotKeyword(name, lineWithComments);

                setDeclared(scope, name);
                const declaredName  = getDeclaredName( scope, name);
                const declaredScope = getDeclaredScope(scope, name) || scope;

                // create the array
                if (dims.length === 1) {
                    declaredScope[declaredName] = arrMake(l,  u,  null, null, pos);
                } else {
                    declaredScope[declaredName] = arrMake(l1, u1, l2,   u2,   pos);
                }
                setType(       scope, name, `ARRAY OF ${type}`);
                setInitialized(scope, name);
            }
            continue;
        }

        // declare
        //                   DECLARE   names   :   ----type---
        if (r = line.match(/^DECLARE\s+(.+?)\s*:\s*([A-Za-z]+)\s*$/i)) {
            // declared in a subscope
            if (scope !== globalScope) {
                const pos = findPos(lineWithComments, /\DECLARE\b/i);
                throwErr('SyntaxError',
                         'variables cannot be declared in nonglobal scopes',
                         lineNum, pos.col, pos.len,
                         'Move the declaration outside of the block it is in.');
            }

            const namesText = r[1];
            const type      = r[2];
            assertValidType(type, lineWithComments);

            // declare
            const namesCol = findPos(lineWithComments, namesText).col;
            splitList(namesText, namesCol).forEach(({ item: name }) => {
                name = parseVar(name, lineWithComments).name; // check syntax
                assertNotKeyword(name, lineWithComments);

                // already declared
                if (isDeclared(scope, name)) {
                    const pos = findPos(lineWithComments, name);
                    throwErr('SyntaxError',
                             `variable ${name} already declared`,
                             currentLineNum, pos.col, pos.len);
                }

                setDeclared(scope, name);
                setType(scope, name, type);
            });
            continue;
        }

        // constant
        //                   CONSTANT   names   ----arrow---   -val
        if (r = line.match(/^CONSTANT\s+(.+?)\s*(?:←|<-|<--)\s*(.+)$/i)) {
            // declared in a subscope
            if (scope !== globalScope) {
                const pos = findPos(lineWithComments, /\bCONSTANT\b/i);
                throwErr('SyntaxError',
                         'constants cannot be declared in nonglobal scopes',
                         lineNum, pos.col, pos.len,
                         'Move the declaration outside of the block it is in.');
            }

            const namesText = r[1];
            const valText   = r[2].trim();

            assertLiteral('constant value', valText, lineWithComments,
                'Constants must be assigned literals (e.g. 6.50, "N/A"), never variables or other expressions.'
            );

            // get value
            const valCol = findPos(lineWithComments, valText).col;
            const val = await evalExpr(scope, valText, valCol, lineWithComments);

            // declare and initialize
            const namesCol = findPos(lineWithComments, namesText).col;
            splitList(namesText, namesCol).forEach(({ item: name }) => {
                name = parseVar(name, lineWithComments).name; // check syntax
                // declare
                assertNotKeyword(name, lineWithComments);

                // already declared
                if (isDeclared(scope, name)) {
                    const pos = findPos(lineWithComments, name);
                    throwErr('SyntaxError',
                             `constant ${name} already declared`,
                             currentLineNum, pos.col, pos.len);
                }

                setDeclared(scope, name);
                setType(scope, name, getValType(val, valText));
                consts[String(name).toLowerCase()] = true;

                // initialize
                setInitialized(scope, name);
                scope[name] = val;
            });
            continue;
        }

        // input
        //                   INPUT   -var
        if (r = line.match(/^INPUT\s+(.+)$/i)) {
            const varText = r[1].trim();
            const parsed = parseVar(varText, lineWithComments);

            // ensure declared
            // don't redeclare array elements
            if (!parsed.hasIndices && !isDeclared(scope, parsed.name)) {
                setDeclared(scope, parsed.name);
            }

            // cannot input to arrays
            if (isArray(scope, parsed.name) && !parsed.hasIndices) {
                const pos = findPos(lineWithComments, varText);
                throwErr('SyntaxError',
                         'arrays cannot be input directly',
                         currentLineNum, pos.col, pos.len,
                         'Input individual elements instead.');
            }

            const obj = await varToObj(scope, varText, lineWithComments);
            const inputText = await self.readInput();

            // assign
            assign(scope, obj, inputText, varText, true, lineWithComments);
            if (!parsed.hasIndices && !getDeclaredType(scope, obj.name)) {
                setType(scope, obj.name, getValType(obj.read(), inputText));
            }
            setInitialized(scope, obj.name);

            // if next statement is input, seperate inputs
            for (let k = i + 1; k < code.length; k++) {
                const next = removeComments(code[k].text).trim(); if (!next) continue;
                if (/^INPUT\b/i.test(next)) output([]); // even though nothing is output, automatic newline still there
                break;
            }
            continue;
        }

        // output
        //                   OUTPUT   vars
        if (r = line.match(/^OUTPUT\s+(.+)$/i)) {
            const valsText = r[1];
            const valsCol = findPos(lineWithComments, valsText).col;
            const valsItems = splitList(valsText, valsCol);

            // calculate vals
            const vals = [];
            for (const val of valsItems) {
                vals.push(await evalExpr(scope, val.item, val.col, lineWithComments));
            }

            // check for arrays and throw error if found
            for (let j = 0; j < vals.length; j++) {
                if (Array.isArray(vals[j])) {
                    const pos = findPos(lineWithComments, valsItems[j].item);
                    throwErr('TypeError',
                             'cannot output array',
                             currentLineNum, pos.col, pos.len,
                             'Arrays cannot be output directly. Output individual elements instead.');
                }
            }

            const out = valsItems.map((val, i) => formatOutput(scope, val.item, vals[i]));
            output(out);
            continue;
        }

        // for (this must be before the assignment check due to the vvvvv)
        //                   FOR   ----------var----------   ----arrow---   -val-   TO   -val- ?    STEP   -val
        if (r = line.match(/^FOR\s+([A-Za-z][A-Za-z0-9_]*)\s*(?:←|<-|<--)\s*(.+?)\s+TO\s*(.+?)(?:\s+STEP\s+(.+))?\s*$/i)) {
            const name      = r[1];
            const startText = r[2];
            const endText   = r[3];
            const stepText  = r[4] || '1';

            // ensure var is declared and initialized
            if (!isDeclared(scope, name)) {
                setDeclared(scope, name);
                setType(scope, name, 'INTEGER')
            }
            if (!isInitialized(scope, name)) setInitialized(scope, name);

            // ensure var is integer
            let varType = getDeclaredType(scope, name);
            if (varType !== 'INTEGER') {
                const pos = findPos(lineWithComments, name);
                throwErr('TypeError',
                         `variable ${name} must be an integer`,
                         lineNum, pos.col, pos.len);
            }

            // read for block
            const { block: forBlock, nextLineNum } = readLines(code, i + 1, `FOR ${name}`,  /^FOR\b/i,
                                                                        `NEXT ${name}`, /^NEXT\s+[A-Za-z][A-Za-z0-9_]*$/i,
                                                                        lineWithComments, true);
            i = nextLineNum;

            // detect wrong next variable
            const nextLine = removeComments(code[i].text).trim();
            const nextVar  = nextLine.match(/^NEXT\s+([A-Za-z][A-Za-z0-9_]*)$/i)[1];
            const forName  = getDeclaredName(scope, name); // original

            //  undeclared      var         or next var not equal to for var
            if (!isDeclared(scope, nextVar) || getDeclaredName(scope, nextVar) !== forName) {
                const pos = findPos(nextLine, nextVar);
                throwErr('SyntaxError',
                         `NEXT variable ${nextVar} does not match FOR variable ${forName}`,
                         code[i].lineNum, pos.col, pos.len,
                         `Did you mean NEXT ${name}?`);
            }

            // get bounds
            const startCol = findPos(lineWithComments, startText).col;
            const endCol   = findPos(lineWithComments, endText  ).col;

            const startVal = await evalExpr(scope, startText, startCol, lineWithComments);
            const endVal   = await evalExpr(scope, endText,   endCol,   lineWithComments);

            assertInt('FOR start', startVal, startText, lineWithComments);
            assertInt('FOR end',   endVal,   endText,   lineWithComments);

            const start = Number(startVal);
            const end   = Number(endVal);

            // get step
            let step;
            if (r[4]) { // custom step
                const stepCol = findPos(lineWithComments, stepText ).col;
                const stepVal = await evalExpr(scope, stepText, stepCol, lineWithComments);
                assertInt('FOR step', stepVal, stepText, lineWithComments);
                step = Number(stepVal);
                if (step === 0) { // zero step
                    const pos = findPos(lineWithComments, stepText);
                    throwErr('ValueError',
                            'step must be nonzero',
                            lineNum, pos.col, pos.len);
                }
            } else {    // default step
                step = 1;
            }

            // execute loop
            let count = 0;
            const dN = getDeclaredName( scope, name);
            const dS = getDeclaredScope(scope, name) || scope;

            for (dS[dN] = start;   (step > 0) ? dS[dN] <= end : dS[dN] >= end;   dS[dN] += step) {
                const forScope = Object.create(scope); addProperties(forScope); // create a scope
                await runCode(forScope, forBlock, allowReturn);
                count++;

                // too many loops
                if (count > LOOP_LIMIT) {
                    const pos = findPos(lineWithComments, 'FOR');
                    throwErr('RuntimeError',
                             'maximum iteration limit exceeded',
                             lineNum, pos.col, pos.len,
                             'A maximum of 1 million iterations is allowed for loops.');
                }
            }

            if (count > 0) dS[dN] = end; // normalize to last iterated value (only if loop ran)
            continue;
        }

        // assignment
        //                   -var-   ----arrow---   -val
        if (r = line.match(/^(.+?)\s*(?:←|<--|<-)\s*(.+)$/)) {
            const varText = r[1].trim();
            const valText = r[2];
            const parsed = parseVar(varText, lineWithComments);

            // ensure declared
            // don't redeclare array elements
            if (!parsed.hasIndices && !isDeclared(scope, parsed.name)) {
                setDeclared(scope, parsed.name);
            }

            // cannot assign to arrays
            if (isArray(scope, parsed.name) && !parsed.hasIndices) {
                const pos = findPos(lineWithComments, varText);
                throwErr('SyntaxError',
                         'arrays cannot be assigned directly',
                         currentLineNum, pos.col, pos.len,
                         'Assign to individual elements instead.');
            }

            const obj = await varToObj(scope, varText, lineWithComments);

            // get value
            const valCol = findPos(lineWithComments, valText).col;
            const val = await evalExpr(scope, valText, valCol, lineWithComments);

            // cannot assign an array value
            if (Array.isArray(val)) {
                const pos = findPos(lineWithComments, valText);
                throwErr('TypeError',
                         'arrays cannot be assigned',
                         currentLineNum, pos.col, pos.len);
            }

            // assign
            assign(scope, obj, val, valText, false, lineWithComments);
            if (!isArray(scope, parsed.name) && !getDeclaredType(scope, obj.name)) { // assigned for the first time
                if (scope != globalScope) { // cannot be initialized in nonglobal scopes
                    const pos = findPos(lineWithComments, varText);
                    throwErr('NameError',
                             `variables cannot be initialized for the first time in non-global scopes`,
                             lineNum, pos.col, pos.len,
                             `Initialize the variable or declare it outside of the block it is in.`);
                }

                let valType;
                const identName = valText.match(/^([A-Za-z][A-Za-z0-9_]*)/)[1];
                if (/^[A-Za-z][A-Za-z0-9_]*$/.test(valText)) {
                    // simple variable — inherit its declared type
                    valType = getDeclaredType(scope, valText);
                } else if (identName && /^[A-Za-z][A-Za-z0-9_]*\s*\(/.test(valText)) {
                    // function call — inherit the function's return type
                    valType = funcs[identName.toLowerCase()]?.returns;
                } else if (identName && /^[A-Za-z][A-Za-z0-9_]*\s*\[/.test(valText)) {
                    // array element — inherit the array's element type
                    const arrType = getDeclaredType(scope, identName);
                    valType = arrType?.replace(/^ARRAY\s+OF\s+/i, '').trim() || undefined;
                }

                setType(scope, obj.name, valType || getValType(val, valText));
            }
            continue;
        }

        // if (one or two lines)
        //                   IF   -cond       THEN  ?----cmd---
        if (r = line.match(/^IF\s+(.+?)(?:\s+(THEN)(?:\s+(.+))?)?\s*$/i)) {
            const condText = r[1];

            // read THEN block
            if (!r[2]) { // two lines, THEN on following line
                // find next line after IF with text
                let j = i + 1;
                while (j < code.length) {
                    if (removeComments(code[j].text).trim()) break;
                    j++;
                }

                // no THEN found in block
                if (j >= code.length || !/^THEN$/i.test(removeComments(code[j].text))) {
                    const pos = findPos(lineWithComments, /IF/i);
                    throwErr('SyntaxError',
                             'missing THEN after IF',
                             lineNum, pos.col, pos.len);
                }

                i = j + 1;
            }

            const thenLineNum = r[2] ? i + 1 : i; // if then on same line, skip if
            // read IF block
            const { block: thenBlock, nextLineNum } = readLines(code, thenLineNum, 'IF',    /^IF\b/i,
                                                                                   'ENDIF', /^(ELSE|ENDIF)\b/i,
                                                                                   lineWithComments, true, /^ENDIF\b/i);
            i = nextLineNum;

            // prepend inline THEN statement if present (e.g. IF x THEN OUTPUT 1)
            if (r[3]) thenBlock.unshift({ lineNum, text: r[3] });

            // read ELSE block if it exists
            const elseLine = removeComments(code[i].text).trim();
            let elseBlock = [];
            if (/^ELSE\b/i.test(elseLine)) {
                const elseLineNum  = code[i].lineNum;
                const elseInline   = elseLine.slice('ELSE'.length).trim(); // inline cmd after ELSE
                const { block, nextLineNum } = readLines(code, i + 1, 'IF',    /^IF\b/i,
                                                                      'ENDIF', /^ENDIF\b/i,
                                                                      lineWithComments, true);
                i = nextLineNum;
                elseBlock = block;

                // prepend inline ELSE statement if present (e.g. ELSE OUTPUT 2)
                if (elseInline) elseBlock.unshift({ lineNum: elseLineNum, text: elseInline });
            }

            // get condition
            const condCol = findPos(lineWithComments, condText).col;
            const cond = await evalExpr(scope, condText, condCol, lineWithComments);
            assertBool('IF condition', cond, condText, lineWithComments);

            // execute
            const ifScope = Object.create(scope); addProperties(ifScope); // create a scope
            if (cond) await runCode(ifScope, thenBlock, allowReturn);
            else      await runCode(ifScope, elseBlock, allowReturn);
            continue;
        }

        // case
        //                   CASE   OF   -var
        if (r = line.match(/^CASE\s+OF\s+(.+)$/i)) {
            const name = r[1];

            // read CASE block
            const { block: caseBlock, nextLineNum } = readLines(code, i + 1, 'CASE',    /^CASE\s+OF\b/i,
                                                                             'ENDCASE', /^(ENDCASE)\b/i,
                                                                             lineWithComments, true);
            i = nextLineNum;

            // case variable
            const valCol = findPos(lineWithComments, name).col;
            const val = await evalExpr(scope, name, valCol, lineWithComments);

            // parse case block into cases with corresponding commands
            const cases = [];
            let currentCase = null;
            for (let j = 0; j < caseBlock.length; j++) {
                const caseLineNum          = caseBlock[j].lineNum;
                const caseLineWithComments = caseBlock[j].text;
                const caseLine             = removeComments(caseLineWithComments).trim();

                // add blank lines to case
                if (!caseLine) {
                    if (currentCase) currentCase.block.push(caseBlock[j]);
                    continue;
                }

                // nested CASE blocks not allowed
                if (/^CASE\b/i.test(caseLine)) {
                    const pos = findPos(caseLineWithComments, 'CASE');
                    throwErr('SyntaxError',
                             'CASE statements cannot be nested',
                             caseLineNum, pos.col, pos.len);
                }

                // otherwise
                if (/^OTHERWISE\b/i.test(caseLine)) {
                    const otherwiseText = caseLine.slice('OTHERWISE'.length).trim();
                    if (currentCase) cases.push(currentCase); // end of previous case
                    currentCase = {
                        otherwise: true,
                        lineNum: caseLineNum,
                        line: caseLineWithComments,
                        block: []
                    };

                    // command on same line as otherwise
                    if (otherwiseText) currentCase.block.push({ lineNum: caseLineNum, text: otherwiseText });
                    continue;
                }

                // scan for colon if case label
                let quote = '';
                let depth = 0;
                let colonCol = -1;

                for (let k = 0; k < caseLine.length; k++) {
                    const c = caseLine[k];

                    // if c is a quote
                    //         "             '
                    if (c === '"' || c === '\'') {
                        if (quote === c) quote = ''; // outside string
                        else if (!quote) quote = c;  // inside  string
                        continue;
                    }

                    if (!quote && (c === '(' || c === '[')) depth++; // inside  brackets
                    if (!quote && (c === ')' || c === ']')) depth--; // outisde brackets

                    // outside quote and top-level, colon found
                    if (!quote && depth === 0 && c === ':') {
                        colonCol = k;
                        break;
                    }
                }
                // normal case label
                if (colonCol >= 0) {
                    const checkVal = caseLine.slice(0, colonCol).trim();
                    const cmdText = caseLine.slice(colonCol + 1).trim();

                    if (!checkVal) {
                        throwErr('SyntaxError',
                                 'missing value in case label',
                                 caseLineNum, colonCol, 1);
                    }

                    // nested CASE as inline command (e.g. "1 : CASE OF X")
                    if (/^CASE\b/i.test(cmdText)) {
                        const pos = findPos(caseLineWithComments, 'CASE');
                        throwErr('SyntaxError',
                                 'CASE statements cannot be nested',
                                 caseLineNum, pos.col, pos.len);
                    }

                    if (currentCase) cases.push(currentCase); // end of previous case
                    currentCase = {
                        otherwise: false,
                        lineNum: caseLineNum,
                        checkVal,
                        line: caseLineWithComments,
                        block: []
                    };

                    // command on same line as case label
                    if (cmdText) currentCase.block.push({ lineNum: caseLineNum, text: cmdText });
                    continue;
                }

                if (currentCase) { // statement inside case body
                    currentCase.block.push(caseBlock[j]);
                    continue;
                } else {           // statement outside case body
                    const pos = findPos(caseLineWithComments, caseLine);
                    throwErr('SyntaxError',
                             'statement found outside case',
                             caseLineNum, pos.col, pos.len);
                }
            }
            if (currentCase) cases.push(currentCase); // push last case

            // go through cases and compare to val
            let matched = null;
            let otherwise = null;
            for (const c of cases) {
                // found the otherwise case
                if (c.otherwise) {
                    if (otherwise) { // otherwise case already there
                        const pos = findPos(c.line, 'OTHERWISE');
                        throwErr('SyntaxError',
                                 'OTHERWISE case already defined',
                                 c.lineNum, pos.col, pos.len);
                    }
                    otherwise = c;
                    continue;
                }

                if (matched) continue;

                // get value
                const caseCol = findPos(c.line, c.checkVal).col;
                const caseVal = await evalExpr(scope, c.checkVal, caseCol, c.line);

                // type check: both sides must be the same JS type (catches e.g. INTEGER vs STRING)
                if (typeof val !== typeof caseVal || Array.isArray(val) || Array.isArray(caseVal)) {
                    const pos = findPos(c.line, c.checkVal);
                    throwErr('TypeError',
                             `cannot compare ${getValType(val, name)} with ${getValType(caseVal, c.checkVal)}`,
                             c.lineNum, pos.col, pos.len);
                }

                // run the first case matched
                if (val === caseVal) matched = c;
            }

            // run first matched case, or otherwise if no case matched
            const caseScope = Object.create(scope); addProperties(caseScope); // create a scope
            if (matched)        await runCode(caseScope, matched.block,   allowReturn);
            else if (otherwise) await runCode(caseScope, otherwise.block, allowReturn);
            continue;
        }

        // while
        //                   WHILE   cond  ?DO
        if (r = line.match(/^WHILE\s+(.+?)(?:\s+(DO))?\s*$/i)) {
            const condText = r[1];

            // no DO
            if (!r[2]) {
                const pos = findPos(lineWithComments, condText);
                throwErr('SyntaxError',
                         'missing DO after WHILE condition',
                         lineNum, pos.col + pos.len, 0);
            }

            const condCol = findPos(lineWithComments, condText).col;

            // read while block
            const { block: whileBlock, nextLineNum } = readLines(code, i + 1, 'WHILE',    /^\bWHILE\b/i,
                                                                              'ENDWHILE', /^\bENDWHILE\b/i,
                                                                              lineWithComments, true);
            i = nextLineNum;

            // execute
            let count = 0;
            while (true) {
                setCurrentLineNum(code[i].lineNum);
                const cond = await evalExpr(scope, condText, condCol, lineWithComments);
                assertBool('WHILE condition', cond, condText, lineWithComments);
                if (!cond) break;

                const whileScope = Object.create(scope); addProperties(whileScope); // create a scope
                await runCode(whileScope, whileBlock, allowReturn);
                count++;

                // too many loops
                if (count > LOOP_LIMIT) {
                    const pos = findPos(lineWithComments, 'WHILE');
                    throwErr('RuntimeError',
                             'maximum iteration limit exceeded',
                             lineNum, pos.col, pos.len,
                             'A maximum of 1 million iterations is allowed for loops.');
                }
            }
            continue;
        }

        // repeat
        //                   REPEAT
        if (r = line.match(/^REPEAT$/i)) {
            // read repeat block
            const { block: repeatBlock, nextLineNum } = readLines(code, i + 1, 'REPEAT', /^\bREPEAT\b/i,
                                                                               'UNTIL',  /^\bUNTIL\b/i,
                                                                               lineWithComments, true);
            i = nextLineNum;

            const untilLine = removeComments(code[i].text).trim();
            const untilMatch = untilLine.match(/^UNTIL\s+(.+)$/i);
            if (!untilMatch) { // no condition
                const pos = findPos(untilLine, 'UNTIL');
                throwErr('SyntaxError',
                         'missing UNTIL condition',
                         code[i].lineNum, pos.col, pos.len);
            }

            const condText = untilMatch[1].trim();
            const condCol = findPos(untilLine, condText).col;

            // execute
            let count = 0;
            do {
                const repeatScope = Object.create(scope); addProperties(repeatScope); // create a scope
                await runCode(repeatScope, repeatBlock, allowReturn);
                count++;

                setCurrentLineNum(code[i].lineNum);
                const cond = await evalExpr(scope, condText, condCol, untilLine);
                assertBool('UNTIL condition', cond, condText, untilLine);
                if (cond) break;

                // too many loops
                if (count > LOOP_LIMIT) {
                    const pos = findPos(lineWithComments, 'REPEAT');
                    throwErr('RuntimeError',
                             'maximum iteration limit exceeded',
                             lineNum, pos.col, pos.len,
                             'A maximum of 1 million iterations is allowed for loops.');
                }
            } while (true);
            continue;
        }

        // procedure call
        //                   CALL   -------proc name------- ?     (-args)
        if (r = line.match(/^CALL\s+([A-Za-z][A-Za-z0-9_]*)(?:\s*\((.*)\))?\s*$/i)) {
            const name     = r[1];
            const argsText = r[2] || '';

            // find procedure
            const proc = procs[String(name).toLowerCase()];
            if (!proc) {
                // call used with func instead
                const func = funcs[String(name).toLowerCase()];
                if (func) {
                    const pos = findPos(lineWithComments, 'CALL');
                    throwErr('SyntaxError',
                             `unexpected keyword CALL`,
                             lineNum, pos.col, pos.len,
                             'CALL cannot be used with functions.');
                }

                const pos = findPos(lineWithComments, name);
                throwErr('NameError',
                         `undefined procedure ${name}`,
                         lineNum, pos.col, pos.len);
            }

            const procScope = Object.create(globalScope); addProperties(procScope); // create a scope
            await setArgs(procScope, scope, proc.params, argsText, lineWithComments, proc.headerLineNum, proc.headerText);

            await runCode(procScope, proc.body, false); // run the procedure
            continue;
        }

        // function return
        //                   RETURN   -val
        if (r = line.match(/^RETURN\s+(.+)$/i)) {
            if (!allowReturn) { // outside function
                const pos = findPos(lineWithComments, 'RETURN');
                throwErr('SyntaxError',
                         'RETURN used outside function',
                         lineNum, pos.col, pos.len);
            }

            // get arguments of return
            const valText = r[1];
            const valCol = findPos(lineWithComments, valText).col;
            const valItems = splitList(valText, valCol);
            if (valItems.length !== 1) {
                throwErr('SyntaxError',
                         'invalid return value',
                         lineNum, valCol, valText.length,
                         'Return a single expression.');
            }

            const val = await evalExpr(scope, valItems[0].item, valItems[0].col, lineWithComments);

            throw { isReturn: true, val, valText, line: lineWithComments }; // return is in the form of an error
        }

        // make sure all syntax is correct
        checkSyntax(line, 0, true);

        // misc. error
        throwErr('SyntaxError',
                 'invalid syntax',
                 lineNum, '', '',
                 'If you believe this error is a bug, please report it.');
    }
}
