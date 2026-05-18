export function initFormatter({ getCode, setCode, formatBtn, getTabSize }) {
    if (formatBtn) {
        formatBtn.addEventListener('click', () => {
            setCode(format(getCode(), getTabSize()));
        });
    }
}

export function format(code, tabSize) {
    let prev, next = String(code);

    // repeat until nothing is changed
    do {
        prev = next;
        next = formatOnce(prev, tabSize);
    } while (next !== prev);
    return next;
}

// ------------------------ Utilities ------------------------

// split line into code and comment
function splitLine(line) {
    const prot = replace(line);
    const commentCol = prot.indexOf('//');
    if (commentCol >= 0) {
        const code    = unreplace(prot.slice(0, commentCol));
        const comment = unreplace(prot.slice(   commentCol));
        return { code, comment };
    } else {
        return { code: line, comment: '' };
    }
}

// split a protected line at a trailing block-end token into separate lines
function splitTerminator(prot, outArr, kwRegex) {
    const PATTERNS = [
        /\b(ENDWHILE)\b/i,
        /\b(ENDFUNCTION)\b/i,
        /\b(ENDPROCEDURE)\b/i,
        /\b(ENDCASE)\b/i,
        /\b(NEXT(?:\s+[A-Za-z][A-Za-z0-9_]*)?)\b/i,
        /\b(UNTIL\b\s*[^]+)$/i
    ];
    let r;
    for (const re of PATTERNS) {
        if (r = prot.match(new RegExp(`^(.*?)(?:\\s*)${re.source}\\s*(.*)$`, re.flags))) {
            const left  = r[1].trim();
            const token = r[r.length - 2];
            const right = r[r.length - 1].trim();
            if (left) outArr.push({ code: left, comment: '' });

            let tokenOut = token.toUpperCase();

            //          NEXT   ?----var----
            const rNext = token.match(/^next(\s+)([A-Za-z][A-Za-z0-9_]*)$/i);
            if (rNext) tokenOut = 'NEXT' + rNext[1] + rNext[2];

            //          UNTIL   ----cond----
            const rUntil = token.match(/^until\b([\s\S]*)$/i);
            if (rUntil) {
                const condition = rUntil[1].replace(kwRegex, t => t.toUpperCase());
                tokenOut = 'UNTIL' + condition;
            }

            outArr.push({ code: tokenOut, comment: '' });
            if (right) outArr.push({ code: right, comment: '' });
            return true;
        }
    }
    return false;
}

const reStartsWithKeyword = new RegExp(
    '^\\s*(?:' +
    'ARRAY|CALL|CASE|CONSTANT|DECLARE|DO|ELSE|' +
    'ENDCASE|ENDFUNCTION|ENDIF|ENDPROCEDURE|ENDWHILE|' +
    'FOR|FUNCTION|IF|INPUT|NEXT|OF|OTHERWISE|' +
    'OUTPUT|PROCEDURE|REPEAT|RETURN|RETURNS|STEP|' +
    'THEN|TO|UNTIL|WHILE' +
    ')\\b', 'i'
);

// ------------------------ Replacing ------------------------

const LITERAL_START = '\uE000';
const LITERAL_END   = '\uE001';

let replaced = [];

// protect strings temporarily so they are not affected by operations
function replace(text) {
    return String(text).replace(/"[^"]*"|'[^']*'/g, (str) => {
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

// ------------------------ One Formatting Pass ------------------------

function formatOnce(code, tabSize = 4) {
    const lines = code.replace(/\r\n?/g, '\n').split('\n');
    const tab = ' '.repeat(tabSize);

    replaced = [];

    // keywords/types uppercasing
    const kwRegex = new RegExp('\\b(?:' +
        'AND|ARRAY|BOOLEAN|CALL|CASE|CHAR|CONSTANT|' +
        'DECLARE|DIV|DO|ELSE|ENDFUNCTION|ENDCASE|' +
        'ENDPROCEDURE|ENDIF|ENDWHILE|FALSE|FOR|FUNCTION|IF|' +
        'INPUT|INTEGER|LCASE|LENGTH|MOD|NEXT|NOT|OF|' +
        'OR|OTHERWISE|OUTPUT|PROCEDURE|RANDOM|REAL|REPEAT|' +
        'RETURNS|RETURN|ROUND|STEP|STRING|SUBSTRING|THEN|' +
        'TO|TRUE|UNTIL|UCASE|WHILE' +
    ')\\b', 'gi');

    // ------------------------ Normalizing ------------------------

    const normalized = [];
    const headerSplits = [
        {
            re: /^\s*(FOR\b\s+[A-Za-z][A-Za-z0-9_]*\s*(?:←|<-|<--)\s*[^]*?\bTO\b\s*[^]*?(?:\s+STEP\s*[^]*?)?)\s+(.+)\s*$/i,
            tailStartsWithKeyword: true
        },
        { re: /^\s*(WHILE\b[^]*?\bDO)\b\s*(.+)\s*$/i },
        { re: /^\s*(PROCEDURE\s+[A-Za-z][A-Za-z0-9_]*\s*(?:\([^()]*\))?)\s+(.+)\s*$/i },
        { re: /^\s*(FUNCTION\s+[A-Za-z][A-Za-z0-9_]*\s*(?:\([^()]*\))?\s+RETURNS\s+[A-Za-z]+)\s+(.+)\s*$/i }
    ];

    for (let i = 0; i < lines.length; i++) {
        let r;
        let { code, comment } = splitLine(lines[i]);
        const push = (text, lineComment = '') => normalized.push({ code: text, comment: lineComment });
        const preserveTrailingComment = () => {
            if (!comment || normalized.length === 0) return;
            const last = normalized[normalized.length - 1];
            if (!last.comment) last.comment = comment;
        };
        const pushTail = (tail) => {
            const trimmed = tail.trim();
            if (!trimmed) return;
 
            const tmp = [];
            if (splitTerminator(trimmed, tmp, kwRegex)) {
                normalized.push(...tmp);
            } else {
                push(trimmed);
            }
        };

        code = code.replace(/\t/g, tab);
        code = replace(code);

        // split off anything before a block-opening keyword
        //                   -left-     --------------------keyword------------------     rest
        if (r = code.match(/^(.*\S)\s+\b(IF|FOR|WHILE|REPEAT|CASE|PROCEDURE|FUNCTION)\b\s*(.*)$/i)) {
            push(r[1]);
            code = r[2] + ' ' + r[3].trim();
        } 

        // split single-line IF into IF / THEN / body
        //                      IF   -cond     THEN     aft.
        if (r = code.match(/^\s*IF\s+(.+?)\s*\bTHEN\b\s*(.*)$/i)) {
            const cond  = r[1].trim();
            const after = r[2].trim();

            push('IF ' + cond);
            push('THEN');
            pushTail(after);

            preserveTrailingComment();
            continue;
        }

        // put simple block keywords on their own line
        //                   THEN|ELSE|REPEAT   aft.
        if (r = code.match(/^\s*(THEN|ELSE|REPEAT)\b\s*(.*)$/i)) {
            const after = r[2].trim();

            push(r[1]);
            pushTail(after);
            preserveTrailingComment();
            continue;
        }

        // split inline ELSE/ENDIF after preceding code
        //                   left     ELSE|ENDIF   right
        if ((r = code.match(/^(.*?)\s+\b(ELSE|ENDIF)\b\s*(.*)$/i)) && r[1].trim()) {
            push(r[1].trim());
            push(r[2]);
            pushTail(r[3]);
            preserveTrailingComment();
            continue;
        }

        // split trailing END*/NEXT/UNTIL terminators
        const tmp = [];
        if (splitTerminator(code, tmp, kwRegex)) {
            normalized.push(...tmp);
            preserveTrailingComment();
            continue;
        }

        // split one-line block headers from their body
        let headerMatch = null;
        for (const { re, tailStartsWithKeyword } of headerSplits) {
            const match = code.match(re);
            if (match && (!tailStartsWithKeyword || reStartsWithKeyword.test(match[2]))) {
                headerMatch = match;
                break;
            }
        }
        if (headerMatch) {
            push(headerMatch[1]);
            pushTail(headerMatch[2]);
            preserveTrailingComment();
            continue;
        }

        push(code, comment);
    }

    // ------------------------ General Replacing ------------------------

    for (let i = 0; i < normalized.length; i++) {
        let line = String(normalized[i].code).trim();

        // protect arrows
        line = line.replace(/\s*(?:←|<--|<-)\s*/g, ' <- ');
        line = line.replace(/\s*(?:<-)\s*/g,       ''); // protect

        line = line.replace(kwRegex, keyword => keyword.toUpperCase()) // keywords
                   .replace(/\s*,\s*/g, ', ')  // comma spacing
                   .replace(/\s*:\s*/g, ' : ') // colon spacing
                   .replace(/\s*(\+|\*|\/|\^)\s*/g, ' $1 ') // +*/^ spacing
                   .replace(/(?<=\S)\s*-\s*(?=\S)/g, ' - ') // -    spacing
                   .replace(/<\s*=|>\s*=|<\s*>/g, m => m.replace(/\s/g, '')) // split comparison operators
                   .replace(/\s*(<>|<=|>=|(?<![<>])=|<(?![=>])|(?<![<=])>(?!=))\s*/g, ' $1 ')
                   .replace(/\b(AND|OR|NOT|IF|WHILE|RETURN)\s*\(/gi, '$1 (')
                   .replace(/\b(FUNCTION|PROCEDURE)\s+([A-Za-z][A-Za-z0-9_]*)\s+\(/gi, '$1 $2(')
                   .replace(/\(\s+/g, '(')    // spaces after        opening paren
                   .replace(/\s+\)/g, ')')    // spaces       before closing paren
                   .replace(/\s+\[\s+/g, '[') // spaces after/before opening bracket
                   .replace(/\s+\]/g, ']')    // spaces       before closing brcaket
                   .replace(/\b(STEP|TO)\s*-\s+(?=[0-9.])/gi, '$1 -')
                   .replace(/\[([^\[\]]+)\]/g, (_, s) => '[' + s.replace(/\s*,\s*/g, ', ').replace(/\s*:\s*/g, ':').trim() + ']')
                   .replace(/ {2,}/g, ' ')
                   .replace(/(^|\(|,|=)\s*-\s+(?=[0-9.])/gi, p1 => p1 + '-');

        // unprotect arrows
        line = line.replace(//g, ' <- ');

        normalized[i].code = line.trim();
    }

    // ------------------------ Declared-name normalization ------------------------

    const declaredNameMap = Object.create(null);
    function addDeclaredName(name) {
        const n = String(name);
        const lower = n.toLowerCase();
        if (!declaredNameMap[lower]) declaredNameMap[lower] = n;
    }
    function recordDeclaredNames(prot) {
        let r;

        //          DECLARE   ----names----   :
        if (r = prot.match(/^\s*DECLARE\s+([A-Za-z][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z][A-Za-z0-9_]*)*)\s*:/i)) {
            r[1].split(',').map(s => s.trim()).forEach(addDeclaredName);
            return;
        }
        //          CONSTANT   ----name----
        if (r = prot.match(/^\s*CONSTANT\s+([A-Za-z][A-Za-z0-9_]*)\b/i)) {
            addDeclaredName(r[1]);
            return;
        }
        //          PROCEDURE   ----name----   ?----params----
        if (r = prot.match(/^\s*PROCEDURE\s+([A-Za-z][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?/i)) {
            addDeclaredName(r[1]);
            const params = (r[2] || '').trim();
            if (params) params.split(',').forEach(p => {
                const pm = p.match(/^\s*([A-Za-z][A-Za-z0-9_]*)/);
                if (pm) addDeclaredName(pm[1]);
            });
            return;
        }
        //          FUNCTION   ----name----   ?----params----   RETURNS
        if (r = prot.match(/^\s*FUNCTION\s+([A-Za-z][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s+RETURNS\b/i)) {
            addDeclaredName(r[1]);
            const params = (r[2] || '').trim();
            if (params) params.split(',').forEach(p => {
                const pm = p.match(/^\s*([A-Za-z][A-Za-z0-9_]*)/);
                if (pm) addDeclaredName(pm[1]);
            });
            return;
        }
    }
    function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function applyDeclaredNames(prot) {
        let out = prot;
        for (const lower in declaredNameMap) {
            const declaredName = declaredNameMap[lower];
            const re = new RegExp(`\\b${escapeRegExp(lower)}\\b`, 'gi');
            out = out.replace(re, declaredName);
        }
        return out;
    }

    // collect declared names
    normalized.forEach(({ code }) => recordDeclaredNames(code));
    // normalize every line
    for (let i = 0; i < normalized.length; i++) {
        normalized[i].code = applyDeclaredNames(normalized[i].code);
    }

    // ------------------------ Indentation ------------------------

    let indent = 0;
    const out = [];

    for (let i = 0; i < normalized.length; i++) {
        const { code, comment } = normalized[i];

        // close blocks before printing current line
        if (/^\s*ENDIF\s*$/i.test(code)) {
            indent = Math.max(0, indent - 1);
        } else if (
            /^\s*ELSE\s*$/i.test(code)         ||
            /^\s*ENDWHILE\s*$/i.test(code)     ||
            /^\s*ENDPROCEDURE\s*$/i.test(code) ||
            /^\s*ENDFUNCTION\s*$/i.test(code)  ||
            /^\s*ENDCASE\s*$/i.test(code)      ||
            /^\s*UNTIL\b/i.test(code)          ||
            /^\s*NEXT(\b|$)/i.test(code)
        ) {
            indent = Math.max(0, indent - 1);
        }

        // restore literals
        const restored = unreplace(code);

        let lineOut;
        const halfUnit = ' '.repeat(Math.floor(tabSize / 2));
        if (/^\s*THEN\s*$/i.test(code) || /^\s*ELSE\s*$/i.test(code)) {  // THEN/ELSE
            lineOut = tab.repeat(indent) + halfUnit + restored;
        } else if (/^\s*(?:[A-Za-z][A-Za-z0-9_]*|[+-]?(?:\d+(?:\.\d*)?|\.\d+)|\d+|'[^']*'|"[^"]*"|[^A-Za-z0-9\s:])\s*:\s*/i.test(restored) || /^\s*OTHERWISE\b/i.test(restored)) {  // CASE option
            const base = Math.max(0, indent - 1);
            lineOut = tab.repeat(base) + halfUnit + restored;
        } else {
            lineOut = tab.repeat(indent) + restored;
        }

        // keep inline comment with a space
        if (comment) {
            const needsSpace = lineOut && !/\s$/.test(lineOut);
            lineOut += (needsSpace ? ' ' : '') + comment.trimStart();
        }

        out.push(lineOut);

        // open blocks after printing current line
        if (
            /^\s*THEN\s*$/i.test(code)          ||
            /^\s*ELSE\s*$/i.test(code)          ||
            /^\s*WHILE\b.*\bDO\s*$/i.test(code) ||
            /^\s*FOR\b/i.test(code)             ||
            /^\s*REPEAT\s*$/i.test(code)        ||
            /^\s*PROCEDURE\b/i.test(code)       ||
            /^\s*FUNCTION\b/i.test(code)        ||
            /^\s*CASE\s+OF\b/i.test(code)
        ) indent += 1;
    }

    return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
