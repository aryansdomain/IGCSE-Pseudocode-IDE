ace.define('ace/mode/rules', ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text_highlight_rules'],
function(require, exports, module) {
    const oop = require('ace/lib/oop');
    const TextHighlightRules = require('ace/mode/text_highlight_rules').TextHighlightRules;

    const KEYWORDS = ([
        'IF','THEN','ELSE','ENDIF','CASE','OF','OTHERWISE','ENDCASE',                  // conditionals
        'FOR','TO','STEP','NEXT','WHILE','DO','ENDWHILE','REPEAT','UNTIL',             // iteration
        'PROCEDURE','FUNCTION','RETURNS','RETURN','CALL','ENDPROCEDURE','ENDFUNCTION', // functions and procedures
        'INPUT','OUTPUT',                                                              // input/output
        'DECLARE','CONSTANT','OF',                                                     // declarations
        'TRUE','FALSE',                                                                // boolean
        'AND','OR','NOT',                                                              // logical operators
    ].join('|'));

    const TYPES    = (['INTEGER', 'REAL', 'BOOLEAN', 'CHAR', 'STRING', 'ARRAY'                 ].join('|'));
    const BUILTINS = (['ROUND', 'RANDOM', 'LENGTH', 'LCASE', 'UCASE', 'SUBSTRING', 'DIV', 'MOD'].join('|'));

    class LangHighlightRules extends TextHighlightRules {
        constructor() {
            super();
            const keywordMapper = this.createKeywordMapper({
                'keyword.control': KEYWORDS,
                'storage.type': TYPES,
                'support.function': BUILTINS,
            }, 'identifier', true, '');

            this.$rules = {
                start: [
                    { token: 'comment.line.double-slash', regex: /\/\/.*$/ },                      // comments
                    { token: 'string.quoted.single', regex: /'[^']*'/ },                           // char (single quotes)
                    { token: 'string.quoted.double', regex: '"', next: 'string_dq' },              // strings (double quotes)
                    { token: 'constant.numeric', regex: /\b(?:\d+\.\d+|\d+)(?:[eE][+-]?\d+)?\b/ }, // integer, real, scientific notation
                    { token: 'keyword.operator', regex: /<-|<--|←/ },                              // assignment
                    { token: 'keyword.operator', regex: /<=|>=|<>|<|>|=/ },                        // comparison
                    { token: 'keyword.operator', regex: /\+|\-|\*|\/|\^/ },                        // arithmetic
                    { token: 'keyword.operator', regex: /\b(?:AND|OR|NOT)\b/i },                   // logical
                    { token: keywordMapper, regex: /\b[A-Za-z][A-Za-z0-9_]*\b/ },                  // identifiers and keywords
                    { token: 'punctuation.operator', regex: /[,:]/ },                              // , :
                    { token: 'paren.lparen', regex: /[\[(]/ },                                     // [ and (
                    { token: 'paren.rparen', regex: /[\])]/ },                                     // ] and )
                    // func/proc declarations
                    { token: 'keyword.control', regex: '\\b(?:FUNCTION|PROCEDURE)\\b',
                        caseInsensitive: true, next: 'function_name' },
                ],

                // double quotes
                string_dq: [
                    { token: 'string.quoted.double', regex: '"', next: 'start' },
                    { defaultToken: 'string.quoted.double' }
                ],

                // func/proc names
                function_name: [
                    { token: 'entity.name.function', regex: /\b[A-Za-z][A-Za-z0-9_]*\b/, next: 'start' },
                    { defaultToken: 'entity.name.function' }
                ]

            };
            this.normalizeRules();
        }
    }
    exports.LangHighlightRules = LangHighlightRules;
});
