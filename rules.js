ace.define('ace/mode/rules', ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text_highlight_rules'],
function(require, exports, module) {
    const oop = require('ace/lib/oop');
    const TextHighlightRules = require('ace/mode/text_highlight_rules').TextHighlightRules;

    const KEYWORDS = (
        [
            // selection
            'IF','THEN','ELSE','ENDIF','CASE','OF','OTHERWISE','ENDCASE',

            // iteration
            'FOR','TO','STEP','NEXT','WHILE','DO','ENDWHILE','REPEAT','UNTIL',

            // procedures and functions
            'PROCEDURE','FUNCTION','RETURNS','RETURN','CALL','ENDPROCEDURE','ENDFUNCTION',

            // input/output
            'INPUT','OUTPUT',

            // declarations
            'DECLARE','CONSTANT','OF',

            // boolean
            'TRUE','FALSE',

            // logical operators
            'AND','OR','NOT'

        ].join('|')
    );

    const TYPES = (
        [
            'INTEGER','REAL','BOOLEAN','CHAR','STRING','ARRAY'
        ].join('|')
    );

    const BUILTINS = (
        [
            // library functions
            'ROUND','RANDOM','LENGTH','LCASE','UCASE','SUBSTRING','DIV','MOD'
        ].join('|')
    );

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
                    // comments
                    { token: 'comment.line.double-slash', regex: /\/\/.*$/ },

                    // char (single quotes)
                    { token: 'string.quoted.single', regex: /'(?:[^'\\]|\\.)'/ },

                    // strings (double quotes)
                    { token: 'string.quoted.double', regex: '"', next: 'string_dq' },

                    // integer, real, or scientific notation
                    { token: 'constant.numeric', regex: /\b(?:\d+\.\d+|\d+)(?:[eE][+-]?\d+)?\b/ },

                    // assignment
                    { token: 'keyword.operator', regex: /<-/ },

                    // comparison
                    { token: 'keyword.operator', regex: /<=|>=|<>|<|>|=/ },

                    // arithmetic operators
                    { token: 'keyword.operator', regex: /\+|\-|\*|\/|\^/ },

                    // logical operators
                    { token: 'keyword.operator', regex: /\b(?:AND|OR|NOT)\b/i },

                    // function and procedure declarations
                    { token: 'keyword.control', regex: "\\b(?:FUNCTION|PROCEDURE)\\b", caseInsensitive: true, next: "function_name" },

                    // identifiers and keywords
                    { token: keywordMapper, regex: /\b[A-Za-z][A-Za-z0-9]*\b/ },

                    // punctuation
                    { token: 'punctuation.operator', regex: /[,:]/ },
                    { token: 'paren.lparen', regex: /[\[(]/ },
                    { token: 'paren.rparen', regex: /[\])]/ }
                ],

                // double quotes
                string_dq: [
                    { token: 'string.quoted.double', regex: '"', next: 'start' },
                    { defaultToken: 'string.quoted.double' }
                ],

                // function/procedure name state
                function_name: [
                    { token: 'entity.name.function', regex: /\b[A-Za-z][A-Za-z0-9]*\b/, next: 'start' },
                    { defaultToken: 'entity.name.function' }
                ]

            };

            this.normalizeRules();
        }
    }
    exports.LangHighlightRules = LangHighlightRules;
});
