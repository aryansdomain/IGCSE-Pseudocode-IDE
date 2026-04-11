import { throwErr, currentLineNum, assertInt } from './error.js';
import { getDeclaredType }                     from './scope.js';

const ARRAY_SIZE_LIMIT = 1000000; // 1 million

export function isArray(scope, name) {
    const type = getDeclaredType(scope, name);
    if (type == null) return false;
    return String(type).toUpperCase().startsWith('ARRAY');
}


export function arrMake(l1, u1, l2, u2, pos = {}) {
    const { col = '', len = '' } = pos;

    if (l2 == null) {
        // 1-dimensional
        assertInt('lower bound', l1, l1);
        assertInt('upper bound', u1, u1);

        if (u1 < l1) {
            throwErr('ValueError',
                     `invalid array bounds ${l1} and ${u1}`,
                     currentLineNum, col, len,
                     'The upper bound must be greater than or equal to the lower bound.');
        }

        const arrLen = u1 - l1 + 1;
        if (arrLen > ARRAY_SIZE_LIMIT) {
            throwErr('ValueError',
                     `invalid array size ${arrLen}`,
                     currentLineNum, col, len,
                     `Array size must not exceed ${ARRAY_SIZE_LIMIT}.`);
        }

        // create array
        const arr = new Array(arrLen);

        // set bounds
        arr.l1 = l1; arr.u1 = u1;

        return arr;
    } else {
        // 2-dimensional
        assertInt('lower bound', l1, l1); assertInt('lower bound', l2, l2);
        assertInt('upper bound', u1, u1); assertInt('upper bound', u2, u2);

        if (u1 < l1) {
            throwErr('ValueError',
                     `invalid array bounds ${l1} and ${u1}`,
                     currentLineNum, col, len,
                     'The upper bound must be greater than or equal to the lower bound.');
        }
        if (u2 < l2) {
            throwErr('ValueError',
                     `invalid array bounds ${l2} and ${u2}`,
                     currentLineNum, col, len,
                     'The upper bound must be greater than or equal to the lower bound.');
        }

        const rows = u1 - l1 + 1;
        const cols = u2 - l2 + 1;
        if (rows * cols > ARRAY_SIZE_LIMIT) {
            throwErr('ValueError',
                     `invalid array size ${rows * cols}`,
                     currentLineNum, col, len,
                     `Array size must not exceed ${ARRAY_SIZE_LIMIT}.`);
        }

        // create array
        const arr = new Array(rows);
        for (let row = 0; row < rows; row++) arr[row] = new Array(cols);

        // set bounds
        arr.l1 = l1; arr.u1 = u1;
        arr.l2 = l2; arr.u2 = u2;

        return arr;
    }
}

export function arrGet(A, i, j,         pos = {}) {
    const { col = '', len = '' } = pos;

    if (!Array.isArray(A)) {
        throwErr('TypeError',
                 'object is not an array',
                 currentLineNum, col, len);
    }

    // 1d array
    if (A.l1 != null && A.l2 == null) {
        if (j != null) { // two indices
            throwErr('TypeError',
                     'too many indices for array',
                     currentLineNum, col, len,
                     'Array is one-dimensional, it requires only one index.');
        }

        if (!Number.isInteger(i) || i < A.l1 || i > A.u1) {
            throwErr('IndexError',
                     `index ${i} out of bounds`,
                     currentLineNum, col, len,
                     `Index must be between ${A.l1} and ${A.u1}.`);
        }

        const val = A[i - A.l1];
        if (val === undefined) {
            throwErr('ValueError',
                     `array index ${i} is uninitialized`,
                     currentLineNum, col, len);
        }

        return val;
    }

    // 2d array
    if (A.l1 != null && A.l2 != null) {
        if (j == null) { // no second index
            throwErr('TypeError',
                     'too few indices for array',
                     currentLineNum, col, len,
                     'Array is two-dimensional, it requires two indices.');
        }

        if (!Number.isInteger(i) || i < A.l1 || i > A.u1) {
            throwErr('IndexError',
                     `index ${i} out of bounds`,
                     currentLineNum, col, len,
                     `Index must be between ${A.l1} and ${A.u1}.`);
        }
        if (!Number.isInteger(j) || j < A.l2 || j > A.u2) {
            throwErr('IndexError',
                     `index ${j} out of bounds`,
                     currentLineNum, col, len,
                     `Index must be between ${A.l2} and ${A.u2}.`);
        }

        const val = A[i - A.l1][j - A.l2];
        if (val === undefined) {
            throwErr('ValueError',
                     `array indices ${i}, ${j} are uninitialized`,
                     currentLineNum, col, len);
        }

        return val;
    }

    throwErr('SyntaxError',
             'invalid array access',
             currentLineNum, col, len,
             'Expected ARRAY[l:u] or ARRAY[l1:u1, l2:u2].');
}
export function arrSet(A, i, j, val,    pos = {}) {
    const { col = '', len = '' } = pos;

    if (!Array.isArray(A)) {
        throwErr('TypeError',
                 'object is not an array',
                 currentLineNum, col, len);
    }

    // 1d array
    if (A.l1 != null && A.l2 == null) {
        if (j != null) { // two indices
            throwErr('TypeError',
                     'too many indices for array',
                     currentLineNum, col, len,
                     'Array is one-dimensional, it requires only one index.');
        }

        if (!Number.isInteger(i) || i < A.l1 || i > A.u1) {
            throwErr('IndexError',
                     `index ${i} out of bounds`,
                     currentLineNum, col, len,
                     `Index must be between ${A.l1} and ${A.u1}.`);
        }

        A[i - A.l1] = val;
        return;
    }

    // 2d array
    if (A.l1 != null && A.l2 != null) {
        if (j == null) { // no second index
            throwErr('TypeError',
                     'too few indices for array',
                     currentLineNum, col, len,
                     'Array is two-dimensional, it requires two indices.');
        }

        if (!Number.isInteger(i) || i < A.l1 || i > A.u1) {
            throwErr('IndexError',
                     `index ${i} out of bounds`,
                     currentLineNum, col, len,
                     `Index must be between ${A.l1} and ${A.u1}.`);
        }
        if (!Number.isInteger(j) || j < A.l2 || j > A.u2) {
            throwErr('IndexError',
                     `index ${j} out of bounds`,
                     currentLineNum, col, len,
                     `Index must be between ${A.l2} and ${A.u2}.`);
        }

        A[i - A.l1][j - A.l2] = val;
        return;
    }

    throwErr('SyntaxError',
             'invalid array access',
             currentLineNum, col, len,
             'Expected ARRAY[l:u] or ARRAY[l1:u1, l2:u2].');
}
