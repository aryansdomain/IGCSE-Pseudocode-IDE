// do multiple formatting passes over the code
function formatPseudocode(src) {
    let prev = String(src);
    for (let i = 0; i < 10; i++) { // limit to avoid infinite loops
        const next = formatOnce(prev);
        if (next === prev) return next;
        prev = next;
    }
    return prev;
}

// one formatting pass
function formatOnce(src) {
    if (typeof src !== 'string') return '';

    // ---- literal protection ----
    const lit = [];
    const protect = s => s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
        m => { lit.push(m); return `\uE000${lit.length - 1}\uE001`; });
    const restore = s => s.replace(/\uE000(\d+)\uE001/g, (_, i) => lit[+i]);

    // split off trailing // comments, but keep strings intact
    const splitComment = (line) => {
        const p = protect(line);
        const idx = p.indexOf('//');
        if (idx >= 0) {
            const leftProt = p.slice(0, idx);
            const leftRest = restore(leftProt);
            const cut = leftRest.length;
            return { code: line.slice(0, cut), comment: line.slice(cut) };
        }
        return { code: line, comment: '' };
    };

    // keywords/types uppercasing
    const kwRegex = new RegExp(
        String.raw`\b(?:PROCEDURE|FUNCTION|RETURNS|ENDPROCEDURE|ENDFUNCTION|DECLARE|CONSTANT|ARRAY|OF|INPUT|OUTPUT|CALL|IF|THEN|ELSE|ENDIF|CASE|ENDCASE|FOR|TO|STEP|NEXT|WHILE|DO|ENDWHILE|REPEAT|UNTIL|RETURN|TRUE|FALSE|DIV|MOD|AND|OR|NOT|INTEGER|REAL|BOOLEAN|CHAR|STRING)\b`,
        'gi'
    );

    // indent unit (from Ace when present)
    const getIndentUnit = () => {
        if (window.editor && window.editor.session) {
            const tabSize = window.editor.session.getTabSize();
            return ' '.repeat(tabSize);
        }
        return '    ';
    };
    const indentUnit = getIndentUnit();
    const tabSize = window.editor && window.editor.session ? window.editor.session.getTabSize() : 4;

    let lines = src.replace(/\r\n?/g, '\n').split('\n');

    // -------- First pass: normalize & split (on PROTECTED text) --------
    const normalized = [];

    // helper: does a protected snippet *start* with a statement keyword?
    const startsWithKeyword = (prot) =>
        /^\s*(OUTPUT|INPUT|DECLARE|IF|THEN|ELSE|ENDIF|FOR|WHILE|REPEAT|CASE|CALL|RETURN|CONSTANT|PROCEDURE|FUNCTION|NEXT|ENDWHILE|ENDFUNCTION|ENDPROCEDURE|ENDCASE|UNTIL)\b/i
            .test(prot);

    // helper: split a protected line at a trailing block *end* token into separate lines
    function splitTrailingTerminators(prot, outArr) {
        // order matters: grab the *first* end token we see from left to right
        const PATTERNS = [
            /\b(ENDWHILE)\b/i,
            /\b(ENDFUNCTION)\b/i,
            /\b(ENDPROCEDURE)\b/i,
            /\b(ENDCASE)\b/i,
            /\b(NEXT(?:\s+[A-Za-z][A-Za-z0-9]*)?)\b/i, // NEXT or NEXT i
            /\b(UNTIL\b\s*[^]+)$/i                      // UNTIL cond...
        ];
        for (const re of PATTERNS) {
            const m = prot.match(new RegExp(`^(.*?)(?:\\s*)${re.source}\\s*(.*)$`, re.flags));
            if (m) {
                const left  = m[1].trim();
                const token = m[m.length - 2]; // the captured end token text
                const right = m[m.length - 1].trim();
                if (left) outArr.push({ code: left, comment: '' });
                
                let tokenOut = token.toUpperCase();
                
                // Preserve loop variable after NEXT
                const mNext = token.match(/^next(\s+)([A-Za-z][A-Za-z0-9]*)$/i);
                if (mNext) tokenOut = 'NEXT' + mNext[1] + mNext[2];
                
                // Preserve the condition after UNTIL
                const mUntil = token.match(/^until\b([\s\S]*)$/i);
                if (mUntil) tokenOut = 'UNTIL' + mUntil[1];
                
                outArr.push({ code: tokenOut, comment: '' });

                if (right) outArr.push({ code: right, comment: '' });
                return true;
            }
        }
        return false;
    }

    // split a one-line WHILE/DO header + body
    function splitWhileHeaderLineProtected(prot) {
        const m = prot.match(/^\s*(WHILE\b[^]*?\bDO)\b\s*(.+)\s*$/i);
        if (!m) return [prot];
        const header = m[1];
        const tail   = m[2];
        // Only split if tail begins with a statement keyword or an end token
        if (startsWithKeyword(tail)) return [header, tail];
        // else keep as-is
        return [prot];
    }

    // split a one-line FOR header + body
    function splitForHeaderLineProtected(prot) {
        const m = prot.match(/^\s*(FOR\b\s+[A-Za-z][A-Za-z0-9]*\s*(?:←|<-)\s*[^]*?\bTO\b\s*[^]*?(?:\s+STEP\s*[^]*?)?)\s+(.+)\s*$/i);
        if (!m) return [prot];
        const header = m[1];
        const tail   = m[2];
        if (startsWithKeyword(tail)) return [header, tail];
        return [prot];
    }

    // split a PROCEDURE header + trailing code (always split after the param list)
    function splitProcedureHeaderProtected(prot) {
        // PROCEDURE <name> ( <params>? )   [ tail... ]
        const m = prot.match(/^\s*(PROCEDURE\s+[A-Za-z][A-Za-z0-9_]*\s*(?:\([^()]*\))?)\s+(.+)\s*$/i);
        if (!m) return [prot];
        const header = m[1];
        const tail   = m[2];
        // Always split; tail will be further broken (OUTPUT/…/ENDPROCEDURE) later
        return [header, tail];
    }

    // split a FUNCTION header + trailing code (stop at RETURNS <TYPE>)
    function splitFunctionHeaderProtected(prot) {
        // FUNCTION <name>(...) RETURNS <TYPE>   [ tail... ]
        const m = prot.match(/^\s*(FUNCTION\s+[A-Za-z][A-Za-z0-9_]*\s*(?:\([^()]*\))?\s+RETURNS\s+[A-Za-z]+)\s+(.+)\s*$/i);
        if (!m) return [prot];
        const header = m[1];
        const tail   = m[2];
        return [header, tail];
    }

    for (let raw of lines) {
        let { code, comment } = splitComment(raw);
        const hadComment = !!comment;

        code = code.replace(/\t/g, ' ');
        code = protect(code);

        // --- 1) If some statement precedes a FOR/WHILE/PROC/FUNC, split it off ---
        // a) split " ... FOR ..."
        {
            const m = code.match(/^(.*\S)\s+\bFOR\b\s*(.*)$/i);
            if (m) {
                let leftProt  = m[1];
                let rightProt = 'FOR ' + m[2].trim();

                leftProt = leftProt
                    .replace(/\s*,\s*/g, ', ')
                    .replace(/\s*(←|<-)\s*/g, ' $1 ')
                    .replace(/\s*:\s*/g, ' : ')
                    .trim();
                leftProt = leftProt.replace(kwRegex, t => t.toUpperCase());

                normalized.push({ code: leftProt, comment: '' });
                code = rightProt;
            }
        }
        // b) split " ... WHILE ..."
        {
            const m = code.match(/^(.*\S)\s+\bWHILE\b\s*(.*)$/i);
            if (m) {
                let leftProt  = m[1];
                let rightProt = 'WHILE ' + m[2].trim();
                leftProt = leftProt.replace(/\s*,\s*/g, ', ')
                                   .replace(/\s*(←|<-)\s*/g, ' $1 ')
                                   .replace(/\s*:\s*/g, ' : ')
                                   .trim();
                leftProt = leftProt.replace(kwRegex, t => t.toUpperCase());
                normalized.push({ code: leftProt, comment: '' });
                code = rightProt;
            }
        }
        // c) split " ... PROCEDURE ..." / " ... FUNCTION ..."
        {
            const m = code.match(/^(.*\S)\s+\b(PROCEDURE|FUNCTION)\b\s*(.*)$/i);
            if (m) {
                let leftProt  = m[1];
                let rightProt = m[2].toUpperCase() + ' ' + m[3].trim();
                leftProt = leftProt.replace(/\s*,\s*/g, ', ')
                                   .replace(/\s*(←|<-)\s*/g, ' $1 ')
                                   .replace(/\s*:\s*/g, ' : ')
                                   .trim();
                leftProt = leftProt.replace(kwRegex, t => t.toUpperCase());
                normalized.push({ code: leftProt, comment: '' });
                code = rightProt;
            }
        }

        // --- 2) Split "IF ... THEN ..." into two lines ---
        if (/^\s*IF\b/i.test(code) && /\bTHEN\b/i.test(code)) {
            const m = code.match(/^\s*IF\s+(.+?)\s*\bTHEN\b\s*(.*)$/i);
            if (m) {
                const condProt  = m[1].trim();
                const afterProt = m[2].trim();
                normalized.push({ code: 'IF ' + condProt, comment: '' });
                normalized.push({ code: 'THEN', comment: '' });
                if (afterProt) normalized.push({ code: afterProt, comment: '' });
                continue;
            }
        }

        // --- 3) Ensure "ELSE ..." becomes its own line ---
        {
            const m = code.match(/^\s*ELSE\b\s*(.*)$/i);
            if (m) {
                const restProt = m[1].trim();
                normalized.push({ code: 'ELSE', comment: '' });
                if (restProt) normalized.push({ code: restProt, comment: '' });
                continue;
            }
        }

        // --- 4) Split inline ELSE/ENDIF/NEXT/END*/UNTIL that appear after a statement ---
        // (We’re still on PROTECTED text, so strings are safe.)
        if (/\bELSE\b/i.test(code) && !/^\s*ELSE\b/i.test(code)) {
            const m = code.match(/^(.*?)(?:\s*)\bELSE\b\s*(.*)$/i);
            if (m) {
                const left  = m[1].trim();
                const right = m[2].trim();
                if (left) normalized.push({ code: left, comment: '' });
                normalized.push({ code: 'ELSE', comment: '' });
                if (right) code = right; else continue;
            }
        }
        if (/\bENDIF\b/i.test(code) && !/^\s*ENDIF\s*$/i.test(code)) {
            const m = code.match(/^(.*?)(?:\s*)\bENDIF\b\s*(.*)$/i);
            if (m) {
                const left  = m[1].trim();
                const right = m[2].trim();
                if (left)  normalized.push({ code: left,  comment: '' });
                normalized.push({ code: 'ENDIF', comment: '' });
                if (right) normalized.push({ code: right, comment: '' });
                continue;
            }
        }
        // put REPEAT on its own line if there's code after it
        {
            const m = code.match(/^\s*REPEAT\b\s*(.*)$/i);
            if (m) {
            const tail = m[1].trim();
            normalized.push({ code: 'REPEAT', comment: '' });
            if (tail) normalized.push({ code: tail, comment: '' });
            continue;
            }
        }
        // NEW: split other terminators if they appear after code
        {
            const tmp = [];
            if (splitTrailingTerminators(code, tmp)) {
                normalized.push(...tmp);
                continue;
            }
        }

        // --- 5) Split one-line FOR/WHILE headers from bodies ---
        {
            const parts = splitForHeaderLineProtected(code);
            if (parts.length > 1) {
                normalized.push({ code: parts[0], comment: '' });
                // The remainder might still have NEXT/END..., split again
                let rest = parts[1];
                const tmp = [];
                if (!splitTrailingTerminators(rest, tmp)) {
                    normalized.push({ code: rest, comment: '' });
                } else {
                    normalized.push(...tmp);
                }
                continue;
            }
        }
        {
            const parts = splitWhileHeaderLineProtected(code);
            if (parts.length > 1) {
                normalized.push({ code: parts[0], comment: '' });
                let rest = parts[1];
                const tmp = [];
                if (!splitTrailingTerminators(rest, tmp)) {
                    normalized.push({ code: rest, comment: '' });
                } else {
                    normalized.push(...tmp);
                }
                continue;
            }
        }
        {
            const parts = splitProcedureHeaderProtected(code);
            if (parts.length > 1) {
              normalized.push({ code: parts[0], comment: '' });
              let rest = parts[1];
              const tmp = [];
              if (!splitTrailingTerminators(rest, tmp)) {
                normalized.push({ code: rest, comment: '' });
              } else {
                normalized.push(...tmp);
              }
              continue;
            }
        }
        {
            const parts = splitFunctionHeaderProtected(code);
            if (parts.length > 1) {
                normalized.push({ code: parts[0], comment: '' });
                normalized.push({ code: parts[1], comment: '' });
                continue;
            }
        }

        // ==== protect assignment arrows so generic operator rules don't split them ====
        code = code.replace(/\s*(?:←|<-)\s*/g, ' \uE100 ');

        // --- Tidy spacing on protected text ---
        code = code
            .replace(/\s*,\s*/g, ', ')
            .replace(/\s*:\s*/g, ' : ')
            // Handle arithmetic operators, but avoid spacing unary minus
            .replace(/\s*(\+|\*|\/|\^)\s*/g, ' $1 ')
            // Handle binary minus (space before and after, but not for unary minus)
            .replace(/(?<=\S)\s*-\s*(?=\S)/g, ' - ')
            .trim();

        // keep unary minus tight after STEP and at expression starts/after delimiters
        code = code
            .replace(/\bSTEP\s*-\s+(?=[0-9.])/gi, 'STEP -')                // STEP - 0.5 -> STEP -0.5
            .replace(/(^|\(|,|=|\bTO\b)\s*-\s+(?=[0-9.])/gi, (m, p1) => p1 + '-'); // (- 3 -> (-3, etc.

        // 1) fuse split relational operators (arrow hidden)
        code = code.replace(/<\s*=/g, '<=')
                   .replace(/>\s*=/g, '>=')
                   .replace(/<\s*>/g, '<>');

        // protect composites so singletons don’t split them again
        code = code.replace(/<=/g, '\uE201')
                   .replace(/>=/g, '\uE202')
                   .replace(/<>/g, '\uE203');

        // 2) space single-char relationals, then restore composites
        code = code.replace(/\s*(=|<|>)\s*/g, ' $1 ')
                   .replace(/\uE201/g, '<=')
                   .replace(/\uE202/g, '>=')
                   .replace(/\uE203/g, '<>')
                   .replace(/\s*(<>|<=|>=)\s*/g, ' $1 ');

        // ensure a space after certain keywords before '('
        code = code.replace(/\b(NOT|IF|WHILE|RETURN)\s*\(/gi, '$1 (');

        // brackets/calls
        code = code.replace(/\b([A-Za-z][A-Za-z0-9_]*)\s+\(/g, '$1(')
                   .replace(/\(\s+/g, '(')
                   .replace(/\s+\)/g, ')')
                   .replace(/\b([A-Za-z][A-Za-z0-9_]*)\s+\[/g, '$1[')
                   .replace(/\[\s+/g, '[')
                   .replace(/\s+\]/g, ']');

        // normalize array bounds "1 : 5" -> "1:5"
        code = code.replace(/\[([^\[\]]+)\]/g, (_, inner) => {
            const t = inner.replace(/\s*,\s*/g, ', ')
                           .replace(/\s*:\s*/g, ':')
                           .trim();
            return '[' + t + ']';
        });

        // restore arrows, enforce one space around
        code = code.replace(/\uE100/g, '<-')
                   .replace(/\s*(?:←|<\s*-\s*)\s*/g, ' <- ');

        // collapse stray multi-spaces
        code = code.replace(/ {2,}/g, ' ');

        // uppercase keywords/types
        code = code.replace(kwRegex, t => t.toUpperCase());

        normalized.push({ code, comment: hadComment ? comment : '' });
    }

    // -------- Second pass: indentation --------
    let indent = 0;
    const out = [];

    const reThen      = /^\s*THEN\s*$/i;
    const reElse      = /^\s*ELSE\s*$/i;
    const reEndIf     = /^\s*ENDIF\s*$/i;
    const reEndWhile  = /^\s*ENDWHILE\s*$/i;
    const reEndProc   = /^\s*ENDPROCEDURE\s*$/i;
    const reEndFunc   = /^\s*ENDFUNCTION\s*$/i;
    const reEndCase   = /^\s*ENDCASE\s*$/i;
    const reUntil     = /^\s*UNTIL\b/i;
    const reNext      = /^\s*NEXT(\b|$)/i;

    const reProc      = /^\s*PROCEDURE\b/i;
    const reFunc      = /^\s*FUNCTION\b/i;
    const reWhileDo   = /^\s*WHILE\b.*\bDO\s*$/i;
    const reFor       = /^\s*FOR\b/i;
    const reRepeat    = /^\s*REPEAT\s*$/i;
    const reCase      = /^\s*CASE\s+OF\b/i;
    const reCaseOption = /^\s*\d+\s*:\s*/i; // matches CASE options like "1 : OUTPUT 1"

    for (let i = 0; i < normalized.length; i++) {
        let codeProt = normalized[i].code;
        const comment = normalized[i].comment;
        
        // close blocks before printing current line
        if (reEndIf.test(codeProt)) {
            indent = Math.max(0, indent - 1);
        } else if (
            reElse.test(codeProt) ||
            reEndWhile.test(codeProt) ||
            reEndProc.test(codeProt) ||
            reEndFunc.test(codeProt) ||
            reEndCase.test(codeProt) ||
            reUntil.test(codeProt) ||
            reNext.test(codeProt)
        ) {
            indent = Math.max(0, indent - 1);
        }

        // restore literals and final small polish
        let restored = restore(codeProt);
        let p = protect(restored);
        p = p.replace(/<\s*=/g, '<=')
             .replace(/>\s*=/g, '>=')
             .replace(/<\s*>/g, '<>')
             .replace(/<=/g, '\uE201')
             .replace(/>=/g, '\uE202')
             .replace(/<>/g, '\uE203')
             .replace(/\s*(=|<|>)\s*/g, ' $1 ')
             .replace(/\uE201/g, '<=')
             .replace(/\uE202/g, '>=')
             .replace(/\uE203/g, '<>')
             .replace(/\s*(<>|<=|>=)\s*/g, ' $1 ')
             .replace(/\s*(?:←|<\s*-\s*)\s*/g, ' <- ')
             .replace(/ {2,}/g, ' ')
             .replace(/\b(NOT|IF|WHILE|RETURN)\s*\(/gi, '$1 (')
             // keep unary minus tight after STEP and at expression starts/after delimiters
             .replace(/\bSTEP\s*-\s+(?=[0-9.])/gi, 'STEP -')
             .replace(/(^|\(|,|=|\bTO\b)\s*-\s+(?=[0-9.])/gi, (m, p1) => p1 + '-');
        restored = restore(p);

        let lineOut;
        if (reThen.test(codeProt) || reElse.test(codeProt) || reCaseOption.test(codeProt)) {
            const halfUnit  = ' '.repeat(Math.floor(tabSize / 2));          // half the tab size
            lineOut = indentUnit.repeat(indent) + halfUnit + restored;
        } else {
            lineOut = indentUnit.repeat(indent) + restored;
        }

        // keep inline comment with a space
        if (comment) {
            const needsSpace = lineOut && !/\s$/.test(lineOut);
            lineOut += (needsSpace ? ' ' : '') + comment.trimStart();
        }

        out.push(lineOut);

        // open blocks after printing current line
        if (
            reThen.test(codeProt) ||
            reElse.test(codeProt) ||
            reWhileDo.test(codeProt) ||
            reFor.test(codeProt) ||
            reRepeat.test(codeProt) ||
            reProc.test(codeProt) ||
            reFunc.test(codeProt) ||
            reCase.test(codeProt)
        ) {
            indent += 1;
        }
    }

    return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

// ----------------------------
// Editor helpers + wiring
// ----------------------------
function getEditorCode() {
    if (window.editor && typeof window.editor.getValue === 'function') {
        return window.editor.getValue(); // Ace
    }
    const ta = document.getElementById('code');
    return ta ? ta.value : '';
}

function setEditorCode(val) {
    if (window.editor && typeof window.editor.setValue === 'function') {
        window.editor.setValue(val, -1); // keep viewport, move cursor
        window.editor.clearSelection();
        return;
    }
    const ta = document.getElementById('code');
    if (ta) ta.value = val;
}

function wireFormatterButton() {
    const btn = document.getElementById('btn-format') || document.querySelector('[data-action="format"]');
    if (!btn) return;
    if (btn.__formatterBound) return; // avoid double-binding

    btn.__formatterBound = true;
    btn.addEventListener('click', () => {
        try {
            const before = getEditorCode();
            const after = formatPseudocode(before);
            setEditorCode(after);
        } catch (e) {
            console.error('Format error:', e);
            alert('Format error: ' + (e.message || e));
        }
    });
}

// Expose (optional, for debugging)
window.pseudoFormatter = { formatPseudocode, wireFormatterButton, getEditorCode, setEditorCode };

// Auto-wire on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireFormatterButton, { once: true });
} else {
    wireFormatterButton();
}
