ace.define('ace/mode/lang', ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text', 'ace/mode/rules'],
function(require, exports, module) {
    const oop = require('ace/lib/oop');
    const TextMode = require('ace/mode/text').Mode;
    const LangHighlightRules = require('ace/mode/rules').LangHighlightRules;

    class Mode extends TextMode {
        constructor() {
            super();
            this.HighlightRules = LangHighlightRules;
            this.$id = 'ace/mode/lang';
        }
    }

    // extract all names from the code
    const langCompleter = {
        getCompletions: function(editor, session, pos, prefix, callback) {
            // extract variable names
            const code = editor.getValue();
            const varNames  = new Set();
            const procNames = new Set();
            const funcNames = new Set();
            const constNames = new Set();

            // extract varable names from DECLARE statements
            const declareMatches = code.match(/DECLARE\s+([A-Za-z][A-Za-z0-9]*(?:\s*,\s*[A-Za-z][A-Za-z0-9]*)*)/gi);
            if (declareMatches) {
                declareMatches.forEach(match => {
                    const variables = match.replace(/DECLARE\s+/i, '').split(',').map(v => v.trim());
                    variables.forEach(v => {
                        if (v.match(/^[A-Za-z][A-Za-z0-9]*$/)) {
                            varNames.add(v);
                        }
                    });
                });
            }
            
            // extract constant names from CONSTANT statements
            const constantMatches = code.match(/CONSTANT\s+([A-Za-z][A-Za-z0-9]*)/gi);
            if (constantMatches) {
                constantMatches.forEach(match => {
                    const constant = match.replace(/CONSTANT\s+/i, '').trim();
                    if (constant.match(/^[A-Za-z][A-Za-z0-9]*$/)) {
                        constNames.add(constant);
                    }
                });
            }
            
            // extract procedure names from PROCEDURE statements
            const procMatches = code.match(/PROCEDURE\s+([A-Za-z][A-Za-z0-9]*)/gi);
            if (procMatches) {
                procMatches.forEach(match => {
                    const procName = match.replace(/PROCEDURE\s+/i, '').trim();
                    if (procName.match(/^[A-Za-z][A-Za-z0-9]*$/)) {
                        procNames.add(procName);
                    }
                });
            }
            
            // extract function names from FUNCTION statements
            const funcMatches = code.match(/FUNCTION\s+([A-Za-z][A-Za-z0-9]*)/gi);
            if (funcMatches) {
                funcMatches.forEach(match => {
                    const funcName = match.replace(/FUNCTION\s+/i, '').trim();
                    if (funcName.match(/^[A-Za-z][A-Za-z0-9]*$/)) {
                        funcNames.add(funcName);
                    }
                });
            }

            // convert names to completions
            const varCompletions = Array.from(varNames).map(name => ({
                name: name,
                value: name,
                score: 700,
                meta: 'variable'
            }));
            const constCompletions = Array.from(constNames).map(name => ({
                name: name,
                value: name,
                score: 700,
                meta: 'constant'
            }));
            const funcCompletions = Array.from(funcNames).map(name => ({
                name: name,
                value: name,
                score: 700,
                meta: 'function'
            }));
            const procCompletions = Array.from(procNames).map(name => ({
                name: name,
                value: name,
                score: 700,
                meta: 'procedure'
            }));
            
            const keywordCompletions = [
                // keywords
                { name: 'IF',           value: 'IF',           score: 1000, meta: 'keyword' },
                { name: 'THEN',         value: 'THEN',         score: 1000, meta: 'keyword' },
                { name: 'ELSE',         value: 'ELSE',         score: 1000, meta: 'keyword' },
                { name: 'ENDIF',        value: 'ENDIF',        score: 1000, meta: 'keyword' },
                { name: 'CASE',         value: 'CASE',         score: 1000, meta: 'keyword' },
                { name: 'OF',           value: 'OF',           score: 1000, meta: 'keyword' },
                { name: 'OTHERWISE',    value: 'OTHERWISE',    score: 1000, meta: 'keyword' },
                { name: 'ENDCASE',      value: 'ENDCASE',      score: 1000, meta: 'keyword' },
                { name: 'FOR',          value: 'FOR',          score: 1000, meta: 'keyword' },
                { name: 'TO',           value: 'TO',           score: 1000, meta: 'keyword' },
                { name: 'STEP',         value: 'STEP',         score: 1000, meta: 'keyword' },
                { name: 'NEXT',         value: 'NEXT',         score: 1000, meta: 'keyword' },
                { name: 'WHILE',        value: 'WHILE',        score: 1000, meta: 'keyword' },
                { name: 'DO',           value: 'DO',           score: 1000, meta: 'keyword' },
                { name: 'ENDWHILE',     value: 'ENDWHILE',     score: 1000, meta: 'keyword' },
                { name: 'REPEAT',       value: 'REPEAT',       score: 1000, meta: 'keyword' },
                { name: 'UNTIL',        value: 'UNTIL',        score: 1000, meta: 'keyword' },
                { name: 'PROCEDURE',    value: 'PROCEDURE',    score: 1000, meta: 'keyword' },
                { name: 'FUNCTION',     value: 'FUNCTION',     score: 1000, meta: 'keyword' },
                { name: 'RETURNS',      value: 'RETURNS',      score: 1000, meta: 'keyword' },
                { name: 'RETURN',       value: 'RETURN',       score: 1000, meta: 'keyword' },
                { name: 'CALL',         value: 'CALL',         score: 1000, meta: 'keyword' },
                { name: 'ENDPROCEDURE', value: 'ENDPROCEDURE', score: 1000, meta: 'keyword' },
                { name: 'ENDFUNCTION',  value: 'ENDFUNCTION',  score: 1000, meta: 'keyword' },
                { name: 'INPUT',        value: 'INPUT',        score: 1000, meta: 'keyword' },
                { name: 'OUTPUT',       value: 'OUTPUT',       score: 1000, meta: 'keyword' },
                { name: 'DECLARE',      value: 'DECLARE',      score: 1000, meta: 'keyword' },
                { name: 'CONSTANT',     value: 'CONSTANT',     score: 1000, meta: 'keyword' },
                { name: 'TRUE',         value: 'TRUE',         score: 1000, meta: 'keyword' },
                { name: 'FALSE',        value: 'FALSE',        score: 1000, meta: 'keyword' },
                { name: 'AND',          value: 'AND',          score: 1000, meta: 'keyword' },
                { name: 'OR',           value: 'OR',           score: 1000, meta: 'keyword' },
                { name: 'NOT',          value: 'NOT',          score: 1000, meta: 'keyword' },
                
                // types
                { name: 'INTEGER',      value: 'INTEGER',      score: 900,  meta: 'type' },
                { name: 'REAL',         value: 'REAL',         score: 900,  meta: 'type' },
                { name: 'BOOLEAN',      value: 'BOOLEAN',      score: 900,  meta: 'type' },
                { name: 'CHAR',         value: 'CHAR',         score: 900,  meta: 'type' },
                { name: 'STRING',       value: 'STRING',       score: 900,  meta: 'type' },
                { name: 'ARRAY',        value: 'ARRAY',        score: 900,  meta: 'type' },
                
                // built-in functions
                { name: 'ROUND',        value: 'ROUND',        score: 800,  meta: 'builtin' },
                { name: 'RANDOM',       value: 'RANDOM',       score: 800,  meta: 'builtin' },
                { name: 'LENGTH',       value: 'LENGTH',       score: 800,  meta: 'builtin' },
                { name: 'LCASE',        value: 'LCASE',        score: 800,  meta: 'builtin' },
                { name: 'UCASE',        value: 'UCASE',        score: 800,  meta: 'builtin' },
                { name: 'SUBSTRING',    value: 'SUBSTRING',    score: 800,  meta: 'builtin' },
                { name: 'DIV',          value: 'DIV',          score: 800,  meta: 'builtin' },
                { name: 'MOD',          value: 'MOD',          score: 800,  meta: 'builtin' }
            ];
            
            // combine completions
            const completions = [...keywordCompletions,
                                 ...varCompletions,
                                 ...constCompletions,
                                 ...funcCompletions,
                                 ...procCompletions];
            
            // filter completions based on prefix
            const filtered = completions.filter(completion => 
                completion.name.toLowerCase().startsWith(prefix.toLowerCase())
            );
            
            callback(null, filtered);
        }
    };

    // register the completer
    ace.require('ace/ext/language_tools').addCompleter(langCompleter);

    // comments
    Mode.prototype.lineCommentStart = '//';

    // indent rules
    Mode.prototype.getNextLineIndent = function(state, line, tab) {
        let indent = this.$getIndent(line);
        const trimmed = line.trim();

        // increase indent after opening keywords
        const fullIndentOpeners = [
            /^OF\b/i,
            /^FOR\b.*\bTO\b/i,
            /^WHILE\b.*\bDO\b/i,
            /^REPEAT\b/i,
            /^PROCEDURE\b/i,
            /^FUNCTION\b/i
        ];

        // after these, half the tab size
        const halfIndentOpeners = [
            /^IF\b/i,
            /^CASE\b/i,
            /^THEN\b/i,
            /^ELSE\b/i,
        ];

        if (fullIndentOpeners.some(r => r.test(trimmed))) {
            indent += tab;
        } else if (halfIndentOpeners.some(r => r.test(trimmed))) {
            indent += tab.slice(0, Math.floor(tab.length / 2)); // half the tab size
        }

        return indent;
    };

    // remove indent after closing keywords
    Mode.prototype.checkOutdent = function(state, line, input) {
        if (!/^\s+$/.test(line)) return false;
        const closing = /^(ENDIF|ENDCASE|NEXT|ENDWHILE|UNTIL|ENDPROCEDURE|ENDFUNCTION)\b/i;
        return closing.test(input.trim());
    };
    Mode.prototype.autoOutdent = function(state, doc, row) {
        const line = doc.getLine(row);
        const match = line.match(/^(\s*)(ENDIF|ENDCASE|NEXT|ENDWHILE|UNTIL|ENDPROCEDURE|ENDFUNCTION)\b/i);
        if (!match) return;

        let openIndent = '';
        for (let r = row - 1; r >= 0; r--) {
            const prev = doc.getLine(r);
            if (!prev.trim()) continue;
            openIndent = prev.match(/^\s*/)[0];
            break;
        }
        
        if (openIndent != null) {
            doc.replace({start: {row, column: 0}, end: {row, column: match[1].length}}, openIndent);
        }
    };

    exports.Mode = Mode;
    exports.langCompleter = langCompleter;
});
