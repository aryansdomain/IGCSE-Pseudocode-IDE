import { addProperties, getDeclaredType, getValType, setDeclared, setType } from './scope.js';
import { parseVar, toString } from './expressions.js';
import { assign } from './execute.js';

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
        if (declaredType) return declaredType;
    } catch {}

    const tempScope = Object.create(scope || null); addProperties(tempScope);
    const tempName = '__TEMPVAR';                   setDeclared(tempScope, tempName);

    // make object that can be written to
    const tempObj = {
        name: tempName,
        write(assignedVal, assignedText) {
            setType(tempScope, tempName, getValType(assignedVal, assignedText));
            tempScope[tempName] = assignedVal;
        }
    };
    assign(tempScope, tempObj, val, text, false, text);
    return getDeclaredType(tempScope, tempName) || '';
}

export function formatOutput(scope, text, val) {
    const type = getOutputType(scope, text, val);

    // decimal point for real
    if ((typeof val === 'number' && Number.isInteger(val) && type === 'REAL')) {
        return val.toFixed(1);
    }

    if (type === 'CHAR') {
        return "'" + val + "'";
    }

    return toString(val);
}
