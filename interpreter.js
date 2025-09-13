async function interpretPseudocode(code) {

    // ------------------------ Helpers & Runtime ------------------------
    const OUTPUT_BUFFER = [];
    const WARNING_BUFFER = [];
    let CAPITALIZATION_WARNINGS = [];
    let __capSummaryEmitted = false;
    const CAPITALIZATION_SEEN = new Set();
    const constants = Object.create(null);
    const globals   = Object.create(null);

    // Clear warning tracking for this run
    CAPITALIZATION_WARNINGS = [];
    CAPITALIZATION_SEEN.clear();
    __capSummaryEmitted = false;  // NEW

    // Error throwing helper
    function throwErr(name, message, line) {
        const e = new Error(message + name);
        e.line = line;
        throw e;
    }

    function emitWarning(text) {
        if (typeof self !== 'undefined' && self.postMessage) {
            try { self.postMessage({ type: 'warning', message: text }); } catch {}
        }
    }

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

    function checkCapitalization(text, lineNumber) {
        const scan = stripStringsAndComments(text);  // <-- add this line
        // Full keyword set (selection, iteration, decls, I/O, logical, types, builtins)
        const KEYWORDS = [
          'IF','THEN','ELSE','ENDIF','CASE','OF','OTHERWISE','ENDCASE',
          'FOR','TO','STEP','NEXT','WHILE','DO','ENDWHILE','REPEAT','UNTIL',
          'PROCEDURE','FUNCTION','RETURNS','RETURN','CALL','ENDPROCEDURE','ENDFUNCTION',
          'INPUT','OUTPUT','DECLARE','CONSTANT',
          'TRUE','FALSE','AND','OR','NOT',
          'INTEGER','REAL','BOOLEAN','CHAR','STRING','ARRAY',
          'ROUND','RANDOM','LENGTH','LCASE','UCASE','SUBSTRING','DIV','MOD'
        ]
      
        for (const kw of KEYWORDS) {
            // whole-word match, case-insensitive
            const re = new RegExp(`\\b${kw}\\b`, 'gi');
            let m;
            while ((m = re.exec(scan)) !== null) {
            // m[0] is whatever was in source; if it doesn't exactly equal the canonical uppercase, warn once
                if (m[0] !== kw) {
                    const sig = `${kw}:${lineNumber}:${m.index}`;
                    if (!CAPITALIZATION_SEEN.has(sig)) {
                        CAPITALIZATION_SEEN.add(sig);
                        // Emit the classic single summary the first time we notice any issue
                        if (!__capSummaryEmitted) {
                            emitWarning(`Warning: Some keywords not capitalized. Click 'Format' to format code.`);
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
        if (!scope.__decl) {
            Object.defineProperty(scope, '__decl', { value: new Set(), enumerable: false });
        }
    }
    function declareName(scope, name) {
        ensureDeclSet(scope);
        scope.__decl.add(name);
    }
    function isDeclared(scope, name) {
        for (let s = scope; s; s = Object.getPrototypeOf(s)) {
            if (s.__decl && s.__decl.has(name)) return true;
        }
        return false;
    }

    // ------------------------ Type Tracking ------------------------
    function ensureTypeMap(scope) {
        if (!scope.__types) {
            Object.defineProperty(scope, '__types', { value: Object.create(null), enumerable: false });
        }
    }
    function setType(scope, name, type) {
        ensureTypeMap(scope);
        scope.__types[name] = String(type || '').toUpperCase();
    }
    function getType(scope, name) {
        for (let s = scope; s; s = Object.getPrototypeOf(s)) {
            if (s.__types && s.__types[name]) return s.__types[name];
        }
        return undefined;
    }
    const NUMERIC_TYPES = new Set(['INTEGER', 'REAL']);

    // destination type helpers
    function getDestTypeForLValue(lv, scope) {
        let t = getType(scope, lv.name);
        if (t && /^ARRAY OF\s+/i.test(t)) t = t.replace(/^ARRAY OF\s+/i, '');
        return String(t || '').toUpperCase();
    }

    function assignChecked(lv, scope, rhsExpr, value, isInput) {
        const destType = getDestTypeForLValue(lv, scope);
                        if (!destType) {
                    throwErr('', 'Undeclared variable ' + lv.name, __LINE_NUMBER);
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
            // Check if it's a single-quoted literal (CHAR) vs double-quoted (STRING)
            if (rhsExpr && typeof rhsExpr === 'string') {
                if (isSingleQuoted(rhsExpr)) return 'CHAR';
                if (isDoubleQuoted(rhsExpr)) return 'STRING';
            }
            // Fallback: single character = CHAR, multiple = STRING
            if (value.length === 1) return 'CHAR';
            return 'STRING';
        }
        if (typeof value === 'object' && Array.isArray(value)) return 'ARRAY';
        return 'UNKNOWN';
    }

    function checkAssignCompatible(destType, rhsExpr, value, isInput) {
        destType = String(destType || '').toUpperCase();
        const hasRhsText = typeof rhsExpr === 'string' && rhsExpr.trim().length > 0;

        switch (destType) {
            case 'INTEGER':
                if (typeof value !== 'number' || !Number.isInteger(value))
                    throwErr('', 'Type mismatch: assigning ' + getValueType(value, rhsExpr) + ' value to INTEGER', __LINE_NUMBER);
                if (hasRhsText && isReal(rhsExpr))
                    throwErr('', 'Type mismatch: assigning REAL value to INTEGER', __LINE_NUMBER);
                return;
            case 'REAL':
                if (typeof value !== 'number' || !Number.isFinite(value))
                    throwErr('', 'Type mismatch: assigning ' + getValueType(value, rhsExpr) + ' value to REAL', __LINE_NUMBER);
                return;
            case 'BOOLEAN':
                if (typeof value !== 'boolean')
                    throwErr('', 'Type mismatch: assigning ' + getValueType(value, rhsExpr) + ' value to BOOLEAN', __LINE_NUMBER);
                return;
            case 'CHAR':
                if (!isInput && hasRhsText && !isSingleQuoted(rhsExpr))
                    throwErr('', 'Type mismatch: expected CHAR literal in single quotes', __LINE_NUMBER);
                if (toString(value).length !== 1)
                    throwErr('', 'CHAR literal must be a single character', __LINE_NUMBER);
                return;
            case 'STRING':
                if (typeof value !== 'string')
                    throwErr('', 'Type mismatch: assigning ' + getValueType(value, rhsExpr) + ' value to STRING', __LINE_NUMBER);
                if (!isInput && hasRhsText && !isDoubleQuoted(rhsExpr))
                    throwErr('', 'Type mismatch: STRING literals must use double quotes', __LINE_NUMBER);
                return;
        }
    }

    // conversion between types
    function realToString(n) {
        return Number.isInteger(n) ? n.toFixed(1) : String(n);
    }
    function toString(v) {
        if (v === true) return "TRUE";
        if (v === false) return "FALSE";
        if (v == null) return "";
        if (typeof v === 'symbol') return v.description ?? v.toString();
        return String(v);
    }
    function toBool(v) {
        return !!v;
    }

    // type checking
    function isReal(src) {
        return /^\s*[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$/.test(src)
            || /^\s*[+-]?\d+(?:[eE][+-]?\d+)\s*$/.test(src);
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
        OUTPUT_BUFFER.push(s);
    }

    // parse input value
    function parseInput(raw) {
        const trimmed = raw.trim();
        const num = Number(trimmed);
        
        if (!isNaN(num) && isFinite(num)) return num;
        if (trimmed.toUpperCase() === 'TRUE') return true;
        if (trimmed.toUpperCase() === 'FALSE') return false;
        return raw;
    }

    function defaultForType(type) {
        const t = type.toUpperCase();
        if (t === 'INTEGER' || t === 'REAL') return 0;
        if (t === 'BOOLEAN') return false;
        if (t === 'CHAR') return '';
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
                throwErr('', 'Invalid array access: 1D array accessed with 2D syntax', __LINE_NUMBER);
            }
            if (A.__lb1 != null && A.__lb2 != null && j == null) {
                throwErr('', 'Invalid array access: 2D array accessed with 1D syntax', __LINE_NUMBER);
            }
        }
        throwErr('', 'Invalid array access: not an array', __LINE_NUMBER);
    }

    // set array element
    function arrSet(A, i, j, v) {
        if (Array.isArray(A)) {
            if (A.__lb != null && j == null) { A[i - A.__lb] = v; return; }
            if (A.__lb1 != null && A.__lb2 != null && j != null) { A[i - A.__lb1][j - A.__lb2] = v; return; }
            
            // array exists but wrong dimensions
            if (A.__lb != null && j != null) {
                throwErr('', 'Invalid array assignment: 1D array accessed with 2D syntax', __LINE_NUMBER);
            }
            if (A.__lb1 != null && A.__lb2 != null && j == null) {
                throwErr('', 'Invalid array assignment: 2D array accessed with 1D syntax', __LINE_NUMBER);
            }
        }
        throwErr('', 'Invalid array assignment: not an array', __LINE_NUMBER);
    }

    // builtin functions
    function assertNumber(n, name) {
        if (typeof n !== 'number' || !Number.isFinite(n)) {
          throwErr(name, ' must be a finite number', __LINE_NUMBER);
        }
      }
    function assertInteger(n, name) {
        assertNumber(n, name);
        if (!Number.isInteger(n)) {
          throwErr(name, ' must be an INTEGER', __LINE_NUMBER);
        }
    }
    function assertString(n, name) {
        if (typeof n !== 'string') {
            throwErr('', name + ' must be a string', __LINE_NUMBER);
        }
        return n;
    }
      
    const builtins = {
        RANDOM: () => Math.random(),
        
        ROUND: (x, places) => {
            assertNumber(x, 'ROUND(x)');
            assertInteger(places, 'ROUND(places)');
            const p = Math.max(0, places | 0);
            const f = Math.pow(10, p);
            return Math.round(x * f) / f;
        },
        
        LENGTH: (s) => {
            assertString(s, 'LENGTH argument');
            return s.length;
        },
        
        LCASE: (x) => assertString(x, 'LCASE argument').toLowerCase(),
        UCASE: (x) => assertString(x, 'UCASE argument').toUpperCase(),
        
        SUBSTRING: (s, start, len) => {
            const str = assertString(s, 'SUBSTRING argument');
            assertInteger(start, 'SUBSTRING start');
            assertInteger(len, 'SUBSTRING length');
            const st = Math.max(1, start);
            const ln = Math.max(0, len);
            return str.substring(st - 1, st - 1 + ln);
        },
        
        DIV: (a, b) => {
            assertInteger(a, 'DIV first argument');
            assertInteger(b, 'DIV second argument');
            if (b === 0) throwErr('', 'Division by 0', __LINE_NUMBER);
            return (a / b) >= 0 ? Math.floor(a / b) : Math.ceil(a / b);
        },
        
        MOD: (a, b) => {
            assertInteger(a, 'MOD first argument');
            assertInteger(b, 'MOD second argument');
            if (b === 0) throwErr('', 'Division by 0', __LINE_NUMBER);
            const m = a % b;
            return m < 0 ? m + Math.abs(b) : m;
        },
        
    };

    // ------------------------ Handle ^ replacement ------------------------
    function replacePowerOperators(expr) {
        const START = '\uE000';   // protected literal start
        const END   = '\uE001';   // protected literal end
        const isIdChar = (c) => /[A-Za-z0-9_.]/.test(c);
    
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
                throw new Error('Power operator ^ requires numeric operands');
            }
        
            const before = s.slice(0, L.start);
            const after  = s.slice(R.end);
            s = `${before}Math.pow(${L.text}, ${R.text})${after}`;
            idx = s.lastIndexOf('^');
        }
        return s;
    }  

    // turn keywords into functions ( a DIV b -> __DIV(a,b) )
    function replaceBinaryWordOperator(expr, word, callee) {
        const isIdChar = (c) => /[A-Za-z0-9_.]/.test(c);

        // find left operand of operator
        function grabLeft(s, opStart) {
            let i = opStart - 1;
            while (i >= 0 && s[i] === ' ') i--;
            if (s[i] === ')') {
                let depth = 1; i--;
                while (i >= 0 && depth > 0) {
                    if      (s[i] === ')') depth++;
                    else if (s[i] === '(') depth--; i--; }
                return { start: i + 1, text: s.slice(i + 1, opStart).trim() };
            }
            if (s[i] === ']') {
                let depth = 1; i--;
                while (i >= 0 && depth > 0) {
                    if      (s[i] === ']') depth++;
                    else if (s[i] === '[') depth--; i--; }
                return { start: i + 1, text: s.slice(i + 1, opStart).trim() };
            }
            while (i >= 0 && isIdChar(s[i])) i--;

            return { start: i + 1, text: s.slice(i + 1, opStart).trim() };
        }

        // find right operand of operator
        function grabRight(s, opEnd) {
            let i = opEnd + 1;
            while (i < s.length && s[i] === ' ') i++;
            const start = i;
            if (s[i] === '(') {
                let depth = 1; i++;
                while (i < s.length && depth > 0) {
                    if      (s[i] === '(') depth++;
                    else if (s[i] === ')') depth--; i++; }
                return { end: i, text: s.slice(start, i).trim() };
            }
            if (s[i] === '[') {
                let depth = 1; i++;
                while (i < s.length && depth > 0) {
                    if      (s[i] === '[') depth++;
                    else if (s[i] === ']') depth--; i++; }
                return { end: i, text: s.slice(start, i).trim() };
            }
            if (s[i] === '+' || s[i] === '-') i++; // unary
            while (i < s.length && isIdChar(s[i])) i++;

            return { end: i, text: s.slice(start, i).trim() };
        }

        // Helper function to check if an expression is numeric
        function isNumericExpr(text) {
            const t = text.trim();
            if (/^\uE000\d+\uE001$/.test(t)) return false; // protected literals are not numeric
            if (/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return true;
            if (/^['"]/.test(t)) return false;
            return true;
        }
        
        let s = expr;
        const re = new RegExp(`\\b${word}\\b`, 'i'); // case-insensitive token
        let idx = s.search(re);
        while (idx !== -1) {
            const opStart = idx;
            const opEnd   = opStart + word.length - 1;
            const L = grabLeft(s, opStart);
            const R = grabRight(s, opEnd);
            
            // Check if both operands are numeric for DIV and MOD
            if ((word === 'DIV' || word === 'MOD') && (!isNumericExpr(L.text) || !isNumericExpr(R.text))) {
                throwErr('', `${word} operator requires numeric operands`, __LINE_NUMBER);
            }
            
            s = s.slice(0, L.start) + `${callee}(${L.text},${R.text})` + s.slice(R.end);
            idx = s.search(re); // keep going (left-to-right)
        }
        return s;
    }
    
    // Validate arithmetic operators have numeric operands
    function validateArithmeticOperators(expr) {
        // Check for +, -, *, /, ^ operators
        const operators = ['+', '-', '*', '/', '^'];
        for (const op of operators) {
            const regex = new RegExp(`([^+\\-*/=<>!&|^\\s]+)\\s*\\${op}\\s*([^+\\-*/=<>!&|^\\s]+)`, 'g');
            let match;
            while ((match = regex.exec(expr)) !== null) {
                const left = match[1].trim();
                const right = match[2].trim();
                
                // Skip if it's already a function call or complex expression
                if (left.includes('(') || right.includes('(') || left.includes('[') || right.includes('[')) {
                    continue;
                }
                
                if (!isNumericExpr(left) || !isNumericExpr(right)) {
                    throwErr('', `Arithmetic operator ${op} requires numeric operands`, __LINE_NUMBER);
                }
            }
        }
    }

    // ------------------------ Expression evaluation ------------------------
    async function evalExpr(expr, scope) {

        if (typeof window !== 'undefined' && window.__ide_stop_flag) {
            throw new Error('Code execution stopped by user');
        }

        if (expr == null) return undefined;
        let s = String(expr).trim();

        // replace pseudocode tokens with js tokens

        // string and char literals
        const lit = [];
        s = s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, m => { lit.push(m); return `\uE000${lit.length-1}\uE001`; });

        // bools
        s = s.replace(/\bTRUE\b/g,  'true')
        s = s.replace(/\bFALSE\b/g, 'false');

        // logical operators
        s = s.replace(/\bAND\b/g, '&&')
        s = s.replace(/\bOR\b/g,  '||')
        s = s.replace(/\bNOT\b/g, '!');

        // not-equal
        s = s.replace(/<>/g, '!=');

        // Check arithmetic operators for numeric operands BEFORE conversion
        validateArithmeticOperators(s);

        // power
        s = replacePowerOperators(s);

        // comparison
        s = s.replace(/(?<![<>])=/g,'==');

        // arrays A[i] / A[i,j]
        s = s.replace(/\b([A-Za-z][A-Za-z0-9]*)\s*\[\s*([^\]\[]+?)\s*(?:,\s*([^\]\[]+?)\s*)?\]/g,
            (m, name, i1, i2) => `__AG('${name}', ${i1}${i2 ? `, ${i2}` : ''})`);

        // calls: builtins vs user functions
        s = s.replace(/\b([A-Za-z][A-Za-z0-9]*)\s*\(/g, (m, name, off, str) => {
            if (off > 0 && str.slice(off - 4, off) === 'Math') return m;
            if (off > 0 && str[off-1] === '.') return m;
            const U = name.toUpperCase();
            if (U === 'TRUE' || U === 'FALSE') return m;
            if (builtins[U]) return `__BUILTIN_${U}(`;
            return `__CALL('${name}',`;
        });

        // div and mod
        s = replaceBinaryWordOperator(s, 'DIV', '__DIV');
        s = replaceBinaryWordOperator(s, 'MOD', '__MOD');

        // unprotect literals
        s = s.replace(/\uE000(\d+)\uE001/g, (_, i) => lit[+i]);

        const IDENT = /^[A-Za-z][A-Za-z0-9]*$/;
        const SAFE_GLOBALS = new Set(['Math']); // allow Math.pow

        const scopeProxy = new Proxy(scope, {
            has: (o, k) => {
                // with() will ask about symbol keys like Symbol.unscopables
                if (typeof k !== 'string') return false;         // let real global handle symbols
                if (SAFE_GLOBALS.has(k))   return false;         // fall through to real global
                if (IDENT.test(k))         return true;          // force our getter to run
                return (k in o);
            },
            get: (o, k) => {
                if (typeof k !== 'string') return o[k];          // pass symbols through
                if (IDENT.test(k)) {
                    if (!isDeclared(o, k)) {
                        throwErr('', 'Undeclared variable ' + k, __LINE_NUMBER);
                    }
                    return o[k];
                }
                return o[k];
            }
        });

        const fn = Function(
            '__SCOPE', '__DIV', '__MOD', '__CALL', '__AG', ...Object.keys(builtins).map(k => `__BUILTIN_${k}`),
            `with (__SCOPE) { return (${s}); }`
        );

        try {
            const builtinFns = Object.keys(builtins).map(k => builtins[k]);
            return fn(
                scopeProxy,
                builtins.DIV,
                builtins.MOD,
                async (name, ...args) => await callFunction(name, args),
                (name, ...idx) => {
                    if (!isDeclared(scope, name)) {
                        const e = new Error('Undeclared array ' + name);
                        e.line = __LINE_NUMBER;
                        throw e;
                    }
                    return arrGet(scope[name], ...idx);
                },
                ...builtinFns
            );
        } catch (e) {
            const msg = String(e && e.message || e);
            const m   = msg.match(/(^|')([A-Za-z][A-Za-z0-9]*) is not defined/);
            if (m) {
                throwErr(m[2], 'Undeclared variable ', __LINE_NUMBER);
            }
            throw e;
        }
    }

    async function getLValue(ref, scope) {

        // ref is identifier, or identifier[index], or identifier[i,j]

        const m = ref.match(/^([A-Za-z][A-Za-z0-9]*)(\s*\[(.*)\])?$/);
        if (!m) throwErr(ref, 'Invalid identifier: ', __LINE_NUMBER);
        const name = m[1];
        if (m[2]) {

            // check if array is declared
            if (!isDeclared(scope, name)) {
                throwErr('', 'Undeclared array ' + name, __LINE_NUMBER);
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
                        throwErr(name, 'Undeclared variable ' + name, __LINE_NUMBER);
                    }
                    return scope[name];
                },
                set: (v) => {
                    if (name in constants) throwErr(name, 'Cannot assign to CONSTANT ', __LINE_NUMBER);
                    if (!isDeclared(scope, name)) throwErr(name, 'Undeclared variable ' + name, __LINE_NUMBER);
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
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const s = cleanLine(raw);
            if (!s) continue;
            
            // Check capitalization for this line before processing
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
                const { block, next } = collectUntil(lines, i + 1, /^(ENDFUNCTION)\b/i);
                funcs[name] = { params, returns, body: block };
                i = next; continue;
            }
            main.push({ line: i + 1, content: raw });
        }
        return main;
    }

    // collects a block of lines until the endRegex is found
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
            block.push({ line: i + 1, content: (typeof raw === 'object') ? raw.content : raw });
        }
        if (!found) {
            let endMessage = 'closing statement';
            if (endRegex.source.includes('ENDIF')) {
                endMessage = 'ENDIF';
            } else if (endRegex.source.includes('ENDWHILE')) {
                endMessage = 'ENDWHILE';
            } else if (endRegex.source.includes('ENDCASE')) {
                endMessage = 'ENDCASE';
            } else if (endRegex.source.includes('NEXT')) {
                endMessage = 'NEXT';
            } else if (endRegex.source.includes('UNTIL')) {
                endMessage = 'UNTIL';
            }
            const lineNumber = originalLine || startIndex;
            const e = new Error(`Missing ${endMessage} for block starting at line ${lineNumber}`);
            e.line = lineNumber;
            throw e;
        }
        return { block, next: i };
    }    

    const mainLines = extractDefs(lines);

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

            // CALL Procedure(args?)
            if ((m = s.match(/^CALL\s+([A-Za-z][A-Za-z0-9]*)\s*\((.*)\)\s*$/i)) || (m = s.match(/^CALL\s+([A-Za-z][A-Za-z0-9]*)\s*$/i))) {
                const name = m[1];
                const args = await Promise.all((m[2] ? splitArgs(m[2]) : []).map(a => evalExpr(a, scope)));
                await callProcedure(name, args, scope);
                continue;
            }

            // IF ... (two-line form: THEN on its own line) with nesting support
            if (/^IF\b/i.test(s) && !/\bTHEN\b/i.test(s)) {
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
                    const e = new Error(`Missing THEN after IF starting at line ${currentLine}`);
                    e.line = currentLine; throw e;
                }
                const thenToken = cleanLine(typeof blockLines[t] === 'object' ? blockLines[t].content : blockLines[t]);
                if (!/^THEN$/i.test(thenToken)) {
                    const e = new Error(`Expected THEN after IF at line ${currentLine}`);
                    e.line = currentLine; throw e;
                }

                // Depth-aware collect: build THEN and ELSE blocks until ENDIF at depth 0
                const thenBlock = [];
               const elseBlock = [];
                let inElse = false;
                let depth  = 0; // nested IF (two-line form) depth
                let k = t + 1;
                for (; k < blockLines.length; k++) {
                    const rawK = blockLines[k];
                    const txt  = (typeof rawK === 'object') ? rawK.content : rawK;
                    const c    = cleanLine(txt);
                    if (!c) { (inElse ? elseBlock : thenBlock).push(rawK); continue; }

                    // Detect nested two-line IF starts/ends
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
                        // depth == 0: this ENDIF closes the OUTER IF
                        break;
                    }
                    if (/^ELSE\b/i.test(c) && depth === 0) {
                        // switch to ELSE (do not include the ELSE token)
                        inElse = true;
                        continue;
                    }

                    // Regular line (or THEN token from nested IF) — include it
                    (inElse ? elseBlock : thenBlock).push(rawK);
                }

                if (k >= blockLines.length) {
                    const e = new Error(`Missing ENDIF for IF starting at line ${currentLine}`);
                    e.line = currentLine; throw e;
                }

                // Execute and continue after the ENDIF we just consumed
                i = k;
                if (toBool(await evalExpr(condExpr, scope))) {
                    await runBlock(thenBlock, scope, undefined, allowReturn);
                } else {
                    await runBlock(elseBlock, scope, undefined, allowReturn);
                }
                continue;
            }

            // CASE OF X ... ENDCASE
            if ((m = s.match(/^CASE\s+OF\s+(.+)$/i))) {
                const identExpr = m[1];
                const { block, next } = collectUntil(blockLines, i + 1, /^(ENDCASE)\b/i);
                if (next >= blockLines.length) {
                    const e = new Error(`Missing ENDCASE for CASE starting at line ${currentLine}`);
                    e.line = currentLine; throw e;
                }
                i = next;
                const val = await evalExpr(identExpr, scope);
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
                        if (chosen == null && eq(val, caseVal)) { chosen = [block[k]]; }
                    } else {
                        // treat as a normal statement in the case body (allow multi-line via following lines until next case)
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

            // FOR i ← a TO b [STEP s] ... NEXT i
            if ((m = s.match(/^FOR\s+([A-Za-z][A-Za-z0-9]*)\s*(?:\u2190|<-)\s*(.+)\s+TO\s+(.+?)(?:\s+STEP\s+(.+))?\s*$/i))) {
                const varName   = m[1];
                const startExpr = m[2], toExpr = m[3], stepExpr = m[4] || '1';

                if (!isDeclared(scope, varName)) {
                    throwErr(varName, 'Undeclared variable ', currentLine);
                }
                const varType = getType(scope, varName);
                if (!NUMERIC_TYPES.has(varType)) {
                    throwErr(varType || 'unknown', `FOR variable ${varName} must be INTEGER or REAL, found `, currentLine);
                }

                // collect body
                const endRE = new RegExp(`^(?:NEXT\\s+${varName}|NEXT)$`, 'i');
                const { block, next } = collectUntil(blockLines, i + 1, endRE);
                if (next >= blockLines.length) {
                    throwErr('', `Missing NEXT ${varName} for FOR starting at line ${currentLine}`, currentLine);
                }
                i = next;

                // evaluate bounds
                const start = Number(await evalExpr(startExpr, scope));
                const end   = Number(await evalExpr(toExpr,   scope));
                const step  = Number(await evalExpr(stepExpr, scope));
                if (![start, end, step].every(Number.isFinite)) {
                    throwErr('', 'FOR bounds and STEP must be numeric', currentLine);
                }
                if (step === 0) {
                    throwErr('', 'FOR STEP cannot be 0', currentLine);
                }
                if (!Number.isInteger(step)) {
                    throwErr('', 'FOR STEP must be an integer', currentLine);
                }

                let count = 0;
                if (step > 0) {
                    for (scope[varName] = start; scope[varName] <= end; scope[varName] += step) {
                        if (typeof window !== 'undefined' && window.__ide_stop_flag) throw new Error('Code execution stopped by user');
                        await runBlock(block, scope, undefined, allowReturn);
                        if (++count > LOOP_LIMIT) throwErr('', 'Loop limit exceeded', currentLine);
                    }
                } else {
                    for (scope[varName] = start; scope[varName] >= end; scope[varName] += step) {
                        if (typeof window !== 'undefined' && window.__ide_stop_flag) throw new Error('Code execution stopped by user');
                        await runBlock(block, scope, undefined, allowReturn);
                        if (++count > LOOP_LIMIT) throwErr('', 'Loop limit exceeded', currentLine);
                    }
                }
                continue;
            }

            // WHILE cond DO ... ENDWHILE
            if ((m = s.match(/^WHILE\s+(.+)\s+DO\s*$/i))) {
                const cond = m[1];
                const { block, next } = collectUntil(blockLines, i + 1, /^(ENDWHILE)\b/i);
                if (next >= blockLines.length) {
                    throwErr('', `Missing ENDWHILE for WHILE starting at line ${currentLine}`, currentLine);
                }
                i = next;
                
                let count = 0;
                while (toBool(await evalExpr(cond, scope))) {
                    if (typeof window !== 'undefined' && window.__ide_stop_flag) throw new Error('Code execution stopped by user');
                    await runBlock(block, scope, undefined, allowReturn);
                    if (++count > LOOP_LIMIT) throwErr('', 'Loop limit exceeded', currentLine);
                }
                continue;
            }

            // REPEAT ... UNTIL cond
            if (/^REPEAT\b/i.test(s)) {
                const { block, next } = collectUntil(blockLines, i + 1, /^(UNTIL)\b/i);
                const untilRaw  = blockLines[next];
                const untilLine = cleanLine(typeof untilRaw === 'object' ? untilRaw.content : untilRaw);
                const mm = untilLine && untilLine.match(/^UNTIL\s+(.+)$/i);
                if (!mm) throwErr('', 'UNTIL expected', currentLine);
                i = next;

                let count = 0;
                do {
                    if (typeof window !== 'undefined' && window.__ide_stop_flag) throw new Error('Code execution stopped by user');
                    await runBlock(block, scope, undefined, allowReturn);
                    if (++count > LOOP_LIMIT) throwErr('', 'Loop limit exceeded', currentLine);
                } while (!toBool(await evalExpr(mm[1], scope)));
                continue;
            }

            // RETURN expr (when executing inside a function)
            if ((m = s.match(/^RETURN\s+(.+)$/i))) {
                if (!allowReturn) {
                    throwErr('', 'RETURN used outside FUNCTION', currentLine);
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
                  (m,scope)=> m[1].split(',').map(t=>t.trim()).forEach(n => {
                    scope[n]=defaultForType(m[2]);
                    declareName(scope,n);
                    setType(scope,n,m[2]);
                }) ],
                
                [ /^CONSTANT\s+([A-Za-z][A-Za-z0-9]*)\s*(?:\u2190|<-)\s*(.+)$/i,
                    async (m,scope)=>{ constants[m[1]]=true; scope[m[1]]=await evalExpr(m[2],scope); declareName(scope,m[1]); 
                        const val = scope[m[1]];
                        const t = (typeof val === 'number') ? (Number.isInteger(val) ? 'INTEGER' : 'REAL') : (typeof val === 'boolean') ? 'BOOLEAN' : 'STRING';
                        setType(scope,m[1],t);
                    } ],

                [ /^INPUT\s+(.+)$/i,
                    async (m, scope) => {
                        const lv = await getLValue(m[1].trim(), scope);
                        if (!isDeclared(scope, lv.name)) {
                            throwErr(lv.name, 'Undeclared variable ', __LINE_NUMBER);
                        }
                    
                        // Flush any pending OUTPUT so prompts appear before the caret
                        if (typeof self !== 'undefined' && self.postMessage) {
                            try {
                                self.postMessage({ type: 'flush', output: OUTPUT_BUFFER.join("\n") });
                                OUTPUT_BUFFER.length = 0;
                            } catch {}
                        }
                    
                        const raw = String(await readInput());
                        const value = parseInput(raw);
                    
                        assignChecked(lv, scope, `INPUT:${raw}`, value, true);
                    }
                ],                      
                  
                [ /^OUTPUT\s+(.+)$/i,
                    async (m, scope) => {
                        const parts = splitArgs(m[1]);
                        const vals = await Promise.all(parts.map(async p => {
                            const v = await evalExpr(p, scope);
                            const name = p.trim();
                            if (/^[A-Za-z][A-Za-z0-9]*$/.test(name) && getType(scope, name) === 'REAL' && typeof v === 'number') {
                                return realToString(v);
                            }
                            return v;
                        }));

                        // print newline first then text
                        OUTPUT_BUFFER.push('');
                        OUTPUT_BUFFER.push(vals.map(v => toString(v)).join(""));

                        // stream immediately
                        if (OUTPUT_BUFFER.length) {
                            self.postMessage({ type: 'flush', output: OUTPUT_BUFFER.join('\n') });
                            OUTPUT_BUFFER.length = 0;
                        }
                    }
                ],

                // assignment
                [ /^(.+?)\s*(?:\u2190|<-)\s*(.+)$/,
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

            if (/^[A-Za-z][A-Za-z0-9]*\s*\(/.test(s)) {
                try {
                    await evalExpr(s, scope);
                } catch (err) {
                    if (err && !err.line) err.line = currentLine;
                    throw err;
                }
            } else {
                let msg = `Unknown statement '${s}'`;

                // if = is used in place of <-
                if (/^[A-Za-z][A-Za-z0-9]*\s*=\s*.+$/.test(s)) {
                    const lhs = s.split('=')[0].trim();
                    const rhs = s.slice(s.indexOf('=') + 1).trim();
                    msg += `. Did you mean ${lhs} <- ${rhs}?`; // helpful message
                }
                
                throwErr('', msg, currentLine);
            }
        }
    }

    // checks if two values are equal
    function eq(a, b) {
        return a === b || toString(a) === toString(b);
    }

    // calls a PROCEDURE
    async function callProcedure(name, args, callerScope) {
        const def = procs[name];
        if (!def) throwErr(name, 'Unknown procedure ', 0);
        const scope = Object.create(globals);
        ensureDeclSet(scope);
        ensureTypeMap(scope);
        bindParams(def.params, args, scope);
        await runBlock(def.body, scope, 1, false);
    }

    // calls a FUNCTION
    async function callFunction(name, args) {
        const def = funcs[name];
        if (!def) throwErr(name, 'Unknown function ', 0);
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
        const params = (paramSpec || '').trim() ? paramSpec.split(',').map(p => p.trim()) : [];
        for (let i = 0; i < params.length; i++) {
            const part = params[i];
            const [name, typeMaybe] = part.split(':').map(x => x.trim());
            scope[name] = argVals[i];
            declareName(scope, name);
            if (typeMaybe) setType(scope, name, typeMaybe); // record param type if provided
        }
    }

    // ------------------------ Execute! ------------------------
    try {
        await runBlock(mainLines, globals, 1, false);
        return OUTPUT_BUFFER.join("\n");
    } catch (err) {
        // add line number to error
        const line = (err && err.line) ? err.line : (__LINE_NUMBER || 'unknown');
        const msg  = (err && err.message) ? err.message : String(err);
        throwErr('', `Line ${line}: ${msg}`, line);
    }
}
