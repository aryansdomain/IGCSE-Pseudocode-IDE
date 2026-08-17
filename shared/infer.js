// Infer which INPUT'd scalars a program uses as strings.
//
// INPUT coerces numeric-looking text (e.g. a 4-digit code "1234") into a number,
// so an undeclared variable read with INPUT and then used as a string (LENGTH,
// comparison with a string, etc.) fails. This scans the statements and returns
// the scalar names that should be pre-declared as STRING, so INPUT keeps them as
// text. Only INPUT targets are returned (only they can be mis-coerced), and only
// when there is real string evidence, so numeric-input programs are unaffected.
//
// `lines` is an array of statement strings. For flowcharts (whose arrays are
// declared via the trace table, not DECLARE) prepend the array DECLARE lines so
// STRING arrays are recognised.
export function getStringInputs(lines) {
    const arrayNames         = new Set(); // names declared as arrays
    const stringArrays       = [];        // STRING array names (lowercase)
    const explicitlyDeclared = new Set(); // scalars with an explicit DECLARE

    // pass 1: declarations
    for (const raw of lines) {
        const line = raw.trim();
        const arr = line.match(/^DECLARE\s+(\w+)\s*:\s*ARRAY\s*\[[^\]]*\]\s*OF\s*([A-Za-z]+)/i);
        if (arr) {
            arrayNames.add(arr[1].toLowerCase());
            if (arr[2].toUpperCase() === 'STRING') stringArrays.push(arr[1].toLowerCase());
            continue;
        }
        const scalar = line.match(/^DECLARE\s+(\w+)\s*:\s*([A-Za-z]+)\s*$/i);
        if (scalar) explicitlyDeclared.add(scalar[1].toLowerCase());
    }

    // pass 2: INPUT targets + string evidence
    const inputTargets = new Set();
    const stringVars   = new Set();
    const noteString = name => { const k = name.toLowerCase(); if (!arrayNames.has(k)) stringVars.add(k); };

    for (const raw of lines) {
        const line = raw.trim();

        // INPUT target (scalar only — array elements carry an index)
        const inp = line.match(/^INPUT\s+([A-Za-z]\w*)\s*$/i);
        if (inp) inputTargets.add(inp[1].toLowerCase());

        // argument to a string builtin
        for (const m of line.matchAll(/\b(?:LENGTH|UCASE|LCASE|SUBSTRING)\s*\(\s*([A-Za-z]\w*)/gi)) noteString(m[1]);

        // either side of an assignment/comparison with a string literal
        for (const m of line.matchAll(/([A-Za-z]\w*)\s*(?:<-|=|<>)\s*"/g)) noteString(m[1]);
        for (const m of line.matchAll(/"\s*(?:=|<>)\s*([A-Za-z]\w*)/g))    noteString(m[1]);

        // either side of an assignment/comparison with a STRING array element
        for (const arr of stringArrays) {
            for (const m of line.matchAll(new RegExp(`([A-Za-z]\\w*)\\s*(?:<-|=|<>)\\s*${arr}\\s*\\[`, 'gi')))           noteString(m[1]);
            for (const m of line.matchAll(new RegExp(`${arr}\\s*\\[[^\\]]*\\]\\s*(?:<-|=|<>)\\s*([A-Za-z]\\w*)`, 'gi'))) noteString(m[1]);
        }
    }

    return [...inputTargets].filter(name => stringVars.has(name) && !explicitlyDeclared.has(name));
}
