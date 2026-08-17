export function format(code, tabSize) {
    let prev, next = String(code);

    do {
        prev = next;
        next = formatOnce(prev, tabSize);
    } while (next !== prev);
    return next;
}

// ------------------------ Regexes ------------------------

// end of a block statements, but with something before/after
const badEndRegexes = [
    /^(.*?)\s*\b(ENDWHILE)\b\s*(.*)$/i,
    /^(.*?)\s*\b(ENDFUNCTION)\b\s*(.*)$/i,
    /^(.*?)\s*\b(ENDPROCEDURE)\b\s*(.*)$/i,
    /^(.*?)\s*\b(ENDCASE)\b\s*(.*)$/i,
    /^(.*?)\s*\b(ENDIF)\b\s*(.*)$/i,
    /^(.*?)\s*\b(NEXT(?:\s+[A-Za-z][A-Za-z0-9_]*)?)\b\s*(.*)$/i,
    /^(.*?)\s*\b(UNTIL\b\s*[^]+)\s*(.*)$/i
];

const startsWithKeywordRegex = new RegExp(
    '^\\s*(?:' +
        'ARRAY|CALL|CASE|CONSTANT|DECLARE|DO|ELSE|' +
        'ENDCASE|ENDFUNCTION|ENDIF|ENDPROCEDURE|ENDWHILE|' +
        'FOR|FUNCTION|IF|INPUT|NEXT|OF|OTHERWISE|' +
        'OUTPUT|PROCEDURE|REPEAT|RETURN|RETURNS|STEP|' +
        'THEN|TO|UNTIL|WHILE' +
    ')\\b', 'i'
);

const KEYWORDS = 'IF|THEN|ELSE|ENDIF|CASE|OF|OTHERWISE|ENDCASE|FOR|TO|STEP|NEXT|WHILE|DO|ENDWHILE|REPEAT|UNTIL|PROCEDURE|FUNCTION|RETURNS|RETURN|CALL|ENDPROCEDURE|ENDFUNCTION|INPUT|OUTPUT|OPENFILE|READFILE|WRITEFILE|CLOSEFILE|DECLARE|CONSTANT|TRUE|FALSE|AND|OR|NOT';
const TYPES    = 'INTEGER|REAL|BOOLEAN|CHAR|STRING|ARRAY|READ|WRITE';
const BUILTINS = 'ROUND|RANDOM|LENGTH|LCASE|UCASE|SUBSTRING|DIV|MOD';
const keywordRegex = new RegExp(`\\b(?:${KEYWORDS}|${TYPES}|${BUILTINS})\\b`, 'gi');

// ------------------------ Utilities ------------------------

// seperate line into code and comment
function splitLine(line) {
    const replaced = replace(line);
    const commentCol = replaced.indexOf('//');
    if (commentCol >= 0) {
        const code    = unreplace(replaced.slice(0, commentCol));
        const comment = unreplace(replaced.slice(   commentCol));
        return { code, comment };
    }
    return { code: line, comment: '' };
}


// split starting keyword in a line with text after
function seperateStartKeyword(line) {
    let r;
    // while, proc/func, for
    if (r = line.match(/^\s*(FOR\b\s+[A-Za-z][A-Za-z0-9_]*\s*(?:←|<-|<--)\s*.*?\bTO\b\s+(?:(?!\s+STEP\b).)*?(?:\s+STEP\s+\S.*?)?)\s+(?!STEP\b)(.+)/i)
         || line.match(/^\s*(WHILE\b.*?\bDO)\s+(.+)/i)
         || line.match(/^\s*(CASE\b.*?\bOF)\s+(.+)/i)
         || line.match(/^\s*(PROCEDURE\s+[A-Za-z][A-Za-z0-9_]*\s*(?:\([^()]*\))?)\s+(.+)/i)
         || line.match(/^\s*(FUNCTION\s+[A-Za-z][A-Za-z0-9_]*\s*(?:\([^()]*\))?\s+RETURNS\s+[A-Za-z]+)\s+(.+)/i))
        return [r[1].trim(), r[2]];
    return null;
}

// split ending keyword in a line with text before or after
function seperateEndKeyword(line, out) {
    let r; // regex match result

    for (const regex of badEndRegexes) {
        if (r = line.match(regex)) {
            const left  = r[1].trim();
            const right = r[3].trim();

            if (left)  out.push({ code: left,  comment: '' }); // push before on prev line
                       out.push({ code: r[2],  comment: '' }); // push ending block text
            if (right) out.push({ code: right, comment: '' }); // bush after  on next line
            return true;
        }
    }
    return false;
}


// check if a line is a case label
function hasCaseLabel(line) {
    if (startsWithKeywordRegex.test(line)) return false;
    let depth = 0;
    for (const c of line) {
             if (c === '[' || c === '(') depth++;
        else if (c === ']' || c === ')') depth--;
        else if (c === ':' && depth === 0) return true; // has : outside of [()]
    }
    return false;
}

// ------------------------ Replacing ------------------------

const LITERAL_START = '';
const LITERAL_END   = '';
const ARROW_MARKER   = '';

let replaced = [];

// protect strings temporarily so they are not affected by formatting
function replace(text) {
    return String(text).replace(/"[^"]*"|'[^']*'/g, str => {
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
    const tab  = ' '.repeat(           tabSize     );
    const half = ' '.repeat(Math.floor(tabSize / 2));

    replaced = [];

    // protect strings, normalize tabs
    for (let i = 0; i < lines.length; i++) {
        let { code, comment } = splitLine(lines[i]);
        code = replace(code.replace(/\t/g, tab));
        lines[i] = { code, comment };
    }

    // ------------------------ Seperate Multi-Statement Lines ------------------------

    for (let i = 0; i < lines.length; ) {
        let { code, comment } = lines[i];
        let r;
        const newLines = [];

        const pushEnd = (end) => {
            end = end.trim();
            if (!end) return;
            if (!seperateEndKeyword(end, newLines)) newLines.push({ code: end, comment: '' });
        };

        //                   -left-     -IF|FOR  !      READ|WRITE   )|WHILE|REPEAT|CASE|PROCEDURE|FUNCTION-     rest
        if (r = code.match(/^(.*\S)\s+\b(IF|FOR(?!\s+(?:READ|WRITE)\b)|WHILE|REPEAT|CASE|PROCEDURE|FUNCTION)\b\s*(.*)$/i)) {
            newLines.push({ code: r[1], comment: '' });
            code = r[2] + ' ' + r[3].trim();
        }

        //                      -IF  cond-   -THEN-     aft.
        if (r = code.match(/^\s*(IF\s+.+?)\s*(THEN)\b\s*(.*)$/i)) {
            newLines.push({ code: r[1].trim(), comment: '' });
            newLines.push({ code: r[2]       , comment: '' });
            pushEnd(r[3]);
        }

        //                           -THEN|ELSE|REPEAT-     aft.
        else if (r = code.match(/^\s*(THEN|ELSE|REPEAT)\b\s*(.*)$/i)) {
            newLines.push({ code: r[1], comment: '' });
            pushEnd(r[2]);
        }

        //                         befo.     -ELSE|ENDIF-     aft.
        else if ((r = code.match(/^(.*?)\s+\b(ELSE|ENDIF)\b\s*(.*)$/i)) && r[1].trim()) {
            newLines.push({ code: r[1].trim(), comment: '' });
            newLines.push({ code: r[2]       , comment: '' });
            pushEnd(r[3]);
        }

        // seperate start block keyword from a same line block
        else if (!seperateEndKeyword(code, newLines)) {
            const split = seperateStartKeyword(code);
            if (split) { //   split needed
                newLines.push({ code: split[0], comment: '' }); // start keyword on own line
                pushEnd(split[1]);                              // trailing text on new lines
            } else {    // no split needed
                newLines.push({ code, comment });
                comment = '';
            }
        }

        // add comment
        if (comment && newLines.length > 0 && !newLines[newLines.length - 1].comment) {
            newLines[newLines.length - 1].comment = comment;
        }

        lines.splice(i, 1, ...newLines); // add to lines
        i += newLines.length;
    }

    // one-line replacing
    for (let i = 0; i < lines.length; i++) {
        let line = String(lines[i].code).trim();

        line = line.replace(/\s*(?:←|<--|<-)\s*/g, ARROW_MARKER); // normalize and protect arrows
        line = line
            .replace(/\s*,\s*/g, ', ' ) // comma spacing
            .replace(/\s*:\s*/g, ' : ') // colon spacing
            .replace(/\s*([*\/\^])\s*/g,                          ' $1 ') // */^ spacing
            .replace(/(?<![eE])\s*\+\s*/g,                        ' + ' ) // + spacing
            .replace(/(?<=[A-Za-z0-9_\)\]])(?<![eE])-\s*(?=\S)/g, ' - ' ) // - spacing
            .replace(/[<>]\s*=|<\s*>/g, m => m.replace(/\s/g, '')) // join <>, <=, >= (so next replace can run)
            .replace(/\s*(<>|<=|>=|=|<|>)\s*/g, ' $1 ') // spaces next to comp ops
            .replace(/\b(AND|OR|NOT|IF|WHILE|RETURN)\s*\(/gi, '$1 (') // keywords before (
            .replace(/\b(FUNCTION|PROCEDURE)\s+([A-Za-z][A-Za-z0-9_]*)\s+\(/gi, '$1 $2(') // func/proc declarations
            .replace(/\(\s+/g,    '(') // paren   open
            .replace(/\s+\)/g,    ')') // paren   close
            .replace(/\s+\[\s+/g, '[') // bracket open
            .replace(/\s+\]/g,    ']') // bracket close
            .replace(/\b(STEP|TO)\s*-\s+(?=[0-9.])/gi, '$1 -') // STEP/TO next to minus
            .replace(/\[([^\[\]]+)\]/g, (_, s) =>'[' + s.replace(/\s*,\s*/g, ', ')
                                                        .replace(/\s*:\s*/g, ':').trim() + ']') // comma, colon spacing inside brackets
            .replace(/ {2,}/g,  ' '); // too many spaces

        line = line.replace(//g, ' <- '); // unprotect arrows
        lines[i].code = line.trim();
    }

    // ------------------------ Normalize Declared Names ------------------------

    const names = Object.create(null);

    function addName(name) {
        const lower = name.toLowerCase();
        if (!names[lower]) names[lower] = name;
    }

    // get all declared names
    for (const line of lines) {
        let r; // regex match result

        //                         ? DECLARE|CONSTANT    names
        if (r = line.code.match(/^(?:DECLARE|CONSTANT)\s+(.+?)$/i)) {
            r[1].split(',').forEach(s => {
                const m = s.trim().match(/^[A-Za-z][A-Za-z0-9_]*/);
                if (m) addName(m[0]);
            });
            continue;
        }

        //                         ? PROCEDURE|FUNCTION    ----------name---------
        if (r = line.code.match(/^(?:PROCEDURE|FUNCTION)\s+([A-Za-z][A-Za-z0-9_]*)\b/i)) {
            addName(r[1]);

            // add params
            //                               (-params )
            const params = line.code.match(/\(([^)]*)\)/);
            if (params) params[1].split(',').forEach(param => {
                const r = param.match(/^\s*([A-Za-z][A-Za-z0-9_]*)/);
                if (r) addName(r[1]);
            });
            continue;
        }
    }

    // normalize case (only if keyword is not a declared name)
    for (const line of lines) {
        line.code = line.code.replace(/[A-Za-z][A-Za-z0-9_]*/g, word => {
            const declared = names[word.toLowerCase()];
            if (declared) return declared;
            return word.replace(keywordRegex, kw => kw.toUpperCase());
        });
    }

    // ------------------------ Final Cleanup & Indentation ------------------------

    let indent = 0;
    const formatted = [];

    for (const { code, comment } of lines) {
        // end block
        if (
                   /^\s*ENDIF\s*$/i.test(code) ||
                    /^\s*ELSE\s*$/i.test(code) ||
                /^\s*ENDWHILE\s*$/i.test(code) ||
            /^\s*ENDPROCEDURE\s*$/i.test(code) ||
             /^\s*ENDFUNCTION\s*$/i.test(code) ||
                 /^\s*ENDCASE\s*$/i.test(code) ||
                     /^\s*UNTIL\b/i.test(code) ||
                  /^\s*NEXT(\b|$)/i.test(code)
        ) indent = Math.max(0, indent - 1);

        const unreplaced = unreplace(code);

        // add indentation
        let lineOut;
        if (/^\s*THEN\s*$/i.test(code) || /^\s*ELSE\s*$/i.test(code)) {   // if; half indent
            lineOut = tab.repeat(indent)                  + half + unreplaced;
        } else if (hasCaseLabel(code) || /^\s*OTHERWISE\b/i.test(code)) { // case; half indent
            lineOut = tab.repeat(Math.max(0, indent - 1)) + half + unreplaced;
        } else {                                                          // regular
            lineOut = tab.repeat(indent)                         + unreplaced;
        }

        // add comment
        if (comment) {
            if (!lineOut || /\s$/.test(lineOut)) lineOut +=       comment.trimStart(); // empty/whitespace-only line: no space needed
            else                                 lineOut += ' ' + comment.trimStart(); // code line: add space before comment
        }

        formatted.push(lineOut);

        // start block
        if (
                     /^\s*THEN\s*$/i.test(code) ||
                     /^\s*ELSE\s*$/i.test(code) ||
            /^\s*WHILE\b.*\bDO\s*$/i.test(code) ||
                        /^\s*FOR\b/i.test(code) ||
                   /^\s*REPEAT\s*$/i.test(code) ||
                  /^\s*PROCEDURE\b/i.test(code) ||
                   /^\s*FUNCTION\b/i.test(code) ||
                  /^\s*CASE\s+OF\b/i.test(code)
        ) indent++;
    }
    return formatted.join('\n');
}