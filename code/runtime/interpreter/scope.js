import { assertDeclared, assertInitialized, currentLineNum, lines, findPos, throwErr } from './error.js';
import { procs, funcs }                                             from './procsFuncs.js';

export const globalScope = Object.create(null); addProperties(globalScope);
export const consts      = Object.create(null);

export function addProperties(scope) {
    if (!Object.prototype.hasOwnProperty.call(scope, 'decl'         )) Object.defineProperty(scope, 'decl',          { value: new Set(),           enumerable: false }); // lowercase names
    if (!Object.prototype.hasOwnProperty.call(scope, 'case'         )) Object.defineProperty(scope, 'case',          { value: Object.create(null), enumerable: false }); // lower -> declaredName
    if (!Object.prototype.hasOwnProperty.call(scope, 'init'         )) Object.defineProperty(scope, 'init',          { value: Object.create(null), enumerable: false }); // lower -> bool
    if (!Object.prototype.hasOwnProperty.call(scope, 'types'        )) Object.defineProperty(scope, 'types',         { value: Object.create(null), enumerable: false });
    if (!Object.prototype.hasOwnProperty.call(scope, 'assumed_reals')) Object.defineProperty(scope, 'assumed_reals', { value: new Set(),           enumerable: false }); // undeclared names that were intialized a number, and the type was assumed to be REAL
}

export function initScope() {
    // clear procs/funcs/consts/globals
    for (const k of Object.keys(consts))      delete consts[k];
    for (const k of Object.keys(procs))       delete procs[k];
    for (const k of Object.keys(funcs))       delete funcs[k];
    for (const k of Object.keys(globalScope)) delete globalScope[k];

    // clear globals metadata
    if (globalScope.decl)          globalScope.decl.clear();
    if (globalScope.init)          for (const k in globalScope.init)  delete globalScope.init[k];
    if (globalScope.types)         for (const k in globalScope.types) delete globalScope.types[k];
    if (globalScope.case)          for (const k in globalScope.case)  delete globalScope.case[k];
    if (globalScope.assumed_reals) globalScope.assumed_reals.clear();
}

// ------------------------ Main Functions ------------------------

export function setDeclared(scope, name) {
    const lower = String(name).toLowerCase();

    if (isDeclared(scope, name) ||
        Object.prototype.hasOwnProperty.call(consts, lower) ||
        Object.prototype.hasOwnProperty.call(procs,  lower) ||
        Object.prototype.hasOwnProperty.call(funcs,  lower)) {
        const line = lines[currentLineNum - 1]?.text || '';
        const pos = findPos(line, name);
        throwErr('SyntaxError',
                 `name ${name} already declared`,
                 currentLineNum, pos.col, pos.len);
    }

    scope.decl.add(lower);
    scope.case[lower] = String(name);
    scope.init[lower] = false;
}
export function isDeclared( scope, name) {
    const lower = String(name).toLowerCase();

    // walk through enclosing scopes
    for (let s = scope; s; s = Object.getPrototypeOf(s)) {
        if (s.decl && s.decl.has(lower)) return true; // if declared anywhere, return true
    }
    return false;
}

export function getDeclaredScope(scope, name) {
    const lower = String(name).toLowerCase();

    // walk through enclosing scopes
    for (let s = scope; s; s = Object.getPrototypeOf(s)) {
        if (s.decl && s.decl.has(lower)) return s; // if declared anywhere, return scope
    }
}
export function getDeclaredName( scope, name) {
    const lower = String(name).toLowerCase();

    const s = getDeclaredScope(scope, lower);
    if (s && s.case) return s.case[lower];
    else return name; // fallback
}
// a combination of the above with checks
export function getDeclaredScopeName(scope, name, needInit = false, line = lines[currentLineNum - 1].text) {
    // undeclared or uninitialized
    assertDeclared(scope, name, line);
    if (needInit) assertInitialized(scope, name, line);

    // get declared scope and name
    const declaredScope = getDeclaredScope(scope, name) || scope;
    const declaredName  = getDeclaredName( scope, name) || name;

    return [declaredScope, declaredName];
}

export function setInitialized(scope, name) {
    if (!isDeclared(scope, name)) setDeclared(scope, name); // ensure declared
    const lower = String(name).toLowerCase();

    const s = getDeclaredScope(scope, name) || scope;
    s.init[lower] = true;
}
export function isInitialized( scope, name) {
    const lower = String(name).toLowerCase();

    const s = getDeclaredScope(scope, name) || scope;
    return s.init[lower];
}

export function setType(scope, name, type, assumed_real = false) {
    const lower = String(name).toLowerCase();
    scope.types[lower] = String(type).toUpperCase();

    if (assumed_real) scope.assumed_reals?.add   (lower);
    else              scope.assumed_reals?.delete(lower); // if var is declared or assigned real after, no need to assume
}
// was a var's type assumed to be real
export function isAssumedReal(scope, name) {
    const lower = String(name).toLowerCase();

    for (let s = scope; s; s = Object.getPrototypeOf(s)) {
        if (!s.types) continue;
        if (Object.prototype.hasOwnProperty.call(s.types, lower)) return !!s.assumed_reals?.has(lower);
    }
    return false;
}
// get type (what was declared or first initialized)
export function getDeclaredType(scope, name) {
    const lower = String(name).toLowerCase();

    // walk through enclosing scopes
    for (let s = scope; s; s = Object.getPrototypeOf(s)) {
        if (!s.types) continue;
        if (Object.prototype.hasOwnProperty.call(s.types, lower)) return s.types[lower];
    }
}
// get type (checking actual value)
export function getValType(val, valText = '') {
    if (typeof val === 'number') {
        if (/^[+-]?\d+\.\d+$/.test(String(valText).trim())) return 'REAL';
        if (Number.isInteger(val)) return 'INTEGER';
        else                       return 'REAL';
    }
    if (typeof val === 'boolean') return 'BOOLEAN';
    if (typeof val === 'string') {
        //       ' ^'  '
        if (/^\s*'[^']?'\s*$/.test(valText)) return 'CHAR';
        else                                 return 'STRING';
    }
    if (typeof val === 'object' && Array.isArray(val)) return 'ARRAY';
    return '';
}
