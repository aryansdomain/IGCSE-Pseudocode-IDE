async function interpret(code) {

    // ------------------------ Helpers & Runtime ------------------------
    const OUTPUT_LOG = [];
    let __capSummaryEmitted = false;
    const CAPITALIZATION_SEEN = new Set();
    const constants = Object.create(null);
    const globals   = Object.create(null);

    // clear tracking
    CAPITALIZATION_SEEN.clear();
    __capSummaryEmitted = false;

    const PSC_KEYWORDS = new Set([
        'IF','THEN','ELSE','ENDIF','CASE','OF','OTHERWISE','ENDCASE',
        'FOR','TO','STEP','NEXT','WHILE','DO','ENDWHILE','REPEAT','UNTIL',
        'PROCEDURE','FUNCTION','RETURNS','RETURN','CALL','ENDPROCEDURE','ENDFUNCTION',
        'INPUT','OUTPUT','DECLARE','CONSTANT',
        'TRUE','FALSE','AND','OR','NOT',
        'INTEGER','REAL','BOOLEAN','CHAR','STRING','ARRAY',
        'ROUND','RANDOM','LENGTH','LCASE','UCASE','SUBSTRING','DIV','MOD'
    ]);

    const NAME_KEYWORD_SEEN = new Set();
    function assertNotKeyword(id) {
        const key = String(id).toUpperCase();
        if (PSC_KEYWORDS.has(key)) {
            if (!NAME_KEYWORD_SEEN.has(key)) {
                throwWarning(`Warning: "${id}" is a keyword. Do not use keywords as identifiers.`);
                NAME_KEYWORD_SEEN.add(key);
            }
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
        if (typeof v !== 'boolean') throwErr('TypeError: ', String(ctx) + ' must be a BOOLEAN', __LINE_NUMBER)
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

    // remove all comments
    function stripStringsAndComments(src) {
        let out = '';
        let inStr = false, quote = '';
        for (let i = 0; i < src.length; i++) {
            const c = src[i], p = src[i-1];
            // line comment
            if (!inStr && c === '/' && src[i+1] === '/') {
                // replace the rest with spaces to preserve indices
                while (i < src.length) { out += ' '; i++; }
                break;
            }
            if (!inStr && (c === '"' || c === "'")) {
                inStr = true; quote = c; out += ' ';
                continue;
            }
            if (inStr) {
                // leave a single space for each char so regex indices stay sane
                if (c === quote && p !== '\\') { inStr = false; quote = ''; }
                out += ' ';
            } else {
                out += c;
            }
        }
        return out;
    }

    // check if keywords are capitalized
    function checkCapitalization(text, lineNumber) {
        const scan = stripStringsAndComments(text);
      
        for (const kw of PSC_KEYWORDS) {
            // whole-word match, case-insensitive
            const re = new RegExp(`\\b${kw}\\b`, 'gi');
            let m;
            while ((m = re.exec(scan)) !== null) {
                if (m[0] !== kw) {
                    const sig = `${kw}:${lineNumber}:${m.index}`;
                    if (!CAPITALIZATION_SEEN.has(sig)) {
                        CAPITALIZATION_SEEN.add(sig);
                        if (!__capSummaryEmitted) {
                            throwWarning(`Warning: Some keywords not capitalized. Click 'Format' to format code.`);
                            __capSummaryEmitted = true;
                        }
                    }
                }
            }
        }
    } 

    const procs = Object.create(null);
    const funcs = Object.create(null);

    // track declared identifiers
    function ensureDeclSet(scope) {
        if (!Object.prototype.hasOwnProperty.call(scope, '__decl')) {
            Object.defineProperty(scope, '__decl', { value: new Set(), enumerable: false });
        }
    }
    function declareName(scope, name) {
        ensureDeclSet(scope);
        scope.__decl.add(String(name));
    }
    function isDeclared(scope, name) {
        const N = String(name);
        for (let s = scope; s; s = Object.getPrototypeOf(s)) {
            if (s.__decl && s.__decl.has(N)) return true;
        }
        return false;
    }

    // ------------------------ Type Tracking ------------------------
    function ensureTypeMap(scope) {
        if (!Object.prototype.hasOwnProperty.call(scope, '__types')) {
            Object.defineProperty(scope, '__types', { value: Object.create(null), enumerable: false });
        }
    }
    function setType(scope, name, type) {
        ensureTypeMap(scope);
        scope.__types[String(name)] = String(type || '').toUpperCase();
    }
    function getType(scope, name) {
        const N = String(name);
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
            throwErr('NameError: ', 'name ' + String(lv.name) + ' is not defined', __LINE_NUMBER)
        }

        // accept numeric strings like "0", "3.5", "-2e3"
        if (isInput && typeof value === 'string') {
            const t = destType.toUpperCase();
                if (t === 'INTEGER' || t === 'REAL') {
                    const n = Number(value.trim());
                if (!Number.isNaN(n) && Number.isFinite(n)) value = n;
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
                    throwErr('', 'Cannot assign ' + getValueType(value, rhsExpr) + ' value to INTEGER', __LINE_NUMBER)
                if (hasRhsText && isReal(rhsExpr))
                    throwErr('', 'Cannot assign REAL value to INTEGER', __LINE_NUMBER)
                return;
            case 'REAL':
                if (typeof value !== 'number' || !Number.isFinite(value))
                    throwErr('', 'Cannot assign ' + getValueType(value, rhsExpr) + ' value to REAL', __LINE_NUMBER)
                return;
            case 'BOOLEAN':
                if (typeof value !== 'boolean')
                    throwErr('', 'Cannot assign ' + getValueType(value, rhsExpr) + ' value to BOOLEAN', __LINE_NUMBER)
                return;
            case 'CHAR':
                if (!isInput && hasRhsText && isDoubleQuoted(rhsExpr))
                    throwErr('SyntaxError: ', 'invalid CHAR literal', __LINE_NUMBER)
                if (toString(value).length !== 1)
                    throwErr('ValueError: ', 'CHAR literal must be a single character', __LINE_NUMBER)
                return;
            case 'STRING':
                // no check here, anything can be string
                if (!isInput && hasRhsText && isSingleQuoted(rhsExpr))
                    throwErr('SyntaxError: ', 'STRING literal must use double quotes', __LINE_NUMBER)
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
    let __LINE_NUMBER = 0;

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
        const varMatch = exprText.match(/^\s*([A-Za-z][A-Za-z0-9]*)(?:\s*\[.*\])?\s*$/);
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
        // remove ANSI escapes and stray CRs, then trim
        const cleaned = String(raw)
        .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')  // ANSI SGR etc.
        .replace(/\r/g, '')
        .trim();

        // numeric? -> number
        if (/^[+-]?(?:\d+\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(cleaned)) {
            return Number(cleaned);
        }
        // booleans
        const up = cleaned.toUpperCase();
        if (up === 'TRUE')  return true;
        if (up === 'FALSE') return false;

        // otherwise keep as string (for CHAR / STRING)
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
            const len = u1 - l1 + 1;
            const arr = new Array(len).fill(fill);
            arr.__lb = l1; // store lower bound
            return arr;
        } else {
            const rows = u1 - l1 + 1;
            const cols = u2 - l2 + 1;
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
            if (A.__lb != null && j == null) return A[i - A.__lb];
            if (A.__lb1 != null && A.__lb2 != null && j != null) return A[i - A.__lb1][j - A.__lb2];
            
            // array exists but wrong dimensions
            if (A.__lb != null && j != null) {
                throwErr('TypeError: ', 'ARRAY indices must be INTEGERs, not tuple', __LINE_NUMBER)
            }
            if (A.__lb1 != null && A.__lb2 != null && j == null) {
                throwErr('TypeError: ', 'too few indices for ARRAY', __LINE_NUMBER)
            }
        }
        throwErr('TypeError: ', 'object is not subscriptable', __LINE_NUMBER)
    }

    // set array element
    function arrSet(A, i, j, v) {
        if (Array.isArray(A)) {
            if (A.__lb != null && j == null) { A[i - A.__lb] = v; return; }
            if (A.__lb1 != null && A.__lb2 != null && j != null) { A[i - A.__lb1][j - A.__lb2] = v; return; }
            
            // array exists but wrong dimensions
            if (A.__lb != null && j != null) {
                throwErr('TypeError: ', 'ARRAY assignment index must be INTEGER, not tuple', __LINE_NUMBER)
            }
            if (A.__lb1 != null && A.__lb2 != null && j == null) {
                throwErr('TypeError: ', 'too few indices for ARRAY assignment', __LINE_NUMBER)
            }
        }
        throwErr('TypeError: ', 'object does not support item assignment', __LINE_NUMBER)
    }

    // builtin functions
    function assertNumber(n, name) {
        if (typeof n !== 'number' || !Number.isFinite(n)) {
            throwErr('TypeError: ', String(name) + ' must be a number', __LINE_NUMBER)
        }
    }
    function assertInteger(n, name) {
        assertNumber(n, name);
        if (!Number.isInteger(n)) {
            throwErr('TypeError: ', String(name) + ' must be an INTEGER', __LINE_NUMBER)
        }
    }
    function assertString(n, name) {
        if (typeof n !== 'string') {
            throwErr('TypeError: ', String(name) + ' must be a STRING', __LINE_NUMBER)
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
            if (start <= 0) throwErr('ValueError: ', 'SUBSTRING start must be positive', __LINE_NUMBER)
            if (len <= 0)   throwErr('ValueError: ', 'SUBSTRING length must be positive', __LINE_NUMBER)
            const st = start;
            const ln = len;

            return str.substring(st - 1, st - 1 + ln);
        },
        
        INTDIV: (a, b) => {
            assertInteger(a, 'DIV first argument');
            assertInteger(b, 'DIV second argument');
            if (b === 0) throwErr('ZeroDivisionError: ', 'division by zero', __LINE_NUMBER)
            return (a / b) >= 0 ? Math.floor(a / b) : Math.ceil(a / b);
        },
        
        MOD: (a, b) => {
            assertInteger(a, 'MOD first argument');
            assertInteger(b, 'MOD second argument');
            if (b === 0) throwErr('ZeroDivisionError: ', 'division by zero', __LINE_NUMBER)
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
        
            // protected literal to the left: … \uE000 ... \uE001 ^ …
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
        
            // protected literal to the right: … ^ \uE000 ... \uE001 …
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
                throw new Error('Power operator ^ requires numeric operands', __LINE_NUMBER);
            }
        
            const before = s.slice(0, L.start);
            const after  = s.slice(R.end);
            s = `${before}Math.pow(${L.text}, ${R.text})${after}`;
            idx = s.lastIndexOf('^');
        }
        return s;
    }

    // numeric ops to enforce numeric types & trap division by 0
    function num(x, ctx) {
        if (typeof x !== 'number' || !Number.isFinite(x)) throwErr('TypeError: ', String(ctx) + ' requires a finite number', __LINE_NUMBER)
        return x;
    }
    const NUM = {
        ADD: (a,b) => num(a,'+ operation') + num(b,'+ operation'),
        SUB: (a,b) => num(a,'- operation') - num(b,'- operation'),
        MUL: (a,b) => num(a,'* operation') * num(b,'* operation'),
        DIV: (a,b) => {
            a = num(a,'/ operation');
            b = num(b,'/ operation');
            if (b === 0) throwErr('ZeroDivisionError: ', 'division by zero', __LINE_NUMBER)
            return a/b;
        }
    };

    // comparison helpers enforcing type rules
    const CMP = {
        EQ(a, b) {
            if (typeof a === 'boolean' || typeof b === 'boolean') return (!!a) === (!!b); // bool

            if (typeof a !== typeof b) // different types
                throwErr('TypeError: ', `cannot compare ${typeName(a)} with ${typeName(b)}`, __LINE_NUMBER);

            return a === b; // otherwise
        },
        NE(a, b) {
            if (typeof a === 'boolean' || typeof b === 'boolean') return (!!a) !== (!!b);
            if (typeof a !== typeof b) throwErr('TypeError: ', `cannot compare ${typeName(a)} with ${typeName(b)}`, __LINE_NUMBER)
            return a !== b;
        },
        LT(a, b) {
            if (typeof a !== typeof b) throwErr('TypeError: ', `cannot compare ${typeName(a)} with ${typeName(b)}`, __LINE_NUMBER)
            if (typeof a === 'number' || typeof a === 'string') return a < b;
            throwErr('TypeError: ', 'relational comparison requires numbers or strings', __LINE_NUMBER)
        },
        GT(a, b) {
            if (typeof a !== typeof b) throwErr('TypeError: ', `cannot compare ${typeName(a)} with ${typeName(b)}`, __LINE_NUMBER)
            if (typeof a === 'number' || typeof a === 'string') return a > b;
            throwErr('TypeError: ', 'relational comparison requires numbers or strings', __LINE_NUMBER)
        },
        LE(a, b) {
            if (typeof a !== typeof b) throwErr('TypeError: ', `cannot compare ${typeName(a)} with ${typeName(b)}`, __LINE_NUMBER)
            if (typeof a === 'number' || typeof a === 'string') return a <= b;
            throwErr('TypeError: ', 'relational comparison requires numbers or strings', __LINE_NUMBER)
        },
        GE(a, b) {
            if (typeof a !== typeof b) throwErr('TypeError: ', `cannot compare ${typeName(a)} with ${typeName(b)}`, __LINE_NUMBER)
            if (typeof a === 'number' || typeof a === 'string') return a >= b;
            throwErr('TypeError: ', 'relational comparison requires numbers or strings', __LINE_NUMBER)
        },
    };

    function typeName(v){
        if (typeof v === 'number') return Number.isInteger(v) ? 'INTEGER' : 'REAL';
        if (typeof v === 'boolean') return 'BOOLEAN';
        if (typeof v === 'string')  return 'STRING';
        if (Array.isArray(v))       return 'ARRAY';
        return 'UNKNOWN';
    }

    // ------------------------ Expression evaluation ------------------------
    async function evalExpr(expr, scope) {

        if (typeof window !== 'undefined' && window.__ide_stop_flag) {
            throw new Error('Code execution stopped by user');
        }

        if (expr == null) return undefined;
        let s = String(expr).trim();

        // ------------------------ REPLACE PSEUDOCODE THINGS WITH JS TOKENS ------------------------

        //console.log("s before everything: ", s);

        // string and char literals
        const lit = [];
        s = s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, m => { lit.push(m); return `\uE000${lit.length-1}\uE001`; });

        if (/\bDIV\b(?!\s*\()/i.test(s) || /\bMOD\b(?!\s*\()/i.test(s)) {
            throwErr('SyntaxError: ', 'invalid syntax', __LINE_NUMBER);
        }

        // bools
        s = s.replace(/\bTRUE\b/g,  'true')
        s = s.replace(/\bFALSE\b/g, 'false');

        // logical operators
        s = s.replace(/\bAND\b/g, '&&')
        s = s.replace(/\bOR\b/g,  '||')
        s = s.replace(/\bNOT\b/g, '!');

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
        s = s.replace(/\b([A-Za-z][A-Za-z0-9]*)\s*\[\s*([^\]\[]+?)\s*(?:,\s*([^\]\[]+?)\s*)?\]/g,
            (m, name, i1, i2) => `__AG("${name}", ${i1}${i2 ? `, ${i2}` : ''})`);

        // calls: builtins vs user functions
        s = s.replace(/\b([A-Za-z][A-Za-z0-9]*)\s*\(/g, (m, name, off, str) => {
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
            /\b([A-Za-z][A-Za-z0-9]*)\b/g,
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

        //console.log("s after everything: ", s);

        const IDENT = /^[A-Za-z][A-Za-z0-9]*$/;

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
                    if (!isDeclared(o, k)) throwErr('NameError: ', 'name ' + String(k) + ' is not defined', __LINE_NUMBER)
                    return o[k];
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
                    const def = funcs[name];
                    const ret = await callFunction(name, args, 0);
                    if (def && def.returns) {
                        const want = String(def.returns || '').toUpperCase();
                        if (want) {
                            checkAssignCompatible(want, '', ret, false);
                        }
                    }
                    return ret;
                },
                (name, ...idx) => {
                    if (!isDeclared(scope, name)) {
                        const e = new Error('Undeclared array ' + name);
                        e.line = __LINE_NUMBER;
                        throw e;
                    }
                    return arrGet(scope[name], ...idx);
                },
                NUM,
                CMP,
                ...builtinFns
            );
        } catch (e) {
            const msg = String(e && e.message || e);
            const m   = msg.match(/(^|')([A-Za-z][A-Za-z0-9]*) is not defined/);
            if (m) {
                throwErr('NameError: ', 'name ' + String(m[2]) + ' is not defined', __LINE_NUMBER)
            }
            throw e;
        }
    }

    async function getLValue(ref, scope) {

        // ref is identifier, or identifier[index], or identifier[i,j]

        const m = ref.match(/^([A-Za-z][A-Za-z0-9]*)(\s*\[(.*)\])?$/);
        if (!m) {
            throwErr('SyntaxError: ', 'invalid identifier ' + String(ref), __LINE_NUMBER)
        }
        const name = m[1]

        if (m[2]) {

            // check if array is declared
            if (!isDeclared(scope, name)) {
                throwErr('NameError: ', 'name ' + String(name) + ' is not defined', __LINE_NUMBER)
            }
            
            const idxRaw = m[3];

            // split by comma
            const parts = splitArgs(idxRaw);
            const i = await evalExpr(parts[0], scope);
            const j = parts[1] != null ? await evalExpr(parts[1], scope) : undefined;
            return {
                name: name,
                get: () => arrGet(scope[name], i, j),
                set: (v) => {
                    // check type
                    if (scope.__types && scope.__types[name]) {
                        const arrayType = scope.__types[name];
                        if (arrayType.startsWith('ARRAY OF ')) {
                            const elementType = arrayType.substring(9); // remove "ARRAY OF "
                            checkAssignCompatible(elementType, '', v, false);
                        }
                    }
                    arrSet(scope[name], i, j, v);
                }
            };
        } else {
            return {
                name: name,
                get: () => {
                    if (!isDeclared(scope, name)) {
                        throwErr('NameError: ', 'name ' + String(name) + ' is not defined', __LINE_NUMBER)
                    }
                    return scope[name];
                },
                set: (v) => {
                    if (name in constants) throwErr('TypeError: ', 'cannot assign to constant', __LINE_NUMBER)
                    if (!isDeclared(scope, name)) throwErr('NameError: ', 'name ' + String(name) + ' is not defined', __LINE_NUMBER)
                    scope[name] = v;
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
        let sawMain = false;

        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const s = cleanLine(raw);
            if (!s) continue;
            
            checkCapitalization(raw, i + 1);
            
            let m;

            if ((m = s.match(/^PROCEDURE\s+([A-Za-z][A-Za-z0-9]*)\s*\((.*)\)\s*$/i)) || (m = s.match(/^PROCEDURE\s+([A-Za-z][A-Za-z0-9]*)\s*$/i))) {
                const name = m[1];
                const params = (m[2] || '').trim();
                const { block, next } = collectUntil(lines, i + 1, /^(ENDPROCEDURE)\b/i);
                procs[name] = { params, body: block };
                i = next; continue;
            }
            if ((m = s.match(/^FUNCTION\s+([A-Za-z][A-Za-z0-9]*)\s*\((.*)\)\s*RETURNS\s+([A-Za-z]+)\s*$/i)) || (m = s.match(/^FUNCTION\s+([A-Za-z][A-Za-z0-9]*)\s*RETURNS\s+([A-Za-z]+)\s*$/i))) {
                const name = m[1];
                const params = m[2] && !/RETURNS/i.test(m[2]) ? m[2] : '';
                const returns = (m[3] || m[2] || '').trim();
                
                // validate return type
                assertType(returns, i + 1);
                
                const { block, next } = collectUntil(lines, i + 1, /^(ENDFUNCTION)\b/i);
                funcs[name] = { params, returns, body: block };
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
                checkCapitalization(text, i + 1);
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
            __LINE_NUMBER = currentLine;
            const content = typeof raw === 'object' ? raw.content : raw;
            const s = cleanLine(content);
            if (!s) continue;

            // Check capitalization and output warnings
            checkCapitalization(content, currentLine);

            // ARRAY declare: DECLARE A : ARRAY[1:10] OF INTEGER  or  DECLARE M : ARRAY[1:3, 1:3] OF CHAR
            if ((m = s.match(/^DECLARE\s+([A-Za-z][A-Za-z0-9]*)\s*:\s*ARRAY\s*\[([^\]]+)\]\s*OF\s*([A-Za-z]+)\s*$/i))) {
                const name = m[1];
                assertNotKeyword(name);

                const dims = m[2].split(',').map(x => x.trim());
                const type = m[3];

                if (dims.length === 1) {
                    const [l, u] = dims[0].split(':').map(Number);
                    scope[name] = makeArray(l, u, null, null, defaultForType(type));
                } else {
                    const [l1, u1] = dims[0].split(':').map(Number);
                    const [l2, u2] = dims[1].split(':').map(Number);
                    scope[name] = makeArray(l1, u1, l2, u2, defaultForType(type));
                }
                declareName(scope, name);
                setType(scope, name, `ARRAY OF ${type}`);
                continue;
            }

            // CALL a PROCEDURE
            if ((m = s.match(/^CALL\s+([A-Za-z][A-Za-z0-9]*)\s*\((.*)\)\s*$/i)) || (m = s.match(/^CALL\s+([A-Za-z][A-Za-z0-9]*)\s*$/i))) {
                const name = m[1];
                const args = await Promise.all((m[2] ? splitArgs(m[2]) : []).map(a => evalExpr(a, scope)));
                await callProcedure(name, args, currentLine);
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
        
            // FOR i <- a TOTEP s] ... NEXT i
            if ((m = s.match(/^FOR\s+([A-Za-z][A-Za-z0-9]*)\s*(?:\u2190|<-)\s*(.+?)\s+TO\s*(.+?)(?:\s+STEP\s+(.+))?\s*$/i))) {
                const forStartLine = __LINE_NUMBER; // capture the exact line where FOR appeared
                const varName   = m[1];
                const startExpr = m[2];
                const toExpr    = m[3];
                const stepExpr  = (m[4] == null || m[4].trim() === '') ? '1' : m[4];

                if (!isDeclared(scope, varName)) {
                    throwErr('NameError: ', 'name ' + String(varName) + ' is not defined', currentLine)
                }

                const varType = getType(scope, varName);
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
                        const nm = c.match(/^NEXT\s+([A-Za-z][A-Za-z0-9]*)$/i);
                        if (nm) {
                            if (depth === 0 && nm[1] !== varName) {
                                const e = new Error(`Mismatched NEXT: expected NEXT ${varName} but found NEXT ${nm[1]}`);
                                e.line = (typeof rawT === 'object') ? rawT.line : (t + 1);
                                throw e;
                            }
                            if (depth === 0 && nm[1] === varName) break;
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
            for (scope[varName] = start; 
                    (step > 0) ? scope[varName] <= end : scope[varName] >= end; // step is positive/negative 
                    scope[varName] += step) {
                
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

            // REPEAT ... UNTIL cond
            if (/^REPEAT\b/i.test(s)) {
                const { block, next } = collectUntil(blockLines, i + 1, /^(UNTIL)\b/i);
                const untilRaw  = blockLines[next];
                const untilLine = cleanLine(typeof untilRaw === 'object' ? untilRaw.content : untilRaw);
                const mm = untilLine && untilLine.match(/^UNTIL\s+(.+)$/i);
                if (!mm) throwErr('SyntaxError: ', 'expected ' + '"UNTIL"', currentLine)
                i = next;

                let count = 0;
                do {
                    if (typeof window !== 'undefined' && window.__ide_stop_flag) throw new Error('Code execution stopped by user');
                    await runBlock(block, scope, undefined, allowReturn);
                    if (++count > LOOP_LIMIT) throwErr('RuntimeError: ', 'maximum iteration limit exceeded', currentLine)
                } while (!assertBoolean(await evalExpr(mm[1], scope), 'UNTIL condition'));
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
                [ /^DECLARE\s+([A-Za-z][A-Za-z0-9]*(?:\s*,\s*[A-Za-z][A-Za-z0-9]*)*)\s*:\s*([A-Za-z]+)\s*$/i,
                    (m,scope) => m[1].split(',').map(t=>t.trim()).forEach(n => {
                        assertNotKeyword(n);

                        scope[n] = defaultForType(m[2]);
                        declareName(scope, n);
                        setType(scope, n, m[2]);
                    })
                ],
                
                [ /^CONSTANT\s+([A-Za-z][A-Za-z0-9]*)\s*(?:\u2190|<-)\s*(.+)$/i,
                    async (m,scope) => {
                        assertNotKeyword(m[1]);
                        if (!isLiteral(m[2])) throwErr('TypeError: ', 'CONSTANT value must be a literal', __LINE_NUMBER)
                        const N = m[1];   

                        constants[N] = true;
                        scope[N] = await evalExpr(m[2],scope);

                        declareName(scope, N);
                        const val = scope[N];
                        const t = (typeof val === 'number') ? (Number.isInteger(val) ? 'INTEGER' : 'REAL') : (typeof val === 'boolean') ? 'BOOLEAN' : 'STRING';
                        setType(scope, N, t);
                    }
                ],

                [ /^INPUT\s+(.+)$/i,
                    async (m, scope) => {
                        const lv = await getLValue(m[1].trim(), scope);
                        if (!isDeclared(scope, lv.name)) {
                            throwErr('NameError: ', 'name ' + String(lv.name) + ' is not defined', __LINE_NUMBER)
                        }
                    
                        // Flush any pending OUTPUT so prompts appear before the caret
                        if (isWorkerEnv()) {
                            try { self.postMessage({ type: 'flush', output: OUTPUT_LOG.join("\n") }); } catch {}
                            OUTPUT_LOG.length = 0;
                        }
                    
                        const raw = String(await readInput());
                        const value = parseInput(raw);
                    
                        assignChecked(lv, scope, `INPUT:${raw}`, value, true);
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
                [ /^(.+?)\s*(?:\u2190|<-|<--)\s*(.+)$/, // <- or <-- or ← accepted
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
            if (/^[A-Za-z][A-Za-z0-9]*\s*=\s*.+$/.test(s)) {
                const lhs = s.split('=')[0].trim();
                const rhs = s.slice(s.indexOf('=') + 1).trim();
                msg += `. Did you mean ${lhs} <- ${rhs}?`; // helpful message
            }
            
            throwErr('SyntaxError: ', msg, currentLine);
        }
    }

    // checks if two values are equal
    function eq(a, b) { return a === b; }

    // calls a PROCEDURE
    async function callProcedure(name, args, line) {
        const def = procs[name];
        if (!def) throwErr('NameError: ', 'name ' + String(name) + ' is not defined', line || __LINE_NUMBER)
        const scope = Object.create(globals);
        ensureDeclSet(scope);
        ensureTypeMap(scope);
        bindParams(def.params, args, scope);
        await runBlock(def.body, scope, 1, false);
    }

    // calls a FUNCTION
    async function callFunction(name, args, line) {
        const def = funcs[name];
        if (!def) throwErr('NameError: ', 'name ' + String(name) + ' is not defined', line || __LINE_NUMBER)
        const scope = Object.create(globals);
        ensureDeclSet(scope);
        ensureTypeMap(scope);
        bindParams(def.params, args, scope);
        try {
            await runBlock(def.body, scope, 1, true);
        } catch (e) {
            if (e && e.__return) return e.value;
            throw e;
        }
        // if the function doesn't return a value, return undefined
        return undefined;
    }

    // puts parameters in a PROCEDURE or FUNCTION
    function bindParams(paramSpec, argVals, scope) {
        const params = (paramSpec || '').trim() ? paramSpec.split(',').map(p => p.trim()).filter(Boolean) : [];
        if (argVals.length !== params.length) {
            throwErr('TypeError: ', `expected ${params.length} arguments, got ${argVals.length}`, __LINE_NUMBER)
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
            scope[P] = v;
            declareName(scope, P);
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
        const line = (err && err.line) ? err.line : (__LINE_NUMBER || 'unknown');
        const msg  = (err && err.message) ? err.message : String(err);
        throwErr('', `Line ${line}: ${msg}`, line)
    }
}
