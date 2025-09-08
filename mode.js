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

  // comments
  Mode.prototype.lineCommentStart = '//';

  // indent rules
  Mode.prototype.getNextLineIndent = function(state, line, tab) {
    let indent = this.$getIndent(line);
    const trimmed = line.trim();

    // increase indent after opening keywords
    const openers = [
      /^IF\b/i,
      /^THEN\b/i,
      /^ELSE\b/i,
      /^CASE\b/i,
      /^OF\b/i,
      /^FOR\b.*\bTO\b/i,
      /^WHILE\b.*\bDO\b/i,
      /^REPEAT\b/i,
      /^PROCEDURE\b/i,
      /^FUNCTION\b/i
    ];

    if (openers.some(r => r.test(trimmed))) {
      indent += tab;
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
});
