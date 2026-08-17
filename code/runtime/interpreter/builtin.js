import {
    assertNum, assertInt, assertBool, assertString, assertCompareCompatible,
    throwErr, currentLineNum, findPos, lines, assertArgCount
} from './error.js';

import { toString } from './expressions.js';

// builtin operations (ROUND, SUBSTRING, etc.)
export const BUILTIN = {
    RANDOM() {
        assertArgCount('RANDOM', 0, arguments.length);

        const N = Number.MAX_SAFE_INTEGER;
        return Math.floor(Math.random() * (N + 1)) / N; // includes 0 and 1
    },

    ROUND(n, p, nText = String(n), pText = String(p)) {
        assertArgCount('ROUND', 2, arguments.length);
        assertNum('ROUND argument', n, nText);
        assertInt('ROUND argument', p, pText);

        if (p < 0) {
            const pos = findPos(lines[currentLineNum - 1].text, pText);
            throwErr('ValueError',
                     'ROUND places must be nonnegative',
                     currentLineNum, pos.col, pos.len);
        }

        const f = Math.pow(10, p);
        return Math.round(n * f) / f;
    },

    LENGTH(s, sText = String(s)) {
        assertArgCount('LENGTH', 1, arguments.length);
        assertString('LENGTH argument', s, sText);

        return s.length;
    },

    LCASE(s, sText = String(s)) {
        assertArgCount('LCASE', 1, arguments.length);
        assertString('LCASE argument', s, sText);

        return s.toLowerCase();
    },
    UCASE(s, sText = String(s)) {
        assertArgCount('UCASE', 1, arguments.length);
        assertString('UCASE argument', s, sText);

        return s.toUpperCase();
    },

    SUBSTRING(s, start, len, sText = String(s), startText = String(start), lenText = String(len)) {
        assertArgCount('SUBSTRING', 3, arguments.length);
        assertString('SUBSTRING argument', s, sText);
        assertInt('SUBSTRING argument', start, startText);
        assertInt('SUBSTRING argument', len,   lenText);

        if (start <= 0) {
            const pos = findPos(lines[currentLineNum - 1].text, startText);
            throwErr('ValueError',
                     'SUBSTRING start must be positive',
                     currentLineNum, pos.col, pos.len);
        }
        if (len <= 0) {
            const pos = findPos(lines[currentLineNum - 1].text, lenText);
            throwErr('ValueError',
                     'SUBSTRING length must be positive',
                     currentLineNum, pos.col, pos.len);
        }

        return s.substring(start - 1, start - 1 + len);
    },

    DIV(a, b, aText = String(a), bText = String(b)) {
        assertArgCount('DIV', 2, arguments.length);
        assertInt('DIV argument', a, aText);
        assertInt('DIV argument', b, bText);

        if (b === 0) {
            const leftPos  = findPos(lines[currentLineNum - 1].text, aText);
            const rightPos = findPos(lines[currentLineNum - 1].text, bText);
            throwErr('ZeroDivisionError',
                     'division by zero',
                     currentLineNum, leftPos.col, rightPos.col + rightPos.len - leftPos.col);
        }

        return Math.trunc(a / b);
    },

    MOD(a, b, aText = String(a), bText = String(b)) {
        assertArgCount('MOD', 2, arguments.length);
        assertInt('MOD argument', a, aText);
        assertInt('MOD argument', b, bText);

        if (b === 0) {
            const leftPos  = findPos(lines[currentLineNum - 1].text, aText);
            const rightPos = findPos(lines[currentLineNum - 1].text, bText);
            throwErr('ZeroDivisionError',
                     'division by zero',
                     currentLineNum, leftPos.col, rightPos.col + rightPos.len - leftPos.col);
        }

        return a % b;
    }
};

// numeric operations and concatenation (+, -, *, /, ^)
export const NUM = {
    CONCAT: (a, b) => {
        return toString(a) + toString(b);
    },

    ADD: (a, b, aText = String(a), bText = String(b)) => {
        if (typeof a === 'string' || typeof b === 'string') { // concatenation
            return toString(a) + toString(b);
        }
        
        assertNum('+ argument', a, aText);
        assertNum('+ argument', b, bText);

        return a + b;
    },

    SUB: (a, b, aText = String(a), bText = String(b)) => {
        assertNum('- argument', a, aText);
        assertNum('- argument', b, bText);

        return a - b;
    },

    MUL: (a, b, aText = String(a), bText = String(b)) => {
        assertNum('* argument', a, aText);
        assertNum('* argument', b, bText);

        return a * b;
    },

    DIV: (a, b, aText = String(a), bText = String(b)) => {
        assertNum('/ argument', a, aText);
        assertNum('/ argument', b, bText);
        if (b === 0) {
            const aPos = findPos(lines[currentLineNum - 1].text, aText);
            const bPos = findPos(lines[currentLineNum - 1].text, bText);
            throwErr('ZeroDivisionError',
                     'division by zero',
                     currentLineNum, aPos.col, bPos.col + bPos.len - aPos.col);
        }

        return a / b;
    },

    POW: (a, b, aText = String(a), bText = String(b)) => {
        assertNum('base', a, aText);
        assertNum('exponent', b, bText);
        if (a == 0 && b <= 0) {
            const aPos = findPos(lines[currentLineNum - 1].text, aText);
            const bPos = findPos(lines[currentLineNum - 1].text, bText);
            throwErr('ZeroDivisionError',
                     'division by zero',
                     currentLineNum, aPos.col, bPos.col + bPos.len - aPos.col);
        }

        return Math.pow(a, b);
    }
};

// comparison operations (=, <>, <, >, <=, >=)
export const CMP = {
    EQ(a, b, aText = '', bText = '') {
        const line = lines[currentLineNum - 1].text;

        assertCompareCompatible(a, b, aText, bText, line, '=');

        return a === b;
    },

    NE(a, b, aText = '', bText = '') {
        const line = lines[currentLineNum - 1].text;

        assertCompareCompatible(a, b, aText, bText, line, '<>');

        return a !== b;
    },

    LT(a, b, aText = '', bText = '') {
        const line = lines[currentLineNum - 1].text;

        assertCompareCompatible(a, b, aText, bText, line, '<');
        if (typeof a !== 'number' && typeof a !== 'string') {
            const col = line.indexOf('<');
            throwErr('TypeError',
                     'expected numbers or strings in comparison',
                     currentLineNum, col, 1);
        }

        return a < b;
    },

    GT(a, b, aText = '', bText = '') {
        const line = lines[currentLineNum - 1].text;

        assertCompareCompatible(a, b, aText, bText, line, '>');
        if (typeof a !== 'number' && typeof a !== 'string') {
            const col = line.indexOf('>');
            throwErr('TypeError',
                     'expected numbers or strings in comparison',
                     currentLineNum, col, 1);
        }

        return a > b;
    },

    LE(a, b, aText = '', bText = '') {
        const line = lines[currentLineNum - 1].text;

        assertCompareCompatible(a, b, aText, bText, line, '<=');
        if (typeof a !== 'number' && typeof a !== 'string') {
            const col = line.indexOf('<=');
            throwErr('TypeError',
                     'expected numbers or strings in comparison',
                     currentLineNum, col, 2);
        }

        return a <= b;
    },

    GE(a, b, aText = '', bText = '') {
        const line = lines[currentLineNum - 1].text;

        assertCompareCompatible(a, b, aText, bText, line, '>=');
        if (typeof a !== 'number' && typeof a !== 'string') {
            const col = line.indexOf('>=');
            throwErr('TypeError',
                     'expected numbers or strings in comparison',
                     currentLineNum, col, 2);
        }

        return a >= b;
    }
};

// logical operations (AND, OR, NOT)
export const LOG = {
    AND: (a, b, aText = String(a), bText = String(b)) => {
        assertBool('AND argument', a, aText);
        assertBool('AND argument', b, bText);

        return a && b;
    },

    OR: (a, b, aText = String(a), bText = String(b)) => {
        assertBool('OR argument', a, aText);
        assertBool('OR argument', b, bText);

        return a || b;
    },

    NOT: (a, aText = String(a)) => {
        assertBool('NOT argument', a, aText);

        return !a;
    }
};
