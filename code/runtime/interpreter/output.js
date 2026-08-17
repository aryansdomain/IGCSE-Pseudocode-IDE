import { addProperties, getDeclaredType, getValType, setDeclared, setType, isAssumedReal } from './scope.js';
import { parseVar, toString }                                                              from './expressions.js';
import { assign }                                                                          from './execute.js';

export function output(vals) {
    const text = vals.map(val => toString(val)).join('');

    try { self.postMessage({ type: 'output', text }); } catch {}
}

// try to get type by assigning the val to a temporary var, then getting the type from that var
function getOutputType(scope, text, val) {
    // if output is a single var, parse it and get type that way
    try {
        const parsed = parseVar(text);
        const declaredType = getDeclaredType(scope, parsed.name);
        if (declaredType) return { type: declaredType, assumed: isAssumedReal(scope, parsed.name) };
    } catch {}

    const tempScope = Object.create(scope || null); addProperties(tempScope);
    const tempName = 'TEMPVAR';                     setDeclared(tempScope, tempName);

    // make object that can be written to
    const tempObj = {
        name: tempName,
        write(assignedVal, assignedText) {
            setType(tempScope, tempName, getValType(assignedVal, assignedText));
            tempScope[tempName] = assignedVal;
        }
    };
    assign(tempScope, tempObj, val, text, false, text);
    return { type: getDeclaredType(tempScope, tempName) || '', assumed: false };
}

export function formatOutput(scope, text, val) {
    const { type, assumed } = getOutputType(scope, text, val);

    // decimal point for real
    if ((typeof val === 'number' && Number.isInteger(val) && type === 'REAL' && !assumed)) {
        return val.toFixed(1);
    }

    if (type === 'CHAR') {
        return "'" + val + "'";
    }

    return toString(val);
}

// like formatOutput but CHAR is written bare (no quotes) for file round-trip
export function formatFileOutput(scope, text, val) {
    const { type, assumed } = getOutputType(scope, text, val);

    if (typeof val === 'number' && Number.isInteger(val) && type === 'REAL' && !assumed) {
        return val.toFixed(1);
    }

    return toString(val);
}
