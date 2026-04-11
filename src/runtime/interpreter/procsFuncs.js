import {
    throwErr, currentLineNum, findPos, lines, setCurrentLineNum,
    assertAssignCompatible, assertValidType, assertNotKeyword
} from './error.js';

import {
    globalScope, addProperties, setType, setDeclared,
    isDeclared, setInitialized, getDeclaredName, consts
} from './scope.js';

import { splitList, evalExpr, parseVar } from './expressions.js';
import { removeComments, runCode, readLines } from './execute.js';

export const procs = Object.create(null);
export const funcs = Object.create(null);

function assertNoNonGlobalDeclarations(body) {
    for (const { lineNum, text } of body) {
        const line = removeComments(text).trim();
        if (!/^DECLARE\b/i.test(line)) continue;

        const pos = findPos(text, /\bDECLARE\b/i);
        throwErr('SyntaxError',
                 'variables cannot be declared in nonglobal scopes',
                 lineNum, pos.col, pos.len,
                 'Move the declaration outside of the block it is in.');
    }
}

// extract proc/func bodies (first step in interpretation)
export function getProcFuncs(lines) {
    let r; // regex match result

    for (let i = 0; i < lines.length; i++) {
        const lineNum          = lines[i].lineNum;
        const lineWithComments = lines[i].text;
        const line             = removeComments(lineWithComments).trim();
        if (!line) continue;
        setCurrentLineNum(lineNum);

        // procedure
        //                      PROCEDURE    ---------name---------    ?  (-params-)
        if (r = line.match(/^\s*PROCEDURE\s+([A-Za-z][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*$/i)) {
            const name       = r[1];
            const paramsText = r[2];
            assertNotKeyword(name, lineWithComments);

            // proc name already exists
            const lower = String(name).toLowerCase();
            if (Object.prototype.hasOwnProperty.call(procs, lower) || Object.prototype.hasOwnProperty.call(funcs, lower)) {
                const pos = findPos(line, name);
                throwErr('SyntaxError',
                         `name ${name} already declared`,
                         currentLineNum, pos.col, pos.len);
            }

            // read until ENDPROCEDURE
            const openCol = findPos(lineWithComments, '(').col;
            const params = parseDeclaredParams(paramsText, lineWithComments, openCol + 1);
            const { block: body, nextLineNum } = readLines(lines, i + 1, 'PROCEDURE', /^PROCEDURE\b/i, 'ENDPROCEDURE', /^(ENDPROCEDURE)\b/i, lineWithComments);
            i = nextLineNum;

            // ensure no nonglobal declarations
            for (const { lineNum, text } of body) {
                const line = removeComments(text).trim();
                if (!/^DECLARE\b/i.test(line)) continue;

                const pos = findPos(text, /\bDECLARE\b/i);
                throwErr('SyntaxError',
                        'variables cannot be declared in nonglobal scopes',
                        lineNum, pos.col, pos.len,
                        'Move the declaration outside of the block it is in.');
            }

            procs[String(name).toLowerCase()] = { name, params, body, headerText: lineWithComments, headerLineNum: lineNum };
            continue;
        }

        // function
        //                      FUNCTION   ----------name---------    ?  (-params-)   ?    RETURNS   ----type---
        if (r = line.match(/^\s*FUNCTION\s+([A-Za-z][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?(?:\s+RETURNS\s+([A-Za-z]*))?\s*$/i)) {
            const name       = r[1];
            const paramsText = r[2];
            const returns    = r[3];
            assertNotKeyword(name, lineWithComments);

            // func name already exists
            const lower = String(name).toLowerCase();
            if (Object.prototype.hasOwnProperty.call(funcs, lower) || Object.prototype.hasOwnProperty.call(procs, lower)) {
                const pos = findPos(line, name);
                throwErr('SyntaxError',
                         `name ${name} already declared`,
                         currentLineNum, pos.col, pos.len);
            }

            // ensure there is a returns
            if (!r[3]) {
                const pos = findPos(lineWithComments, /\bFUNCTION\b/i);
                throwErr('SyntaxError',
                         'expected RETURNS after function declaration',
                         lineNum, pos.col, pos.len);
            }
            assertValidType(returns, lineWithComments);

            // read function until ENDFUNCTION
            const openCol = findPos(lineWithComments, '(').col;
            const params = parseDeclaredParams(paramsText, lineWithComments, openCol + 1);
            const { block: body, nextLineNum } = readLines(lines, i + 1, 'FUNCTION', /^FUNCTION\b/i, 'ENDFUNCTION', /^(ENDFUNCTION)\b/i, lineWithComments);
            i = nextLineNum;

            // ensure no nonglobal declarations
            for (const { lineNum, text } of body) {
                const line = removeComments(text).trim();
                if (!/^DECLARE\b/i.test(line)) continue;

                const pos = findPos(text, /\bDECLARE\b/i);
                throwErr('SyntaxError',
                        'variables cannot be declared in nonglobal scopes',
                        lineNum, pos.col, pos.len,
                        'Move the declaration outside of the block it is in.');
            }

            funcs[String(name).toLowerCase()] = { name, params, returns, body, headerText: lineWithComments, headerLineNum: lineNum };
            continue;
        }

        // PROCEDURE/FUNCTION line that didn't match either pattern — malformed header
        if (/^(PROCEDURE|FUNCTION)\b/i.test(line)) {
            throwErr('SyntaxError', 'invalid syntax', lineNum, '', '');
        }
    }
}

// get name, type of proc/func in declaration
export function parseDeclaredParams(paramsText, headerText, baseCol) {
    if (!paramsText || !paramsText.trim()) return [];

    const params = splitList(paramsText, baseCol);
    const result = [];
    const paramNames = new Set();
    for (let i = 0; i < params.length; i++) {
        const paramText = params[i].item.trim();

        // find colon
        const colon = paramText.indexOf(':');
        if (colon < 0) { // error if no colon
            throwErr('SyntaxError',
                     `parameter ${paramText} must declare a type`,
                     currentLineNum, params[i].col, paramText.length);
        }

        // get name, type
        const nameText = paramText.slice(0, colon).trim();
        const type     = paramText.slice(colon + 1).trim();
        const name = parseVar(nameText, headerText).name;
        assertNotKeyword(name, headerText);
        assertValidType( type, headerText);
        if (!name) { // no name declared
            throwErr('SyntaxError',
                     'empty parameter name',
                     currentLineNum, params[i].col, paramText.length);
        }

        const lower = String(name).toLowerCase();
        // duplicate param
        if (paramNames.has(lower)) {
            throwErr('SyntaxError',
                     `parameter ${name} already declared`,
                     currentLineNum, params[i].col, paramText.length);
        }
        paramNames.add(lower);

        result.push({ name, type });
    }
    return result;
}

// put args in procedure and function during a call
export async function setArgs(scope, callScope, declaredParams, calledArgsText, line = lines[currentLineNum - 1].text, declLineNum = currentLineNum, declLineText = line) {
    const calledArgsCol = findPos(line, calledArgsText).col;
    const calledArgs = splitList(calledArgsText, calledArgsCol);

    // mismatching number of arguments
    if (calledArgs.length !== declaredParams.length) {
        const pos = findPos(line, calledArgsText);
        throwErr('TypeError',
                 'incorrect number of arguments in call',
                 currentLineNum, pos.col, pos.len,
                 `Expected ${declaredParams.length} arguments, got ${calledArgs.length}.`);
    }

    // set parameters
    for (let i = 0; i < declaredParams.length; i++) {
        const { name, type } = declaredParams[i];
        const calledArgText  = calledArgs[i];
        const calledArg = await evalExpr(callScope, calledArgText.item, calledArgText.col, line);

        // type
        setType(scope, name, type);
        assertAssignCompatible(String(type).toUpperCase(), calledArg, calledArgText.item, line);

        // declare and initialize
        const lower = String(name).toLowerCase();
        if ((Object.prototype.hasOwnProperty.call(scope,  'decl') && isDeclared(scope, name)) || // already declared
             Object.prototype.hasOwnProperty.call(consts, lower) ||
             Object.prototype.hasOwnProperty.call(procs,  lower) ||
             Object.prototype.hasOwnProperty.call(funcs,  lower)) {
            const pos = findPos(declLineText, name);
            throwErr('SyntaxError',
                     `name ${name} already declared`,
                     declLineNum, pos.col, pos.len);
        }
        setDeclared(scope, name);
        scope[getDeclaredName(scope, name)] = calledArg;
        setInitialized(scope, name);
    }
}

// run a function
export async function runFunction(name, argsText, callScope, callLine = lines[currentLineNum - 1]) {
    const func = funcs[name.toLowerCase()];

    // not defined
    if (!func) {
        const pos = findPos(callLine.text, name);

        throwErr('NameError',
                 `function ${name} is not defined`,
                 callLine.lineNum, pos.col, pos.len);
    }

    const funcScope = Object.create(globalScope); addProperties(funcScope); // create a scope
    await setArgs(funcScope, callScope, func.params, argsText, callLine.text, func.headerLineNum, func.headerText);

    // run the function
    let val, valText, line;
    try {
        await runCode(funcScope, func.body, true);
    } catch (e) { // return is in the form of an error
        if (e.isReturn) {
            val     = e.val;
            valText = e.valText;
            line    = e.line;
        }
        else throw e; // regular error
    }

    if (valText == null) {
        const pos = findPos(callLine.text, name);
        throwErr('SyntaxError',
                 `missing RETURN in ${func.name}`,
                 callLine.lineNum, pos.col, pos.len);
    }

    // check if what the function returns is what it was said to return
    const type = func.returns.toUpperCase();
    assertAssignCompatible(type, val, valText, line,
                           `The returned value does not match declared type ${type}.`);

    return val;
}
