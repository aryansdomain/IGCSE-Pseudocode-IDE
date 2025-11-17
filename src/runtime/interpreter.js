async function interpret(code) {

    // ------------------------ Helpers & Runtime ------------------------
    const OUTPUT_LOG = [];
    const CASE_MISMATCH_SEEN = new Set();
    const NAME_KEYWORD_SEEN  = new Set();

    const constants = Object.create(null);
    const globals   = Object.create(null);

    // clear tracking
    CASE_MISMATCH_SEEN.clear();

    const PSC_KEYWORDS = new Set([
        'IF','THEN','ELSE','ENDIF','CASE','OF','OTHERWISE','ENDCASE',
        'FOR','TO','STEP','NEXT','WHILE','DO','ENDWHILE','REPEAT','UNTIL',
        'PROCEDURE','FUNCTION','RETURNS','RETURN','CALL','ENDPROCEDURE','ENDFUNCTION',
        'INPUT','OUTPUT','DECLARE','CONSTANT',
        'TRUE','FALSE','AND','OR','NOT',
        'INTEGER','REAL','BOOLEAN','CHAR','STRING','ARRAY',
        'ROUND','RANDOM','LENGTH','LCASE','UCASE','SUBSTRING','DIV','MOD'
    ]);

    function assertNotKeyword(id) {
        const keyword = String(id).toUpperCase();
        if (PSC_KEYWORDS.has(keyword) && !NAME_KEYWORD_SEEN.has(keyword)) {
            throwWarning(`Warning: "${id}" is a keyword. Do not use keywords as identifiers.`);
            NAME_KEYWORD_SEEN.add(keyword);
        }
    }

    function isLiteral(text){
        const t = String(text ?? '').trim();
        return /^-?\d+$/.test(t)                // INTEGER
            || /^-?\d+\.\d+$/.test(t)           // REAL (digit on both sides)
            || /^'(?:\\.|[^'\\])'$/.test(t)     // CHAR
            || /^"(?:\\.|[^"\\])*"$/.test(t)    // STRING
            || /^(?:TRUE|FALSE)$/i.test(t);     // BOOLEAN
    }
    function assertBoolean(v, ctx){
        if (typeof v !== 'boolean') throwErr('TypeError: ', String(ctx) + ' must be a BOOLEAN', LINE_NUMBER)
        return v;
    }

    function throwWarning(text) {
        if (isWorkerEnv()) try { self.postMessage({ type: 'warning', message: text }); } catch {}
    }
    function throwErr(name = '', message, line) {
        const e = new Error(name + message);
        e.line = line;
        throw e;
    }

    // Worker vs window check: only postMessage in a worker
    function isWorkerEnv() {
        return (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope);
    }

    const procs = Object.create(null);
    const funcs = Object.create(null);

    // track declared identifiers (case-insensitive)
    function ensureDeclSet(scope) {
        if (!Object.prototype.hasOwnProperty.call(scope, '__decl')) {
            Object.defineProperty(scope, '__decl', { value: new Set(), enumerable: false }); // stores lower-case names
        }
        if (!Object.prototype.hasOwnProperty.call(scope, '__case')) {
            Object.defineProperty(scope, '__case', { value: Object.create(null), enumerable: false }); // lower -> canon
        }
        if (!Object.prototype.hasOwnProperty.call(scope, '__init')) {
            Object.defineProperty(scope, '__init', { value: Object.create(null), enumerable: false }); // lower -> bool
        }
    }
    function declareName(scope, name) {
        ensureDeclSet(scope);
        const lower = String(name).toLowerCase();
        scope.__decl.add(lower);
        if (!scope.__case[lower]) scope.__case[lower] = String(name);
        if (!Object.prototype.hasOwnProperty.call(scope.__init, lower)) scope.__init[lower] = false;
    }
    function markInitialized(scope, name) {
        const s = findDeclScope(scope, name) || scope;
        ensureDeclSet(s);
        const lower = String(name).toLowerCase();
        s.__init[lower] = true;
    }
    function isInitialized(scope, name) {
        const s = findDeclScope(scope, name) || scope;
        const lower = String(name).toLowerCase();
        return !!(s.__init && s.__init[lower]);
    }
    function isDeclared(scope, name) {
        const lower = String(name).toLowerCase();
        for (let s = scope; s; s = Object.getPrototypeOf(s)) {
            if (s.__decl && s.__decl.has(lower)) return true;
        }
        return false;
    }
    function findDeclScope(scope, nameLower) {
        const L = String(nameLower).toLowerCase();
        for (let s = scope; s; s = Object.getPrototypeOf(s)) {
            if (s.__decl && s.__decl.has(L)) return s;
        }
        return null;
    }
    function getCanonNameFrom(scope, name) {
        const s = findDeclScope(scope, name);
        if (s && s.__case && s.__case[String(name).toLowerCase()]) return s.__case[String(name).toLowerCase()];
        return String(name);
    }
    function warnCaseMismatch(used, canon) {
        try {
            const usedStr = String(used);
            const canonStr = String(canon);
            if (usedStr === canonStr) return;
            const sig = `${canonStr}|${usedStr}|${LINE_NUMBER}`;
            if (CASE_MISMATCH_SEEN.has(sig)) return;
            CASE_MISMATCH_SEEN.add(sig);

            throwWarning(`Warning: Line ${LINE_NUMBER}: Identifier "${usedStr}" is different in case from declared variable "${canonStr}".`);
        } catch {}
    }

    // ------------------------ Type Tracking ------------------------
    function ensureTypeMap(scope) {
        if (!Object.prototype.hasOwnProperty.call(scope, '__types')) {
            Object.defineProperty(scope, '__types', { value: Object.create(null), enumerable: false });
        }
    }
    function setType(scope, name, type) {
        ensureTypeMap(scope);
        scope.__types[String(name).toLowerCase()] = String(type || '').toUpperCase();
    }
    function getType(scope, name) {
        const N = String(name).toLowerCase();
        for (let s = scope; s; s = Object.getPrototypeOf(s)) {
            if (s.__types && s.__types[N]) return s.__types[N];
        }
        return undefined;
    }

    // destination type helpers
    function getDestTypeForLValue(lv, scope) {
        let t = getType(scope, lv.name);
        if (t && /^ARRAY OF\s+/i.test(t)) t = t.replace(/^ARRAY OF\s+/i, '');
        return String(t || '').toUpperCase();
    }

    function assignChecked(lv, scope, rhsExpr, value, isInput) {
        const destType = getDestTypeForLValue(lv, scope);
        if (!destType) {
            throwErr('NameError: ', 'name ' + String(lv.name) + ' is not defined', LINE_NUMBER)
        }

        if (isInput && typeof value === 'string') {
            const t = destType.toUpperCase();
            const trimmed = value.trim();
            if ((t === 'INTEGER' || t === 'REAL') && /^[+-]?(?:\d+\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
                const n = Number(trimmed);
                if (!Number.isNaN(n) && Number.isFinite(n)) value = n;
            } else if (t === 'BOOLEAN') {
                const up = trimmed.toUpperCase();
                if (up === 'TRUE') value = true;
                else if (up === 'FALSE') value = false;
            } else if (t === 'CHAR' && trimmed.length === 1) {
                value = trimmed;
            }
        }

        checkAssignCompatible(destType, rhsExpr, value, isInput);
        lv.set(value);
    }

    function getValueType(value, rhsExpr) {
        if (typeof value === 'number') {
            if (Number.isInteger(value)) return 'INTEGER';
            return 'REAL';
        }
        if (typeof value === 'boolean') return 'BOOLEAN';
        if (typeof value === 'string') {
            if (rhsExpr && typeof rhsExpr === 'string') {
                if (isSingleQuoted(rhsExpr)) return 'CHAR';
                if (isDoubleQuoted(rhsExpr)) return 'STRING';
            }
            return 'STRING';
        }
        if (typeof value === 'object' && Array.isArray(value)) return 'ARRAY';
        return 'unknown';
    }

    function checkAssignCompatible(destType, rhsExpr, value, isInput) {
        destType = String(destType || '').toUpperCase();
        const hasRhsText = typeof rhsExpr === 'string' && rhsExpr.trim().length > 0;

        switch (destType) {
            case 'INTEGER':
                if (typeof value !== 'number' || !Number.isInteger(value))
                    throwErr('', 'Cannot assign ' + getValueType(value, rhsExpr) + ' value to INTEGER', LINE_NUMBER)
                if (hasRhsText && isReal(rhsExpr))
                    throwErr('', 'Cannot assign REAL value to INTEGER', LINE_NUMBER)
                return;
            case 'REAL':
                if (typeof value !== 'number' || !Number.isFinite(value))
                    throwErr('', 'Cannot assign ' + getValueType(value, rhsExpr) + ' value to REAL', LINE_NUMBER)
                return;
            case 'BOOLEAN':
                if (typeof value !== 'boolean')
                    throwErr('', 'Cannot assign ' + getValueType(value, rhsExpr) + ' value to BOOLEAN', LINE_NUMBER)
                return;
            case 'CHAR':
                if (!isInput && hasRhsText && isDoubleQuoted(rhsExpr))
                    throwErr('SyntaxError: ', 'invalid CHAR literal', LINE_NUMBER)
                if (toString(value).length !== 1)
                    throwErr('ValueError: ', 'CHAR literal must be a single character', LINE_NUMBER)
                return;
            case 'STRING':
                // no check here, anything can be string
                if (!isInput && hasRhsText && isSingleQuoted(rhsExpr))
                    throwErr('SyntaxError: ', 'STRING literal must use double quotes', LINE_NUMBER)
                return;
        }
    }

    // conversion between types
    function toString(v) {
        if (v === true) return "TRUE";
        if (v === false) return "FALSE";
        if (v == null) return "";
        if (typeof v === 'symbol') return v.description ?? v.toString();
        return String(v);
    }

    // type checking
    function isReal(src) {
        return /^\s*[+-]?\d+\.\d+\s*$/.test(src);
    }
    function isSingleQuoted(src) {
        return /^\s*'(?:\\.|[^'\\])*'\s*$/.test(src);
    }
    function isDoubleQuoted(src) {
        return /^\s*"(?:\\.|[^"\\])*"\s*$/.test(src);
    }

    ensureDeclSet(globals);
    ensureTypeMap(globals);

    const LOOP_LIMIT = 1000000;
    const ARRAY_SIZE_LIMIT = 1000000;
    let LINE_NUMBER = 0;

    // output buffer
    function out(values) {
        const s = values.map(v => toString(v)).join("");
        OUTPUT_LOG.push(s);
        // Append per line when running in a Worker; never overwrite prior lines
        if (isWorkerEnv()) {
            try { self.postMessage({ type: 'append', line: s }); } catch {}
        }
    }

    // Render one OUTPUT argument with type-aware formatting when possible.
    function renderForOutput(exprText, value, scope) {
        // variable or array element?
        const varMatch = exprText.match(/^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*\[.*\])?\s*$/);
        if (varMatch) {
            const name = varMatch[1];
            const t = getType(scope, name);
            if (t === 'REAL' && typeof value === 'number') {
                if (Number.isInteger(value)) {
                    return value.toFixed(1);
                } else return String(value);
            }
        }
        return toString(value);
    }

    // parse input value
    function parseInput(raw) {
        const cleaned = String(raw)
            .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
            .replace(/\r/g, '')
            .trim();

        return cleaned;
    }

    function defaultForType(type) {
        const t = type.toUpperCase();
        if (t === 'INTEGER' || t === 'REAL') return 0;
        if (t === 'BOOLEAN') return false;
        if (t === 'CHAR') return ' ';
        if (t === 'STRING') return '';
        return undefined;
    }

    // array utilities
    function makeArray(l1, u1, l2, u2, fill) {
        if (l2 == null) {
            if (!Number.isInteger(l1) || !Number.isInteger(u1)) {
                throwErr('TypeError: ', 'ARRAY bounds must be INTEGERs', LINE_NUMBER)
            }
            if (u1 < l1) {
                throwErr('ValueError: ', 'Invalid ARRAY bounds (upper bound must be >= lower bound)', LINE_NUMBER)
            }
            const len = u1 - l1 + 1;
            if (len < 0 || len > ARRAY_SIZE_LIMIT) {
                throwErr('ValueError: ', `Invalid ARRAY length (${len}). Array length must be between 0 and ${ARRAY_SIZE_LIMIT.toLocaleString()}`, LINE_NUMBER)
            }
            const arr = new Array(len).fill(fill);
            arr.__lb = l1; // store lower bound
            return arr;
        } else {
            if (!Number.isInteger(l1) || !Number.isInteger(u1) || !Number.isInteger(l2) || !Number.isInteger(u2)) {
                throwErr('TypeError: ', 'ARRAY bounds must be INTEGERs', LINE_NUMBER)
            }
            if (u1 < l1 || u2 < l2) {
                throwErr('ValueError: ', 'Invalid ARRAY bounds (upper bound must be >= lower bound)', LINE_NUMBER)
            }
            const rows = u1 - l1 + 1;
            const cols = u2 - l2 + 1;
            if (rows < 0 || cols < 0 || rows * cols > ARRAY_SIZE_LIMIT) {
                throwErr('ValueError: ', `Invalid ARRAY dimensions. Total size must not exceed ${ARRAY_SIZE_LIMIT.toLocaleString()}`, LINE_NUMBER)
            }
            const arr = new Array(rows);
            for (let r = 0; r < rows; r++) {
                arr[r] = new Array(cols).fill(fill);
            }
            arr.__lb1 = l1; arr.__lb2 = l2;
            return arr;
        }
    }

    // get array element
    function arrGet(A, i, j) {
        if (Array.isArray(A)) {
            if (A.__lb != null && j == null) {
                const lowerBound = A.__lb;
                const upperBound = lowerBound + A.length - 1;
                if (i < lowerBound || i > upperBound) {
                    throwErr('IndexError: ', `ARRAY index ${i} out of bounds (${lowerBound} to ${upperBound})`, LINE_NUMBER)
                }
                return A[i - A.__lb];
            }
            if (A.__lb1 != null && A.__lb2 != null && j != null) {
                const lowerBound1 = A.__lb1;
                const upperBound1 = lowerBound1 + A.length - 1;
                const lowerBound2 = A.__lb2;
                const upperBound2 = lowerBound2 + A[0].length - 1;
                if (i < lowerBound1 || i > upperBound1) {
                    throwErr('IndexError: ', `ARRAY index ${i} out of bounds (${lowerBound1} to ${upperBound1})`, LINE_NUMBER)
                }
                if (j < lowerBound2 || j > upperBound2) {
                    throwErr('IndexError: ', `ARRAY index ${j} out of bounds (${lowerBound2} to ${upperBound2})`, LINE_NUMBER)
                }
                return A[i - A.__lb1][j - A.__lb2];
            }
            
            // array exists but wrong dimensions
            if (A.__lb != null && j != null) {
                throwErr('TypeError: ', 'ARRAY indices must be INTEGERs, not tuple', LINE_NUMBER)
            }
            if (A.__lb1 != null && A.__lb2 != null && j == null) {
                throwErr('TypeError: ', 'too few indices for ARRAY', LINE_NUMBER)
            }
        }
        throwErr('TypeError: ', 'object is not subscriptable', LINE_NUMBER)
    }

    // set array element
    function arrSet(A, i, j, v) {
        if (Array.isArray(A)) {
            if (A.__lb != null && j == null) {
                const lowerBound = A.__lb;
                const upperBound = lowerBound + A.length - 1;
                if (i < lowerBound || i > upperBound) {
                    throwErr('IndexError: ', `ARRAY index ${i} out of bounds (${lowerBound} to ${upperBound})`, LINE_NUMBER)
                }
                A[i - A.__lb] = v; return;
            }
            if (A.__lb1 != null && A.__lb2 != null && j != null) {
                const lowerBound1 = A.__lb1;
                const upperBound1 = lowerBound1 + A.length - 1;
                const lowerBound2 = A.__lb2;
                const upperBound2 = lowerBound2 + A[0].length - 1;
                if (i < lowerBound1 || i > upperBound1) {
                    throwErr('IndexError: ', `ARRAY index ${i} out of bounds (${lowerBound1} to ${upperBound1})`, LINE_NUMBER)
                }
                if (j < lowerBound2 || j > upperBound2) {
                    throwErr('IndexError: ', `ARRAY index ${j} out of bounds (${lowerBound2} to ${upperBound2})`, LINE_NUMBER)
                }
                A[i - A.__lb1][j - A.__lb2] = v; return;
            }
            
            // array exists but wrong dimensions
            if (A.__lb != null && j != null) {
                throwErr('TypeError: ', 'ARRAY assignment index must be INTEGER, not tuple', LINE_NUMBER)
            }
            if (A.__lb1 != null && A.__lb2 != null && j == null) {
                throwErr('TypeError: ', 'too few indices for ARRAY assignment', LINE_NUMBER)
            }
        }
        throwErr('TypeError: ', 'object does not support item assignment', LINE_NUMBER)
    }

    // builtin functions
    function assertNumber(n, name) {
        if (typeof n !== 'number' || !Number.isFinite(n)) {
            throwErr('TypeError: ', String(name) + ' must be a number', LINE_NUMBER)
        }
    }
    function assertInteger(n, name) {
        assertNumber(n, name);
        if (!Number.isInteger(n)) {
            throwErr('TypeError: ', String(name) + ' must be an INTEGER', LINE_NUMBER)
        }
    }
    function assertString(n, name) {
        if (typeof n !== 'string') {
            throwErr('TypeError: ', String(name) + ' must be a STRING', LINE_NUMBER)
        }
        return n;
    }
    function assertType(type, line) {
        const validTypes = ['INTEGER', 'REAL', 'BOOLEAN', 'CHAR', 'STRING'];
        if (!validTypes.includes(type.toUpperCase())) {
            throwErr('TypeError: ', 'invalid type ' + String(type), line);
        }
    }
      
    const builtins = {
        RANDOM: () => {
            const M = Number.MAX_SAFE_INTEGER
            return Math.floor(Math.random() * (M + 1)) / M; // allows 0 and 1
        },
        
        ROUND: (x, places) => {
            assertNumber(x, 'ROUND() parameter');
            assertInteger(places, 'ROUND(places)');
            const p = Math.max(0, places | 0);
            const f = Math.pow(10, p);
            return Math.round(x * f) / f;
        },
        
        LENGTH: (s) => toString(s).length,
        
        LCASE: (x) => toString(x).toLowerCase(),
        UCASE: (x) => toString(x).toUpperCase(),
        
        SUBSTRING: (s, start, len) => {
            const str = toString(s);
            assertInteger(start, 'SUBSTRING start');
            assertInteger(len, 'SUBSTRING length');
            if (start <= 0) throwErr('ValueError: ', 'SUBSTRING start must be positive', LINE_NUMBER)
            if (len <= 0)   throwErr('ValueError: ', 'SUBSTRING length must be positive', LINE_NUMBER)
            const st = start;
            const ln = len;

            return str.substring(st - 1, st - 1 + ln);
        },
        
        INTDIV: (a, b) => {
            assertInteger(a, 'DIV first argument');
            assertInteger(b, 'DIV second argument');
            if (b === 0) throwErr('ZeroDivisionError: ', 'division by zero', LINE_NUMBER)
            return (a / b) >= 0 ? Math.floor(a / b) : Math.ceil(a / b);
        },
        
        MOD: (a, b) => {
            assertInteger(a, 'MOD first argument');
            assertInteger(b, 'MOD second argument');
            if (b === 0) throwErr('ZeroDivisionError: ', 'division by zero', LINE_NUMBER)
            const m = a % b;
            return m < 0 ? m + Math.abs(b) : m;
        },
        
    };

    // Helper function to check if an expression is numeric
    function isNumericExpr(text) {
        const t = text.trim();
        // Protected string/char literals must NOT be treated as numeric
        if (/^\uE000\d+\uE001$/.test(t)) return false;
        // Numeric literal
        if (/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(t)) return true;
        // Anything starting with a quote would have been protected already
        if (/^['"]/.test(t)) return false;
        // Variables/func calls (unchecked here)
        return true;
    }

    // handle ^ replacement
    function replacePowerOperators(expr) {
        const START = '\uE000';   // protected literal start
        const END   = '\uE001';   // protected literal end
        const isIdChar = (c) => /[A-Za-z0-9_.]/.test(c);
    
        function grabLeft(s, caretIdx) {
            let i = caretIdx - 1;
            while (i >= 0 && s[i] === ' ') i--;
        
            // protected literal to the left
            if (s[i] === END) {
                let j = i - 1;
                while (j >= 0 && s[j] !== START) j--;
                const start = Math.max(0, j);
                return { start, text: s.slice(start, caretIdx).trim() };
            }
        
            if (s[i] === ')') {
                let depth = 1; i--;
                while (i >= 0 && depth > 0) { if (s[i] === ')') depth++; else if (s[i] === '(') depth--; i--; }
                return { start: i + 1, text: s.slice(i + 1, caretIdx).trim() };
            }
            if (s[i] === ']') {
                let depth = 1; i--;
                while (i >= 0 && depth > 0) { if (s[i] === ']') depth++; else if (s[i] === '[') depth--; i--; }
                return { start: i + 1, text: s.slice(i + 1, caretIdx).trim() };
            }
        
            // identifier / number (scan token chars)
            while (i >= 0 && isIdChar(s[i])) i--;
            // include a unary sign if present
            if (i >= 0 && (s[i] === '+' || s[i] === '-') && (i === 0 || /\s|\(|\[/.test(s[i-1]))) i--;
            return { start: i + 1, text: s.slice(i + 1, caretIdx).trim() };
        }
    
        function grabRight(s, caretIdx) {
            let i = caretIdx + 1;
            while (i < s.length && s[i] === ' ') i++;
            const start = i;
        
            // protected literal to the right
            if (s[i] === START) {
                let j = i + 1;
                while (j < s.length && s[j] !== END) j++;
                j = Math.min(s.length, j + 1);
                return { end: j, text: s.slice(start, j).trim() };
            }
        
            if (s[i] === '(') {
                let depth = 1; i++;
                while (i < s.length && depth > 0) { if (s[i] === '(') depth++; else if (s[i] === ')') depth--; i++; }
                return { end: i, text: s.slice(start, i).trim() };
            }
            if (s[i] === '[') {
                let depth = 1; i++;
                while (i < s.length && depth > 0) { if (s[i] === '[') depth++; else if (s[i] === ']') depth--; i++; }
                return { end: i, text: s.slice(start, i).trim() };
            }
        
            // include optional unary sign
            if (s[i] === '+' || s[i] === '-') i++;
            while (i < s.length && isIdChar(s[i])) i++;
        
            // allow a following () for function calls as a single token (e.g., f(x)^2)
            if (i < s.length && s[i] === '(') {
                let depth = 1; i++;
                while (i < s.length && depth > 0) { if (s[i] === '(') depth++; else if (s[i] === ')') depth--; i++; }
            }
            return { end: i, text: s.slice(start, i).trim() };
        }
    
        // Right-associative: scan right-to-left
        let s = expr;
        let idx = s.lastIndexOf('^');
        while (idx !== -1) {
            const L = grabLeft(s, idx);
            const R = grabRight(s, idx);
        
            if (!isNumericExpr(L.text) || !isNumericExpr(R.text)) {
                throw new Error('Power operator ^ requires numeric operands', LINE_NUMBER);
            }
        
            const before = s.slice(0, L.start);
            const after  = s.slice(R.end);
            s = `${before}Math.pow(${L.text}, ${R.text})${after}`;
            idx = s.lastIndexOf('^');
        }
        return s;
    }

    // numeric operations
    function num(x, ctx) {
        if (typeof x !== 'number' || !Number.isFinite(x)) throwErr('TypeError: ', String(ctx) + ' requires a finite number', LINE_NUMBER)
        return x;
    }
    const NUM = {
        ADD: (a,b) => {
            // if either is a string then concatenate
            if (typeof a === 'string' || typeof b === 'string') {
                return toString(a) + toString(b);
            }
            // otherwise add
            return num(a,'+ operation') + num(b,'+ operation');
        },
        SUB: (a,b) => num(a,'- operation') - num(b,'- operation'),
        MUL: (a,b) => num(a,'* operation') * num(b,'* operation'),
        DIV: (a,b) => {
            a = num(a,'/ operation');
            b = num(b,'/ operation');
            if (b === 0) throwErr('ZeroDivisionError: ', 'division by zero', LINE_NUMBER)
            return a/b;
        }
    };

    // comparison helpers enforcing type rules
    const CMP = {
        EQ(a, b) {
            if (typeof a === 'boolean' || typeof b === 'boolean') return (!!a) === (!!b); // bool
            if (typeof a !== typeof b) // different types
                throwErr('TypeError: ', `cannot compare ${typeName(a)} with ${typeName(b)}`, LINE_NUMBER);
            return a === b; // otherwise
        },
        NE(a, b) {
            if (typeof a === 'boolean' || typeof b === 'boolean') return (!!a) !== (!!b);
            if (typeof a !== typeof b)
                throwErr('TypeError: ', `cannot compare ${typeName(a)} with ${typeName(b)}`, LINE_NUMBER)
            return a !== b;
        },
        LT(a, b) {
            if (typeof a !== typeof b)
                throwErr('TypeError: ', `cannot compare ${typeName(a)} with ${typeName(b)}`, LINE_NUMBER)
            if (typeof a === 'number' || typeof a === 'string') return a < b;
            throwErr('TypeError: ', 'relational comparison requires numbers or strings', LINE_NUMBER)
        },
        GT(a, b) {
            if (typeof a !== typeof b)
                throwErr('TypeError: ', `cannot compare ${typeName(a)} with ${typeName(b)}`, LINE_NUMBER)
            if (typeof a === 'number' || typeof a === 'string') return a > b;
            throwErr('TypeError: ', 'relational comparison requires numbers or strings', LINE_NUMBER)
        },
        LE(a, b) {
            if (typeof a !== typeof b)
                throwErr('TypeError: ', `cannot compare ${typeName(a)} with ${typeName(b)}`, LINE_NUMBER)
            if (typeof a === 'number' || typeof a === 'string') return a <= b;
            throwErr('TypeError: ', 'relational comparison requires numbers or strings', LINE_NUMBER)
        },
        GE(a, b) {
            if (typeof a !== typeof b)
                throwErr('TypeError: ', `cannot compare ${typeName(a)} with ${typeName(b)}`, LINE_NUMBER)
            if (typeof a === 'number' || typeof a === 'string') return a >= b;
            throwErr('TypeError: ', 'relational comparison requires numbers or strings', LINE_NUMBER)
        },
    };

    function typeName(v){
        if (typeof v === 'number') return Number.isInteger(v) ? 'INTEGER' : 'REAL';
        if (typeof v === 'boolean') return 'BOOLEAN';
        if (typeof v === 'string')  return 'STRING';
        if (Array.isArray(v))       return 'ARRAY';
        return 'UNKNOWN';
    }

    // ------------------------ Expression Evaluation ------------------------
    async function evalExpr(expr, scope) {

        if (typeof window !== 'undefined' && window.__ide_stop_flag) {
            throw new Error('Code execution stopped by user');
        }

        if (expr == null) return undefined;
        let s = String(expr).trim();

        // ------------------------ Replace Pseudocode with JS Tokens ------------------------

        // console.log("s before everything: ", s);

        // string and char literals
        const lit = [];
        s = s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, m => { lit.push(m); return `\uE000${lit.length-1}\uE001`; });

        // replace , with + (outside brackets and parens)
        function replaceCommasWithConcat(src) {
            let result = '';
            let depth = 0;
            let bracketDepth = 0;
            let i = 0;
            
            while (i < src.length) {
                const char = src[i];
                
                if (char === '(') depth++;
                else if (char === ')') depth--;
                else if (char === '[') bracketDepth++;
                else if (char === ']') bracketDepth--;
                
                // replace comma with +
                if (char === ',' && depth === 0 && bracketDepth === 0) result += '+';
                else result += char;
                i++;
            }
            return result;
        }
        s = replaceCommasWithConcat(s);

        if (/\bDIV\b(?!\s*\()/i.test(s) || /\bMOD\b(?!\s*\()/i.test(s)) {
            throwErr('SyntaxError: ', 'invalid syntax', LINE_NUMBER);
        }

        // bools
        s = s.replace(/\bTRUE\b/gi,  'true')
        s = s.replace(/\bFALSE\b/gi, 'false');

        // logical operators
        s = s.replace(/\bAND\b/gi, '&&')
        s = s.replace(/\bOR\b/gi,  '||')
        s = s.replace(/\bNOT\b/gi, '!');

        // not-equal
        s = s.replace(/<>/g, '!==');

        // power
        s = replacePowerOperators(s);

        // arithmetic operations
        s = replaceBinarySymbolOperator(s, '*', '__NUM.MUL');
        s = replaceBinarySymbolOperator(s, '/', '__NUM.DIV');
        s = replaceBinarySymbolOperator(s, '+', '__NUM.ADD');
        s = replaceBinarySymbolOperator(s, '-', '__NUM.SUB');

        // comparison
        s = s.replace(/(?<![<>!=])=/g,'==='); // replace = with ===, save >=, <=, and !==

        function replaceBinarySymbolOperator(src, symbol, callee) {

            const isIdChar = (c) => /[A-Za-z0-9_.]/.test(c);
          
            function prevNonSpace(str, i) {
                let j = i - 1;
                while (j >= 0 && str[j] === ' ') j--;
                return j >= 0 ? str[j] : null;
            }
            function isUnaryAt(str, idx) {
                // only matters for + and -
                if (symbol !== '+' && symbol !== '-') return false;
                const p = prevNonSpace(str, idx);
                // unary if at start, or after another operator / open delimiter / comma
                return (
                    idx === 0 ||
                    p == null ||
                    /[+\-*/^(<\[,=!:]/.test(p)
                );
            }
          
            function grabLeft(str, opStart) {
                let i = opStart - 1;
                while (i >= 0 && str[i] === ' ') i--;
                if (str[i] === '\uE001') {                 // protected literal
                    let j = i - 1; while (j >= 0 && str[j] !== '\uE000') j--;
                    const start = Math.max(0, j);
                    return { start, text: str.slice(start, opStart).trim() };
                }
                if (str[i] === ')') {                      // (...) group
                    let depth = 1; i--;
                    while (i >= 0 && depth > 0) { if (str[i] === ')') depth++; else if (str[i] === '(') depth--; i--; }
                    // include possible function/identifier before the '('
                    let j = i; while (j >= 0 && /[A-Za-z0-9_.]/.test(str[j])) j--;
                    const start = j + 1;
                    return { start, text: str.slice(start, opStart).trim() };
                }
                if (str[i] === ']') {                      // [...] indexer
                    let depth = 1; i--;
                    while (i >= 0 && depth > 0) { if (str[i] === ']') depth++; else if (str[i] === '[') depth--; i--; }
                    let j = i; while (j >= 0 && /[A-Za-z0-9_.]/.test(str[j])) j--;
                    const start = j + 1;
                    return { start, text: str.slice(start, opStart).trim() };
                }
                // identifier/number
                while (i >= 0 && isIdChar(str[i])) i--;
                // DO NOT consume a unary sign here — that caused empty LHS
                const start = i + 1;
                return { start, text: str.slice(start, opStart).trim() };
            }
            function grabRight(str, opEnd) {
                let i = opEnd + 1;
                while (i < str.length && str[i] === ' ') i++;
                const start = i;
            
                if (str[i] === '\uE000') {                 // protected literal
                    let j = i + 1; while (j < str.length && str[j] !== '\uE001') j++;
                    j = Math.min(str.length, j + 1);
                    return { end: j, text: str.slice(start, j).trim() };
                }
            
                // optional unary +/-
                if (str[i] === '+' || str[i] === '-') i++;
            
                // identifier / number
                while (i < str.length && isIdChar(str[i])) i++;
            
                // possible function call (...) immediately after identifier
                if (i < str.length && str[i] === '(') {
                    let depth = 1; i++;
                    while (i < str.length && depth > 0) { if (str[i] === '(') depth++; else if (str[i] === ')') depth--; i++; }
                }
            
                // possible indexers [...] chained
                while (i < str.length && str[i] === '[') {
                    let depth = 1; i++;
                    while (i < str.length && depth > 0) { if (str[i] === '[') depth++; else if (str[i] === ']') depth--; i++; }
                }
            
                return { end: i, text: str.slice(start, i).trim() };
            }
          
            let out = src;
            let idx = out.indexOf(symbol);
            while (idx !== -1) {
                // Skip unary +/-
                if (isUnaryAt(out, idx)) { idx = out.indexOf(symbol, idx + 1); continue; }
            
                const left  = grabLeft(out, idx);
                const right = grabRight(out, idx + symbol.length - 1);
            
                // If either side is empty, it's not a valid binary op — skip
                if (!left.text || !right.text) { idx = out.indexOf(symbol, idx + 1); continue; }
            
                out = out.slice(0, left.start) + `${callee}(${left.text}, ${right.text})` + out.slice(right.end);
                idx = out.indexOf(symbol, left.start + callee.length + 1); // continue after the replacement
            }
            return out;
        }

        s = replaceBinarySymbolOperator(s, '!==', '__CMP.NE');
        s = replaceBinarySymbolOperator(s, '===', '__CMP.EQ');
        s = replaceBinarySymbolOperator(s, '<=',  '__CMP.LE');
        s = replaceBinarySymbolOperator(s, '>=',  '__CMP.GE');
        s = replaceBinarySymbolOperator(s, '<',   '__CMP.LT');
        s = replaceBinarySymbolOperator(s, '>',   '__CMP.GT');

        // arrays A[i] / A[i,j]
        s = s.replace(/\b([A-Za-z][A-Za-z0-9_]*)\s*\[\s*([^\]\[]+?)\s*(?:,\s*([^\]\[]+?)\s*)?\]/g,
            (m, name, i1, i2) => `__AG("${name}", ${i1}${i2 ? `, ${i2}` : ''})`);

        // calls: builtins vs user functions
        s = s.replace(/\b([A-Za-z][A-Za-z0-9_]*)\s*\(/g, (m, name, off, str) => {
            if (off > 0 && str.slice(off - 4, off) === 'Math') return m;
            if (off > 0 && str[off-1] === '.') return m;

            let U = name.toUpperCase();
            if (U === 'TRUE' || U === 'FALSE') return m;
            if (U === 'DIV') U = 'INTDIV';

            if (builtins[U]) return `__BUILTIN_${U}(`;

            return `await __CALL('${name}',`;
        });

        // replace var names that conflict with keywords
        s = s.replace(
            /\b([A-Za-z][A-Za-z0-9_]*)\b/g,
            (match, name, off, str) => {

                // skip member/property names (__NUM.DIV)
                if (off > 0 && str[off - 1] === '.') return match;
                // skip things starting with '__' (__CALL, __NUM)
                if (off >= 2 && str[off - 2] + str[off - 1] === '__') return match;

                const JS_KEYWORDS = ['VAR', 'LET', 'CONST', 'SWITCH', 'DEFAULT', 'BREAK', 'CONTINUE', 'TRY', 'CATCH', 'FINALLY', 'THROW', 'NEW', 'DELETE', 'IN', 'INSTANCEOF', 'TYPEOF', 'VOID', 'CLASS', 'SUPER', 'THIS', 'YIELD', 'IMPORT', 'EXPORT', 'ENUM'];

                if (JS_KEYWORDS.includes(name.toUpperCase())) return `__SCOPE["${name}"]`;

                const up = name.toUpperCase();
                if (up === 'TRUE' || up === 'FALSE') return match; // already boolean

                if ([...PSC_KEYWORDS].some(k => k.toUpperCase() === up)) {
                    const key = name.toUpperCase();
                    if (!NAME_KEYWORD_SEEN.has(key)) {
                        throwWarning(`Warning: Variable "${name}" is the same as a keyword; please rename it.`);
                        NAME_KEYWORD_SEEN.add(key);
                    }
                    return `__SCOPE["${name}"]`;
                }
                return match;

            }
        );

        // unprotect literals
        s = s.replace(/\uE000(\d+)\uE001/g, (_, i) => lit[+i]);

        // console.log("s after everything: ", s);

        const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;

        const SAFE_GLOBALS = new Set(['Math']); // allow Math.pow

        const scopeProxy = new Proxy(scope, {
            has: (o, k) => {
                if (typeof k !== 'string')      return false;         // let real global handle symbols
                if (SAFE_GLOBALS.has(k))        return false;         // fall through to real global
                if (IDENT.test(k))              return true;          // force our getter to run
                return (k in o);
            },
            get: (o, k) => {
                if (typeof k !== 'string') return o[k];          // pass symbols through
                if (IDENT.test(k)) {
                    if (!isDeclared(o, k)) throwErr('NameError: ', 'name ' + String(k) + ' is not defined', LINE_NUMBER)
                    const declScope = findDeclScope(o, k) || o;
                    const canon = getCanonNameFrom(o, k);
                    warnCaseMismatch(k, canon);
                    if (!isInitialized(o, k)) {
                        throwErr('NameError: ', 'name ' + String(canon) + ' is referenced before initialization', LINE_NUMBER)
                    }
                    return declScope[canon];
                }
                return o[k];
            }
        });

        const fn = Function(
            '__SCOPE', '__INTDIV', '__MOD', '__CALL', '__AG', '__NUM', '__CMP',
            ...Object.keys(builtins).map(k => `__BUILTIN_${k}`),
            `return (async function(){ with (__SCOPE) { return (${s}); } }).call(this);`
        );

        try {
            const builtinFns = Object.keys(builtins).map(k => builtins[k]);
            return await fn(
                scopeProxy,
                builtins.INTDIV,
                builtins.MOD,
                async (name, ...args) => {
                    const nameLC = String(name).toLowerCase();
                    const def = funcs[nameLC];
                    if (!def) throwErr('NameError: ', 'name ' + String(name) + ' is not defined', 0 || LINE_NUMBER)
                    if (def.__canon && def.__canon !== name) warnCaseMismatch(name, def.__canon);
                    const scope = Object.create(globals);
                    ensureDeclSet(scope);
                    ensureTypeMap(scope);
                    bindParams(def.params, args, scope);
                    let ret;
                    try {
                        await runBlock(def.body, scope, 1, true);
                        ret = undefined;
                    } catch (e) {
                        if (e && e.__return) ret = e.value;
                        else throw e;
                    }
                    if (def.returns) {
                        const want = String(def.returns || '').toUpperCase();
                        if (want) checkAssignCompatible(want, '', ret, false);
                    }
                    return ret;
                },
                (name, ...idx) => {
                    if (!isDeclared(scope, name)) {
                        const e = new Error('Undeclared array ' + name);
                        e.line = LINE_NUMBER;
                        throw e;
                    }
                    const declScope = findDeclScope(scope, name) || scope;
                    const canon = getCanonNameFrom(scope, name);
                    warnCaseMismatch(name, canon);
                    return arrGet(declScope[canon], ...idx);
                },
                NUM,
                CMP,
                ...builtinFns
            );
        } catch (e) {
            const msg = String(e && e.message || e);
            const m = msg.match(/(^|')([A-Za-z][A-Za-z0-9_]*) is not defined/);
            if (m) {
                throwErr('NameError: ', 'name ' + String(m[2]) + ' is not defined', LINE_NUMBER)
            }
            throw e;
        }
    }

    async function getLValue(ref, scope) {

        // ref is identifier, or identifier[index], or identifier[i,j]\
        const m = ref.match(/^([A-Za-z][A-Za-z0-9_]*)(\s*\[(.*)\])?$/);
        if (!m) {
            throwErr('SyntaxError: ', 'invalid identifier ' + String(ref), LINE_NUMBER)
        }
        const name = m[1]

        if (m[2]) {

            // check if array is declared
            if (!isDeclared(scope, name)) {
                throwErr('NameError: ', 'name ' + String(name) + ' is not defined', LINE_NUMBER)
            }
            const declScope = findDeclScope(scope, name) || scope;
            const canon = getCanonNameFrom(scope, name);
            warnCaseMismatch(name, canon);
            
            const idxRaw = m[3];

            // split by comma
            const parts = splitArgs(idxRaw);
            const i = await evalExpr(parts[0], scope);
            const j = parts[1] != null ? await evalExpr(parts[1], scope) : undefined;
            return {
                name: canon,
                get: () => {
                    if (!isInitialized(scope, name)) {
                        throwErr('NameError: ', 'name ' + String(canon) + ' is referenced before initialization', LINE_NUMBER)
                    }
                    return arrGet(declScope[canon], i, j);
                },
                set: (v) => {
                    // check type
                    const tKey = String(canon).toLowerCase();
                    if (declScope.__types && declScope.__types[tKey]) {
                        const arrayType = declScope.__types[tKey];
                        if (arrayType.startsWith('ARRAY OF ')) {
                            const elementType = arrayType.substring(9); // remove "ARRAY OF "
                            checkAssignCompatible(elementType, '', v, false);
                        }
                    }
                    arrSet(declScope[canon], i, j, v);
                    markInitialized(scope, name);
                }
            };
        } else {
            const declScope = findDeclScope(scope, name) || scope;
            const canon = getCanonNameFrom(scope, name);
            warnCaseMismatch(name, canon);
            return {
                name: canon,
                get: () => {
                    if (!isDeclared(scope, name)) {
                        throwErr('NameError: ', 'name ' + String(name) + ' is not defined', LINE_NUMBER)
                    }
                    if (!isInitialized(scope, name)) {
                        throwErr('NameError: ', 'name ' + String(canon) + ' is referenced before initialization', LINE_NUMBER)
                    }
                    return declScope[canon];
                },
                set: (v) => {
                    const lower = String(canon).toLowerCase();
                    if (Object.prototype.hasOwnProperty.call(constants, lower)) throwErr('TypeError: ', 'cannot assign to constant', LINE_NUMBER)
                    if (!isDeclared(scope, name)) throwErr('NameError: ', 'name ' + String(name) + ' is not defined', LINE_NUMBER)
                    declScope[canon] = v;
                    markInitialized(scope, name);
                }
            };
        }
    }

    function splitArgs(argStr) {
        const res = [];
        let depth = 0, cur = '', inStr = false, quote = '';
        for (let i = 0; i < argStr.length; i++) {
            const ch = argStr[i];
            if (inStr) {
                cur += ch;
                if (ch === quote && argStr[i - 1] !== '\\') inStr = false;
                continue;
            }
            if (ch === '"' || ch === '\'') {
                inStr = true;
                quote = ch;
                cur += ch;
                continue;
            }
            if (ch === '(' || ch === '[') {
                depth++;
                cur += ch;
                continue;
            }
            if (ch === ')' || ch === ']') {
                depth--; 
                cur += ch;
                continue;
            }
            if (ch === ',' && depth === 0) {
                res.push(cur.trim());
                cur = '';
                continue;
            }
            cur += ch;
        }
        if (cur.trim() !== '') res.push(cur.trim());
        return res;
    }

    // ------------------------ Parser (block-oriented) ------------------------
    const lines = code.split(/\r?\n/);

    // remove comments
    function cleanLine(s) {
        if (typeof s !== 'string') s = String(s ?? '');
        return s.replace(/\/\/.*$/, '').trim();
    }

    // first pass: extract procedures/functions and store their bodies
    function extractDefs(lines) {
        const main = [];

        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const s = cleanLine(raw);
            if (!s) continue;
            
            let m;

            if ((m = s.match(/^PROCEDURE\s+([A-Za-z][A-Za-z0-9_]*)\s*\((.*)\)\s*$/i)) || (m = s.match(/^PROCEDURE\s+([A-Za-z][A-Za-z0-9_]*)\s*$/i))) {
                const name = m[1];
                const params = (m[2] || '').trim();
                const { block, next } = collectUntil(lines, i + 1, /^(ENDPROCEDURE)\b/i);
                procs[String(name).toLowerCase()] = { __canon: name, params, body: block };
                i = next; continue;
            }
            if ((m = s.match(/^FUNCTION\s+([A-Za-z][A-Za-z0-9_]*)\s*\((.*)\)\s*RETURNS\s+([A-Za-z]+)\s*$/i)) || (m = s.match(/^FUNCTION\s+([A-Za-z][A-Za-z0-9_]*)\s*RETURNS\s+([A-Za-z]+)\s*$/i))) {
                const name = m[1];
                const params = m[3] ? (m[2] && !/RETURNS/i.test(m[2]) ? m[2] : '') : '';
                const returns = (m[3] || m[2] || '').trim();
                
                // validate return type
                assertType(returns, i + 1);
                
                const { block, next } = collectUntil(lines, i + 1, /^(ENDFUNCTION)\b/i);
                funcs[String(name).toLowerCase()] = { __canon: name, params, returns, body: block };
                i = next; continue;
            }

            sawMain = true;
            main.push({ line: i + 1, content: raw });
        }
        return main;
    }

    // collects a block of lines until endRegex found
    function collectUntil(lines, startIndex, endRegex, originalLine = null) {
        const block = [];
        let i = startIndex;
        let found = false;
        for (; i < lines.length; i++) {
            const raw  = lines[i];
            const text = (typeof raw === 'object') ? raw.content : raw;
            const s    = cleanLine(text);
            if (s && endRegex.test(s)) { 
                found = true; 
                break; 
            }
            const lineNum = (typeof raw === 'object') ? raw.line : (i + 1);
            block.push({ line: lineNum, content: (typeof raw === 'object') ? raw.content : raw });
        }
        
        // no closing statement found
        if (!found) {
            let startMessage = 'opening statement';
            let endMessage = 'closing statement';
            if (endRegex.source.includes('ENDIF')) {
                startMessage = 'IF';
                endMessage = 'ENDIF';
            } else if (endRegex.source.includes('ENDWHILE')) {
                startMessage = 'WHILE';
                endMessage = 'ENDWHILE';
            } else if (endRegex.source.includes('ENDCASE')) {
                startMessage = 'CASE';
                endMessage = 'ENDCASE';
            } else if (endRegex.source.includes('NEXT')) {
                startMessage = 'FOR';
                endMessage = 'NEXT';
            } else if (endRegex.source.includes('UNTIL')) {
                startMessage = 'REPEAT';
                endMessage = 'UNTIL';
            } else if (endRegex.source.includes('ENDPROCEDURE')) {
                startMessage = 'PROCEDURE';
                endMessage = 'ENDPROCEDURE';
            } else if (endRegex.source.includes('ENDFUNCTION')) {
                startMessage = 'FUNCTION';
                endMessage = 'ENDFUNCTION';
            }
            const lineNumber = originalLine || startIndex;
            throwErr(`Missing ${endMessage} for ${startMessage} starting at line `, lineNumber);
        }
        return { block, next: i };
    }    

    const mainLines = extractDefs(lines);

    // executes a block of code
    async function runBlock(blockLines, scope, startLineNumber = 1, allowReturn = false) {
        let m;
        for (let i = 0; i < blockLines.length; i++) {
            // Check for stop flag
            if (typeof window !== 'undefined' && window.__ide_stop_flag) {
                throw new Error('Code execution stopped by user');
            }
            
            const raw = blockLines[i];
            const currentLine = typeof raw === 'object' ? raw.line : (startLineNumber + i);
            LINE_NUMBER = currentLine;
            const content = typeof raw === 'object' ? raw.content : raw;
            const s = cleanLine(content);
            if (!s) continue;

            // ARRAY declare: DECLARE A : ARRAY[1:10] OF INTEGER  or  DECLARE M : ARRAY[1:3, 1:3] OF CHAR
            if ((m = s.match(/^DECLARE\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*ARRAY\s*\[([^\]]+)\]\s*OF\s*([A-Za-z]+)\s*$/i))) {
                const name = m[1];
                assertNotKeyword(name);

                const dims = m[2].split(',').map(x => x.trim());
                const type = m[3];

                if (dims.length === 1) {
                    const bounds = dims[0].split(':');
                    const l = await evalExpr(bounds[0].trim(), scope);
                    const u = await evalExpr(bounds[1].trim(), scope);
                    const canon = getCanonNameFrom(scope, name);
                    (findDeclScope(scope, name) || scope)[canon] = makeArray(l, u, null, null, defaultForType(type));
                } else {
                    const bounds1 = dims[0].split(':');
                    const bounds2 = dims[1].split(':');
                    const l1 = await evalExpr(bounds1[0].trim(), scope);
                    const u1 = await evalExpr(bounds1[1].trim(), scope);
                    const l2 = await evalExpr(bounds2[0].trim(), scope);
                    const u2 = await evalExpr(bounds2[1].trim(), scope);
                    const canon = getCanonNameFrom(scope, name);
                    (findDeclScope(scope, name) || scope)[canon] = makeArray(l1, u1, l2, u2, defaultForType(type));
                }
                declareName(scope, name);
                setType(scope, name, `ARRAY OF ${type}`);
                continue;
            }

            // CALL a PROCEDURE
            if ((m = s.match(/^CALL\s+([A-Za-z][A-Za-z0-9_]*)\s*\((.*)\)\s*$/i)) || (m = s.match(/^CALL\s+([A-Za-z][A-Za-z0-9_]*)\s*$/i))) {
                const name = m[1];
                const args = await Promise.all((m[2] ? splitArgs(m[2]) : []).map(a => evalExpr(a, scope)));

                // call the procedure
                const def = procs[String(name).toLowerCase()];
                if (!def) throwErr('NameError: ', 'name ' + String(name) + ' is not defined', currentLine || LINE_NUMBER)
                if (def.__canon && def.__canon !== name) warnCaseMismatch(name, def.__canon);
                const procScope = Object.create(globals);
                ensureDeclSet(procScope);
                ensureTypeMap(procScope);
                bindParams(def.params, args, procScope);
                await runBlock(def.body, procScope, 1, false);
                
                continue;
            }

            // IF ... THEN ... (single-line form)
            if ((m = s.match(/^IF\s+(.+)\s+THEN\s*$/i))) {
                const condExpr = m[1];
                
                // collect THEN..ENDIF (like the existing two-line logic)
                const thenBlock = [];
                const elseBlock = [];
                let inElse = false, depth = 0;
                let k;
                for (k = i + 1; k < blockLines.length; k++) {
                    const rawK = blockLines[k];
                    const txt  = (typeof rawK === 'object') ? rawK.content : rawK;
                    const c    = cleanLine(txt);
                    if (!c) { (inElse ? elseBlock : thenBlock).push(rawK); continue; }

                    if (/^IF\b/i.test(c) && !/\bTHEN\b/i.test(c)) { depth++; (inElse ? elseBlock : thenBlock).push(rawK); continue; }
                    if (/^ENDIF\b/i.test(c)) { if (depth>0){ depth--; (inElse?elseBlock:thenBlock).push(rawK); continue; } break; }
                    if (/^ELSE\b/i.test(c) && depth===0) { inElse = true; continue; }

                    (inElse ? elseBlock : thenBlock).push(rawK);
                }
                if (k >= blockLines.length) { const e = new Error(`Missing ENDIF for IF`); e.line=currentLine; throw e; }
                i = k;
                if (assertBoolean(await evalExpr(condExpr, scope), 'IF condition')) await runBlock(thenBlock, scope, undefined, allowReturn);
                else await runBlock(elseBlock, scope, undefined, allowReturn);
                continue;
            }

            // IF ... (two-line form: THEN on its own line) with nesting support
            if (/^IF\b/i.test(s) && !/\bTHEN\b/i.test(s)) { // line contains IF but no THEN
                const condExpr = s.replace(/^IF\s+/i, '').trim();

                // Find the standalone THEN
                let t = i + 1;
                while (t < blockLines.length) {
                    const r  = blockLines[t];
                    const tt = cleanLine(typeof r === 'object' ? r.content : r);
                    if (tt) break;
                    t++;
                }
                if (t >= blockLines.length) {
                    const e = new Error(`Missing THEN after IF`);
                    e.line = currentLine; throw e;
                }
                const thenToken = cleanLine(typeof blockLines[t] === 'object' ? blockLines[t].content : blockLines[t]);
                if (!/^THEN$/i.test(thenToken)) {
                    const e = new Error(`Expected THEN after IF`);
                    e.line = currentLine; throw e;
                }

                // depth/nesting 
                const thenBlock = [];
                const elseBlock = [];
                let inElse = false;
                let depth  = 0; // depth of nested IF
                let k;
                for (k = t + 1; k < blockLines.length; k++) {
                    const rawK = blockLines[k];
                    const txt  = (typeof rawK === 'object') ? rawK.content : rawK;
                    const c    = cleanLine(txt);
                    if (!c) { (inElse ? elseBlock : thenBlock).push(rawK); continue; }

                    // detect nested IF starts/ends
                    if (/^IF\b/i.test(c) && !/\bTHEN\b/i.test(c)) {
                        depth++;
                        (inElse ? elseBlock : thenBlock).push(rawK);
                        continue;
                    }
                    if (/^ENDIF\b/i.test(c)) {
                        if (depth > 0) {
                            depth--;
                            (inElse ? elseBlock : thenBlock).push(rawK);
                            continue;
                        }
                        // depth is equal to 0 here
                        break;
                    }
                    if (/^ELSE\b/i.test(c) && depth === 0) {
                        // switch to ELSE
                        inElse = true;
                        continue;
                    }

                    // Regular line (or THEN token from nested IF) — include it
                    (inElse ? elseBlock : thenBlock).push(rawK);
                }

                if (k >= blockLines.length) {
                    const e = new Error(`Missing ENDIF for IF`);
                    e.line = currentLine; throw e;
                }

                // execute the IF
                i = k;
                if (assertBoolean(await evalExpr(condExpr, scope), 'IF condition')) {
                    await runBlock(thenBlock, scope, undefined, allowReturn);
                } else {
                    await runBlock(elseBlock, scope, undefined, allowReturn);
                }
                continue;
            }

            // CASE OF X ... ENDCASE
            if ((m = s.match(/^CASE\s+OF\s+(.+)$/i))) {
                const switchExpr = m[1].trim();
                const { block, next } = collectUntil(blockLines, i + 1, /^(ENDCASE)\b/i);
                if (next >= blockLines.length) {
                    const e = new Error(`Missing ENDCASE for CASE`);
                    e.line = currentLine; throw e;
                }
                i = next;
                const val = await evalExpr(switchExpr, scope);
                let chosen = null, otherwise = null;
                for (let k = 0; k < block.length; k++) {
                    const rawk = block[k];
                    const ln = cleanLine(typeof rawk === 'object' ? rawk.content : rawk);
                    if (!ln) continue;
                    let mm;
                    if ((mm = ln.match(/^OTHERWISE\s+(.+)$/i))) {
                        otherwise = [block[k]]; // run via runBlock for consistency
                    } else if ((mm = ln.match(/^(.+?)\s*:\s*(.+)$/))) {
                        const caseVal = await evalExpr(mm[1], scope);
                        if (chosen == null && val === caseVal) { chosen = [block[k]]; }
                    }
                }
                // Simple one-liner cases: execute the single statement after ':'
                async function execCaseLine(line) {
                    const txt = (typeof line === 'object') ? line.content : line;
                    const mm = cleanLine(txt).match(/^(.+?)\s*:\s*(.+)$/);
                    if (!mm) return;
                    await runBlock([mm[2]], scope, undefined, allowReturn);
                }
                if (chosen) await execCaseLine(chosen[0]);

                else if (otherwise) {
                    const othTxt = cleanLine(typeof otherwise[0] === 'object' ? otherwise[0].content : otherwise[0]);
                    const mm = othTxt.match(/^OTHERWISE\s+(.+)$/i);
                    if (mm) await runBlock([mm[1]], scope, undefined, allowReturn);
                }
                continue;
            }
        
            // FOR i <- ... TO ... [STEP ...] ... NEXT i
            if ((m = s.match(/^FOR\s+([A-Za-z][A-Za-z0-9_]*)\s*(?:\u2190|<-)\s*(.+?)\s+TO\s*(.+?)(?:\s+STEP\s+(.+))?\s*$/i))) {
                const forStartLine = LINE_NUMBER; // capture the exact line where FOR appeared
                const varName   = m[1];
                const startExpr = m[2];
                const toExpr    = m[3];
                const stepExpr  = (m[4] == null || m[4].trim() === '') ? '1' : m[4];

                if (!isDeclared(scope, varName)) {
                    declareName(scope, varName);
                    setType(scope, varName, 'INTEGER');
                }

                let varType = getType(scope, varName);
                if (!varType) {
                    setType(scope, varName, 'INTEGER');
                    varType = 'INTEGER';
                }
                if (varType !== 'INTEGER') {
                    throwErr('TypeError: ', 'variable must be an INTEGER', currentLine)
                }

                // detect wrong NEXT variable
                (function () {
                    let depth = 0;
                    for (let t = i + 1; t < blockLines.length; t++) {
                        const rawT = blockLines[t];
                        const txt  = (typeof rawT === 'object') ? rawT.content : rawT;
                        const c    = cleanLine(txt);
                        if (!c) continue;
                        if (/^FOR\b/i.test(c)) { depth++; continue; }
                        const nm = c.match(/^NEXT\s+([A-Za-z][A-Za-z0-9_]*)$/i);
                        if (nm) {
                            const canonFor  = getCanonNameFrom(scope, varName);
                            const canonNext = getCanonNameFrom(scope, nm[1]);
                            if (depth === 0 && canonNext !== canonFor) {
                                const e = new Error(`Mismatched NEXT: expected NEXT ${varName} but found NEXT ${nm[1]}`);
                                e.line = (typeof rawT === 'object') ? rawT.line : (t + 1);
                                throw e;
                            }
                            if (depth === 0 && canonNext === canonFor) break;
                            if (depth > 0) {
                                depth--;
                                continue;
                            }
                        }
                    }
                })();

                // collect correct body
                const endRE = new RegExp(`^(?:NEXT\\s+${varName})$`, 'i');
                const { block, next } = collectUntil(blockLines, i + 1, endRE, forStartLine);
                if (next >= blockLines.length) {
                    throwErr('SyntaxError: ', 'expected ' + '"NEXT"', forStartLine)
                }
                i = next;

                // evaluate bounds
                const start = Number(await evalExpr(startExpr, scope));
                const end   = Number(await evalExpr(toExpr,    scope));
                const step  = Number(await evalExpr(stepExpr,  scope));
                if (![start, end, step].every(Number.isFinite) || ![start,end,step].every(Number.isInteger)) {
                    throwErr('TypeError: ', 'range() INTEGER arguments expected', currentLine)
                }
                if (step === 0) {
                    throwErr('ValueError: ', 'step argument must not be zero', currentLine)
                }
                if (!Number.isInteger(step)) {
                    throwErr('TypeError: ', 'range() INTEGER step argument expected', currentLine)
                }

                let count = 0;
            // Single loop with direction-aware condition
            const canonForVar = getCanonNameFrom(scope, varName);
            markInitialized(scope, varName);
            for ((findDeclScope(scope, varName) || scope)[canonForVar] = start; 
                    (step > 0) ? (findDeclScope(scope, varName) || scope)[canonForVar] <= end : (findDeclScope(scope, varName) || scope)[canonForVar] >= end; 
                    (findDeclScope(scope, varName) || scope)[canonForVar] += step) {
                
                if (typeof window !== 'undefined' && window.__ide_stop_flag) throw new Error('Code execution stopped by user');
                await runBlock(block, scope, undefined, allowReturn);
                if (++count > LOOP_LIMIT) throwErr('RuntimeError: ', 'maximum iteration limit exceeded', currentLine)
            }
                continue;
            }

            // WHILE cond DO ... ENDWHILE (with nesting support)
            if ((m = s.match(/^WHILE\s+(.+)\s+DO\s*$/i))) {
                const cond = m[1];

                // Collect body with proper nesting of inner WHILE...ENDWHILE
                const block = [];
                let depth = 0;
                let k;
                for (k = i + 1; k < blockLines.length; k++) {
                    const rawK = blockLines[k];
                    const txt  = (typeof rawK === 'object') ? rawK.content : rawK;
                    const c    = cleanLine(txt);
                    if (c) {
                        // new inner WHILE ... DO
                        if (/^WHILE\b/i.test(c) && /\bDO\b/i.test(c)) {
                            depth++;
                            block.push(rawK);
                            continue;
                        }
                        // ENDWHILE — close inner if depth>0, else this closes current loop
                        if (/^ENDWHILE\b/i.test(c)) {
                            if (depth > 0) {
                                depth--;
                                block.push(rawK);
                                continue;
                            }
                            break; // matching ENDWHILE for the current WHILE
                        }
                    }

                    block.push(rawK);
                }
                if (k >= blockLines.length) {
                    const e = new Error('Missing ENDWHILE');
                    e.line = currentLine;
                    throw e;
                }
                i = k; // position after matching ENDWHILE

                let count = 0;
                while (assertBoolean(await evalExpr(cond, scope), 'WHILE condition')) {
                    if (typeof window !== 'undefined' && window.__ide_stop_flag) throw new Error('Code execution stopped by user');
                    await runBlock(block, scope, undefined, allowReturn);
                    if (++count > LOOP_LIMIT) throwErr('RuntimeError: ', 'maximum iteration limit exceeded', currentLine)
                }
                continue;
            }

            // REPEAT ... UNTIL
            if (/^REPEAT\b/i.test(s)) {
                const block = [];
                let depth = 0;
                let k;
                for (k = i + 1; k < blockLines.length; k++) {
                    const rawK = blockLines[k];
                    const txt  = (typeof rawK === 'object') ? rawK.content : rawK;
                    const c    = cleanLine(txt);
                    if (c) {
                        // new inner REPEAT
                        if (/^REPEAT\b/i.test(c)) {
                            depth++;
                            block.push(rawK);
                            continue;
                        }
                        // UNTIL — close the inner loop if depth>0, otherwise close the current loop
                        if (/^UNTIL\b/i.test(c)) {
                            if (depth > 0) {
                                depth--;
                                block.push(rawK);
                                continue;
                            }
                            // found matching UNTIL for the REPEAT
                            const mm = c.match(/^UNTIL\s+(.+)$/i);
                            if (!mm) throwErr('SyntaxError: ', 'expected condition after UNTIL', currentLine)
                            i = k; // position after matching UNTIL
                            
                            let count = 0;
                            do {
                                if (typeof window !== 'undefined' && window.__ide_stop_flag) throw new Error('Code execution stopped by user');
                                await runBlock(block, scope, undefined, allowReturn);
                                if (++count > LOOP_LIMIT) throwErr('RuntimeError: ', 'maximum iteration limit exceeded', currentLine)
                            } while (!assertBoolean(await evalExpr(mm[1], scope), 'UNTIL condition'));
                            break;
                        }
                    }

                    block.push(rawK);
                }
                if (k >= blockLines.length) {
                    const e = new Error('Missing UNTIL for REPEAT');
                    e.line = currentLine;
                    throw e;
                }
                continue;
            }

            // RETURN expr (when executing inside a function)
            if ((m = s.match(/^RETURN\s+(.+)$/i))) {
                if (!allowReturn) {
                    throwErr('SyntaxError: ', '\'RETURN\' outside function', currentLine)
                }
                const parts = splitArgs(m[1]);                         // support comma-separated parts
                const vals  = await Promise.all(parts.map(p => evalExpr(p, scope)));
                const ret   = (vals.length === 1) ? vals[0]           // single expr: return as-is
                                                  : vals.map(v => toString(v)).join(""); // concat like OUTPUT
                throw { __return: true, value: ret };
            }              

            // simple statement table (DECLARE, CONSTANT, INPUT, OUTPUT, ASSIGNMENT)
            const SIMPLE = [
                [ /^DECLARE\s+([A-Za-z][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z][A-Za-z0-9_]*)*)\s*:\s*([A-Za-z]+)\s*$/i,
                    (m,scope) => m[1].split(',').map(t=>t.trim()).forEach(n => {
                        assertNotKeyword(n);
                        declareName(scope, n);
                        setType(scope, n, m[2]);
                    })
                ],
                
                [ /^CONSTANT\s+([A-Za-z][A-Za-z0-9_]*)\s*(?:\u2190|<-)\s*(.+)$/i,
                    async (m,scope) => {
                        assertNotKeyword(m[1]);
                        if (!isLiteral(m[2])) throwErr('TypeError: ', 'CONSTANT value must be a literal', LINE_NUMBER)
                        const N = m[1];
                        const lower = String(N).toLowerCase();

                        constants[lower] = true;

                        declareName(scope, N);
                        const canon = getCanonNameFrom(scope, N);
                        scope[canon] = await evalExpr(m[2],scope);
                        markInitialized(scope, N);

                        const val = scope[canon];
                        const t = (typeof val === 'number') ? (Number.isInteger(val) ? 'INTEGER' : 'REAL') : (typeof val === 'boolean') ? 'BOOLEAN' : 'STRING';
                        setType(scope, N, t);
                    }
                ],

                [ /^INPUT\s+(.+)$/i,
                    async (m, scope) => {
                        const lv = await getLValue(m[1].trim(), scope);
                        if (!isDeclared(scope, lv.name)) {
                            throwErr('NameError: ', 'name ' + String(lv.name) + ' is not defined', LINE_NUMBER)
                        }
                    
                        // Flush any pending OUTPUT so prompts appear before the caret
                        if (isWorkerEnv()) {
                            try { self.postMessage({ type: 'flush', output: OUTPUT_LOG.join("\n") }); } catch {}
                            OUTPUT_LOG.length = 0;
                        }
                    
                        const raw = String(await readInput());
                        const value = parseInput(raw);
                    
                        assignChecked(lv, scope, `INPUT:${raw}`, value, true);
                        markInitialized(scope, lv.name);
                    }
                ],                      
                  
                [ /^OUTPUT\s+(.+)$/i,
                    async (m, scope) => {
                        const parts = splitArgs(m[1]);
                        const vals  = await Promise.all(parts.map(p => evalExpr(p, scope)));
                        const rendered = parts.map((p, i) => renderForOutput(p, vals[i], scope));
                        out(rendered);
                    }
                ],

                // assignment
                [ /^(.+?)\s*(?:\u2190|<--|<-)\s*(.+)$/, // ← or <-- or <- accepted
                    async (m,scope)=>{ 
                        const lv=await getLValue(m[1].trim(),scope); 
                        const rhsExpr = m[2];
                        const value = await evalExpr(rhsExpr,scope);

                        assignChecked(lv, scope, rhsExpr, value, false);
                    } ],
            ];

            async function execSimple(line, scope){
                for (const [re, fn] of SIMPLE) {
                    const m = line.match(re);
                    if (m) {
                        await fn(m, scope);
                        return true;
                    }
                }
                return false;
            }

            // eval simple statements first
            if (await execSimple(s, scope)) continue;

            let msg = 'invalid syntax';

            // if = is used in place of <-
            if (/^[A-Za-z][A-Za-z0-9_]*\s*=\s*.+$/.test(s)) {
                const lhs = s.split('=')[0].trim();
                const rhs = s.slice(s.indexOf('=') + 1).trim();
                msg += `. Did you mean ${lhs} <- ${rhs}?`; // helpful message
            }
            
            throwErr('SyntaxError: ', msg, currentLine);
        }
    }

    // puts parameters in a PROCEDURE or FUNCTION
    function bindParams(paramSpec, argVals, scope) {
        const params = (paramSpec || '').trim() ? paramSpec.split(',').map(p => p.trim()).filter(Boolean) : [];
        if (argVals.length !== params.length) {
            throwErr('TypeError: ', `expected ${params.length} arguments, got ${argVals.length}`, LINE_NUMBER)
        }
        for (let i = 0; i < params.length; i++) {
            const part = params[i];
            const [rawName, rawType] = part.split(':').map(x => x.trim());
            assertNotKeyword(rawName);
            const P = rawName;
            const v = argVals[i];
            if (rawType) {
                setType(scope, P, rawType);
                checkAssignCompatible(String(rawType).toUpperCase(), '', v, false);
            }
            declareName(scope, P);
            const canon = getCanonNameFrom(scope, P);
            scope[canon] = v;
            markInitialized(scope, P);
        }
    }

    // ------------------------ Execute! ------------------------
    try {
        await runBlock(mainLines, globals, 1, false);

        if (isWorkerEnv()) {
            try { self.postMessage({ type: 'flush', output: OUTPUT_LOG.join("\n") }); } catch {}
            OUTPUT_LOG.length = 0;
        }
        return OUTPUT_LOG.join("\n");
    } catch (err) {

        // add line number to error
        const line = (err && err.line) ? err.line : (LINE_NUMBER || 'unknown');
        const msg  = (err && err.message) ? err.message : String(err);
        throwErr('', `Line ${line}: ${msg}`, line)
    }
}
