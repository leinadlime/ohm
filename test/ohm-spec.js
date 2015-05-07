/* eslint-disable no-eval */

/*

TODO:
* add a test that tries to use a semantic action for one grammar w/ a CST from another
  (should throw an error)
* rethink these tests, they're outdated now and should be re-written to test what Ohm has become
  (see TODO.md)

*/

var test = require('tape-catch');

var errors = require('../src/errors');
var fs = require('fs');
var ohm = require('..');
var util = require('./util');
var nodes = require('../src/nodes');
var Grammar = require('../src/Grammar');
var InputStream = require('../src/InputStream');
var Interval = require('../src/Interval');

var arithmeticGrammarSource = fs.readFileSync('test/arithmetic.ohm').toString();
var ohmGrammarSource = fs.readFileSync('src/ohm-grammar.ohm').toString();

function makeInterval(thing, startIdx, endIdx) {
  return new Interval(InputStream.newFor(thing), startIdx, endIdx);
}

function compareGrammars(t, expected, actual) {
  // The other property on grammars is "constructors", which contains
  // closures which cause spurious test failures if we compare
  // them. So we ignore that property here, concentrating on ruleDict
  // and other "real" properties of each grammar.

  t.equal(typeof actual, typeof expected);
  // ^ e.g. when one is undefined and the other isn't

  if (expected && actual) {
    compareGrammars(t, expected.superGrammar, actual.superGrammar);
    // In the list below, we exclude superGrammar (just tested above)
    // and constructors (for reasons given above).
    ['namespaceName', 'name', 'ruleDecls', 'ruleDict'].forEach(function(prop) {
      t.deepEqual(actual[prop], expected[prop]);
    });
  }
}

// A stub for Jasmin/RSpec-style tests, for tests that were written before we
// moved to `tape`. New tests shouldn't use this -- instead, they should
// pass a message argument to the assertion functions (e.g. `t.equal`), or
// just put checks in a separate call to `test`.
function it(desc, fn) {
  console.log(desc);  // eslint-disable-line no-console
  fn.call();
}

function buildTreeNodeWithUniqueId(m) {
  var nextId = 0;
  var attr = m.synthesizedAttribute({
    _default: function() {
      return ['id', nextId++, this.ctorName].concat(this.children.map(attr));
    },
    _many: ohm.actions.makeArray,
    _terminal: ohm.actions.getPrimitiveValue
  });
  attr._getNextId = function() {
    return nextId;
  };
  return attr;
}

test('grammar constructors dictionary', function(t) {
  var m = util.makeGrammar(arithmeticGrammarSource);

  it('exists and has a _default entry', function() {
    t.ok(m.constructors);
  });

  it('has an entry for each of a few carefully chosen rules', function() {
    t.ok(m.constructors.addExpr);
    t.ok(m.constructors.addExpr_minus);
    t.ok(m.constructors.priExpr);
    t.ok(m.constructors.digit);
    t.ok(m.constructors._);
  });

  it('lacks entries for nonexistent rules', function() {
    t.equal(m.constructors.foobar, undefined);
  });

  it('_default entry rejects nonexistent rule name', function() {
    t.throws(function() { m.construct('foobar', []); }, errors.InvalidConstructorCall);
  });

  it('_default entry works when called correctly', function() {
    t.ok(m.construct('addExpr', [m.match('1+2', 'addExpr_plus')]) instanceof nodes.Node);
  });

  it('particular entries work when called', function() {
    var n = m.match('1+2*3', 'addExpr');
    t.equal(n.ctorName, 'addExpr');

    var p = n.children[0];
    t.equal(p.ctorName, 'addExpr_plus');
    t.equal(p.numChildren(), 3);
  });

  t.end();
});

test('intervals', function(t) {
  test('collapsing', function(t) {
    it('left', function() {
      var interval = makeInterval('hello world', 0, 5);
      var collapsed = interval.collapsedLeft();

      // Original interval shouldn't change
      t.equal(interval.startIdx, 0);
      t.equal(interval.endIdx, 5);
      t.equal(interval.inputStream.source, 'hello world');
      t.equal(interval.contents, 'hello');

      t.equal(collapsed.startIdx, 0);
      t.equal(collapsed.endIdx, 0);
      t.equal(collapsed.inputStream.source, 'hello world');
      t.equal(collapsed.contents, '');
    });

    it('right', function() {
      var interval = makeInterval('hello world', 0, 5);
      var collapsed = interval.collapsedRight();

      // Original interval shouldn't change
      t.equal(interval.startIdx, 0);
      t.equal(interval.endIdx, 5);
      t.equal(interval.inputStream.source, 'hello world');
      t.equal(collapsed.contents, '');

      t.equal(collapsed.startIdx, 5);
      t.equal(collapsed.endIdx, 5);
      t.equal(collapsed.inputStream.source, 'hello world');
      t.equal(collapsed.contents, '');
    });
    t.end();
  });

  test('coverage', function(t) {
    it('one interval', function() {
      var interval = makeInterval('hello world', 0, 5);
      var ans = Interval.coverage(interval);

      t.equal(ans.startIdx, 0);
      t.equal(ans.endIdx, 5);
      t.equal(ans.inputStream.source, 'hello world');
      t.equal(ans.contents, 'hello');
    });

    it('two adjacent intervals', function() {
      var interval1 = makeInterval('hello world', 2, 5);
      var interval2 = makeInterval(interval1.inputStream, 0, 2);
      var ans = Interval.coverage(interval1, interval2);

      t.equal(ans.startIdx, 0);
      t.equal(ans.endIdx, 5);
      t.equal(ans.inputStream.source, 'hello world');
      t.equal(ans.contents, 'hello');
    });

    it('two non-adjacent intervals', function() {
      var interval1 = makeInterval('hello world', 0, 2);
      var interval2 = makeInterval(interval1.inputStream, 4, 5);
      var ans = Interval.coverage(interval1, interval2);

      t.equal(ans.startIdx, 0);
      t.equal(ans.endIdx, 5);
      t.equal(ans.inputStream.source, 'hello world');
      t.equal(ans.contents, 'hello');
    });

    it('nested intervals', function() {
      var interval1 = makeInterval('hello world', 0, 5);
      var interval2 = makeInterval(interval1.inputStream, 3, 4);
      var ans = Interval.coverage(interval1, interval2);

      t.equal(ans.startIdx, 0);
      t.equal(ans.endIdx, 5);
      t.equal(ans.inputStream.source, 'hello world');
      t.equal(ans.contents, 'hello');
    });

    it('more intervals', function() {
      var interval1 = makeInterval('hello world', 0, 2);
      var interval2 = makeInterval(interval1.inputStream, 3, 4);
      var interval3 = makeInterval(interval1.inputStream, 6, 10);
      var ans = Interval.coverage(interval1, interval2, interval3);

      t.equal(ans.startIdx, 0);
      t.equal(ans.endIdx, 10);
      t.equal(ans.inputStream.source, 'hello world');
      t.equal(ans.contents, 'hello worl');
    });

    it('brotha from anotha motha', function() {
      var interval1 = makeInterval('abc', 0, 3);
      var interval2 = makeInterval('xyz', 1, 2);
      t.throws(function() {
        Interval.coverage(interval1, interval2);
      }, errors.IntervalSourcesDontMatch);
    });

    it('coverageWith (same method as above but as a method of an interval)', function() {
      var interval1 = makeInterval('hello world', 0, 2);
      var interval2 = makeInterval(interval1.inputStream, 3, 4);
      var interval3 = makeInterval(interval1.inputStream, 6, 10);
      var ans = interval1.coverageWith(interval2, interval3);

      t.equal(ans.startIdx, 0);
      t.equal(ans.endIdx, 10);
      t.equal(ans.inputStream.source, 'hello world');
      t.equal(ans.contents, 'hello worl');
    });

    t.end();
  });
  t.end();
});

test('primitive patterns', function(t) {
  test('anything', function(t) {
    var m = util.makeGrammar('M { }');

    test('direct match, no stream', function(t) {
      it('recognition', function() {
        t.ok(m.match(5, '_'));
        t.ok(m.match(null, '_'));
      });

      it('semantic actions', function() {
        var dict = {
          _: ohm.actions.passThrough,
          _terminal: ohm.actions.getPrimitiveValue
        };
        t.equal(m.synthesizedAttribute(dict)(m.match(5, '_')), 5);
        t.equal(m.synthesizedAttribute(dict)(m.match(null, '_')), null);
      });
      t.end();
    });

    test('match in string stream', function(t) {
      it('recognition', function() {
        t.ok(m.match('5', '_'));
        t.equal(m.match('', '_').failed(), true);
      });

      it('semantic actions', function() {
        var dict = {
          _: ohm.actions.passThrough,
          _terminal: ohm.actions.getPrimitiveValue
        };
        t.equal(m.synthesizedAttribute(dict)(m.match('5', '_')), '5');
      });
      t.end();
    });

    test('match in list stream', function(t) {
      it('recognition', function() {
        t.ok(m.match(['123'], '_'));
      });

      it('semantic actions', function() {
        var dict = {
          _: ohm.actions.passThrough,
          _terminal: ohm.actions.getPrimitiveValue
        };
        t.deepEqual(m.synthesizedAttribute(dict)(m.match(['123'], '_')), ['123']);
      });
      t.end();
    });
    t.end();
  });

  test('direct match, no stream', function(t) {
    var m = util.makeGrammar([
      'M {',
      '  five = 5',
      '  _true = true',
      '  _false = false',
      '  _null = null',
      '  _undefined = undefined',
      '}'
    ]);

    it('recognition', function() {
      t.ok(m.match(5));
      t.ok(m.match(2).failed());
      t.equal(m.match('a').failed(), true);
      t.equal(m.match('5').failed(), true);
      t.equal(m.match('true').failed(), true);
      t.equal(m.match(true).failed(), true);
      t.equal(m.match('false').failed(), true);
      t.equal(m.match(false).failed(), true);
      t.equal(m.match(null).failed(), true);
      t.equal(m.match(undefined).failed(), true);

      t.equal(m.match(5, '_true').failed(), true);
      t.equal(m.match(2, '_true').failed(), true);
      t.equal(m.match('a', '_true').failed(), true);
      t.equal(m.match('5', '_true').failed(), true);
      t.equal(m.match('true', '_true').failed(), true);
      t.ok(m.match(true, '_true'));
      t.equal(m.match('false', '_true').failed(), true);
      t.equal(m.match(false, '_true').failed(), true);
      t.equal(m.match(null, '_true').failed(), true);
      t.equal(m.match(undefined, '_true').failed(), true);

      t.equal(m.match(5, '_false').failed(), true);
      t.equal(m.match(2, '_false').failed(), true);
      t.equal(m.match('a', '_false').failed(), true);
      t.equal(m.match('5', '_false').failed(), true);
      t.equal(m.match('true', '_false').failed(), true);
      t.equal(m.match(true, '_false').failed(), true);
      t.equal(m.match('false', '_false').failed(), true);
      t.ok(m.match(false, '_false'));
      t.equal(m.match(null, '_false').failed(), true);
      t.equal(m.match(undefined, '_false').failed(), true);

      t.equal(m.match(5, '_null').failed(), true);
      t.equal(m.match(2, '_null').failed(), true);
      t.equal(m.match('a', '_null').failed(), true);
      t.equal(m.match('5', '_null').failed(), true);
      t.equal(m.match('true', '_null').failed(), true);
      t.equal(m.match(true, '_null').failed(), true);
      t.equal(m.match('false', '_null').failed(), true);
      t.equal(m.match(false, '_null').failed(), true);
      t.ok(m.match(null, '_null'));
      t.equal(m.match(undefined, '_null').failed(), true);

      t.equal(m.match(5, '_undefined').failed(), true);
      t.equal(m.match(2, '_undefined').failed(), true);
      t.equal(m.match('a', '_undefined').failed(), true);
      t.equal(m.match('5', '_undefined').failed(), true);
      t.equal(m.match('true', '_undefined').failed(), true);
      t.equal(m.match(true, '_undefined').failed(), true);
      t.equal(m.match('false', '_undefined').failed(), true);
      t.equal(m.match(false, '_undefined').failed(), true);
      t.equal(m.match(null, '_undefined').failed(), true);
      t.ok(m.match(undefined, '_undefined'));
    });

    it('semantic actions', function() {
      var dict = {
        five: ohm.actions.passThrough,
        _true: ohm.actions.passThrough,
        _false: ohm.actions.passThrough,
        _null: ohm.actions.passThrough,
        _undefined: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      };
      t.equal(m.synthesizedAttribute(dict)(m.match(5)), 5);
      t.equal(m.synthesizedAttribute(dict)(m.match(true, '_true')), true);
      t.equal(m.synthesizedAttribute(dict)(m.match(false, '_false')), false);
      t.equal(m.synthesizedAttribute(dict)(m.match(null, '_null')), null);
      t.equal(m.synthesizedAttribute(dict)(m.match(undefined, '_undefined')), undefined);
    });
    t.end();
  });

  test('match in string stream', function(t) {
    var m = util.makeGrammar([
      'M {',
      '  five = 5',
      '  _true = true',
      '  _false = false',
      '  _null = null',
      '  _undefined = undefined',
      '}'
    ]);
    it('recognition', function() {
      t.equal(m.match('!').failed(), true);
      t.equal(m.match('5').failed(), true);
      t.equal(m.match('2').failed(), true);
      t.equal(m.match('').failed(), true);
      t.equal(m.match('true', '_true').failed(), true);
      t.equal(m.match('false', '_false').failed(), true);
      t.equal(m.match('null', '_null').failed(), true);
      t.equal(m.match('undefined', '_undefined').failed(), true);
    });
    t.end();
  });
  t.end();
});

test('char', function(t) {
  var m = util.makeGrammar('M { bang = "!" }');

  test('direct match, no stream', function(t) {
    it('recognition', function() {
      t.ok(m.match('!'));
      t.equal(m.match('!a').failed(), true);
      t.equal(m.match(5).failed(), true);
      t.equal(m.match('').failed(), true);
    });

    it('semantic actions', function() {
      var dict = {
        bang: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      };
      var cst = m.match('!');
      t.equal(m.synthesizedAttribute(dict)(cst), '!');
    });
    t.end();
  });

  test('match in string stream', function(t) {
    it('recognition', function() {
      t.ok(m.match('!'));
      t.equal(m.match('a').failed(), true);
      t.equal(m.match('').failed(), true);
    });

    it('semantic actions', function() {
      var dict = {
        bang: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      };
      var cst = m.match('!');
      t.equal(m.synthesizedAttribute(dict)(cst), '!');
    });
    t.end();
  });
  t.end();
});

test('string', function(t) {
  var m = util.makeGrammar('M { foo = "foo" }');

  test('direct match, no stream', function(t) {
    it('recognition', function() {
      t.ok(m.match('foo'));
      t.equal(m.match('foo1').failed(), true);
      t.equal(m.match('bar').failed(), true);
      t.equal(m.match(null).failed(), true);
    });

    it('semantic actions', function() {
      var dict = {
        foo: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      };
      var cst = m.match('foo');
      t.equal(m.synthesizedAttribute(dict)(cst), 'foo');
    });
    t.end();
  });

  test('match in string stream', function(t) {
    it('recognition', function() {
      t.ok(m.match('foo'));
      t.equal(m.match('foo1').failed(), true);
      t.equal(m.match('bar').failed(), true);
    });

    it('semantic actions', function() {
      var dict = {
        foo: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      };
      var cst = m.match('foo');
      t.equal(m.synthesizedAttribute(dict)(cst), 'foo');
    });
    t.end();
  });
  t.end();
});

test('regexp', function(t) {
  var m = util.makeGrammar('M { myDigit = /[0-9]/ myLetter = /\\p{L}/ myLF = /\\p{LF}/ }');

  test('direct match, no stream', function(t) {
    it('recognition', function() {
      t.equal(m.match(/[0-9]/).failed(), true);
      t.ok(m.match('4'));
      t.equal(m.match(4).failed(), true);
      t.equal(m.match('a').failed(), true);
      t.equal(m.match('a4').failed(), true);
    });
    t.end();
  });

  test('match in string stream', function(t) {
    it('recognition', function() {
      t.ok(m.match('4'));
      t.equal(m.match('a').failed(), true);
      t.equal(m.match('a4').failed(), true);
    });

    it('semantic actions', function() {
      var dict = {
        myDigit: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      };
      var cst = m.match('4');
      t.equal(m.synthesizedAttribute(dict)(cst), '4');
    });
    t.end();
  });

  test('unicode match in string stream', function(t) {
    it('recognition', function() {
      t.equal(m.match('4', 'myLetter').failed(), true);
      t.ok(m.match('a', 'myLetter'));
      t.equal(m.match('a4', 'myLetter').failed(), true);
      t.ok(m.match('\u03e6', 'myLetter'));
      t.equal(m.match('\u226a', 'myLetter').failed(), true);
      t.ok(m.match('\n', 'myLF'));
      t.equal(m.match('x', 'myLF').failed(), true);
    });

    it('semantic actions', function() {
      var dict = {
        myLetter: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      };
      var cst = m.match('a', 'myLetter');
      t.equal(m.synthesizedAttribute(dict)(cst), 'a');
    });
    t.end();
  });
  t.end();
});

test('alt', function(t) {
  var m = util.makeGrammar('M { altTest = "a" | "b" }');

  it('recognition', function() {
    t.equal(m.match('').failed(), true);
    t.ok(m.match('a'));
    t.ok(m.match('b'));
    t.equal(m.match('ab').failed(), true);
  });

  it('semantic actions', function() {
    var dict = {
      altTest: ohm.actions.passThrough,
      _terminal: ohm.actions.getPrimitiveValue
    };
    t.equal(m.synthesizedAttribute(dict)(m.match('a')), 'a');
    t.equal(m.synthesizedAttribute(dict)(m.match('b')), 'b');
  });
  t.end();
});

test('seq', function(t) {
  test('without bindings', function(t) {
    var m = util.makeGrammar('M { start = "a" "bc" "z" }');

    it('recognition', function() {
      t.equal(m.match('a').failed(), true);
      t.equal(m.match('bc').failed(), true);
      t.ok(m.match('abcz'));
      t.equal(m.match('abbz').failed(), true);
    });

    it('semantic actions', function() {
      var f = m.match('abcz');
      t.deepEqual(m.synthesizedAttribute({
        start: function(x, y, z) {
          return [x.interval.contents, y.interval.contents, z.interval.contents];
        }
      })(f), ['a', 'bc', 'z']);
    });
    t.end();
  });

  test('with exactly one binding', function(t) {
    var m = util.makeGrammar('M { start = "a" "bc" "z" }');

    it('recognition', function() {
      t.equal(m.match('a').failed(), true);
      t.equal(m.match('bc').failed(), true);
      t.ok(m.match('abcz'));
      t.equal(m.match('abbz').failed(), true);
    });

    it('semantic actions', function() {
      var f = m.match('abcz');
      t.deepEqual(m.synthesizedAttribute({
        start: function(x, _, _) {
          return x.primitiveValue;
        },
      })(f), 'a');
    });
    t.end();
  });

  test('with more than one binding', function(t) {
    var m = util.makeGrammar('M { start = "a" "bc" "z" }');

    it('recognition', function() {
      t.equal(m.match('a').failed(), true);
      t.equal(m.match('bc').failed(), true);
      t.ok(m.match('abcz'));
      t.equal(m.match('abbz').failed(), true);
    });

    it('semantic actions', function() {
      var f = m.match('abcz');
      t.deepEqual(m.synthesizedAttribute({
        start: function(x, _, y) {
          return [x.primitiveValue, y.primitiveValue];
        }
      })(f), ['a', 'z']);
    });
    t.end();
  });
  t.end();
});

test('alts and seqs together', function(t) {
  var m = util.makeGrammar('M { start = "a" "b" "c" | "1" "2" "3" }');

  it('recognition', function() {
    t.equal(m.match('ab').failed(), true);
    t.equal(m.match('12').failed(), true);
    t.ok(m.match('abc'));
    t.ok(m.match('123'));
  });

  it('semantic actions', function() {
    t.deepEqual(m.synthesizedAttribute({
        start: function(x, _, y) {
          return [x.primitiveValue, y.primitiveValue];
        }
      })(m.match('abc')), ['a', 'c']);
    t.deepEqual(m.synthesizedAttribute({
        start: function(x, _, y) {
          return [x.primitiveValue, y.primitiveValue];
        }
      })(m.match('123')), ['1', '3']);
  });

  t.end();
});

test('many', function(t) {
  var m = util.makeGrammar([
    'M {',
    '  number = digit+',
    '  digits = digit*',
    '  sss = &number number',
    '}'
  ]);

  it('recognition', function() {
    t.equal(m.match('1234a', 'number').failed(), true);
    t.ok(m.match('1234', 'number'));
    t.ok(m.match('5', 'number'));
    t.equal(m.match('', 'number').failed(), true);

    t.equal(m.match('1234a', 'digits').failed(), true);
    t.ok(m.match('1234', 'digits'));
    t.ok(m.match('5', 'digits'));
    t.ok(m.match('', 'digits'));
  });

  it('semantic actions', function() {
    var value = m.synthesizedAttribute({
      number: function(expr) {
        return ['digits', value(expr)];
      },
      digit: function(expr) {
        return ['digit', value(expr)];
      },
      _many: ohm.actions.makeArray,
      _terminal: ohm.actions.getPrimitiveValue
    });
    t.deepEqual(value(m.match('1234', 'number')), [
      'digits', [
        ['digit', '1'],
        ['digit', '2'],
        ['digit', '3'],
        ['digit', '4']
      ]]);
  });

  it('semantic actions are evaluated lazily', function() {
    var a = buildTreeNodeWithUniqueId(m);
    var tree = ['id', 1, 'number', [
      ['id', 2, 'digit', '1'],
      ['id', 3, 'digit', '2'],
      ['id', 4, 'digit', '3']
    ]];
    t.deepEqual(a(m.match('123', 'sss')), ['id', 0, 'sss', tree, tree]);
    t.equal(a._getNextId(), 5);
  });
  t.end();
});

test('opt', function(t) {
  var m = util.makeGrammar('M { name = "dr"? "warth" }');

  it('recognition', function() {
    t.ok(m.match('drwarth'));
    t.ok(m.match('warth'));
    t.equal(m.match('mrwarth').failed(), true);
  });

  it('semantic actions', function() {
    var actionDict = {
      name: function(title, last) {
        return [title.primitiveValue, last.primitiveValue];
      }
    };
    t.deepEqual(m.synthesizedAttribute(actionDict)(m.match('drwarth')), ['dr', 'warth']);
    t.deepEqual(m.synthesizedAttribute(actionDict)(m.match('warth')), [undefined, 'warth']);
  });
  t.end();
});

test('not', function(t) {
  var m = util.makeGrammar('M { start = ~"hello" _* }');

  it('recognition', function() {
    t.ok(m.match('yello world'));
    t.equal(m.match('hello world').failed(), true);
  });

  it('semantic actions', function() {
    var attr = m.synthesizedAttribute({
      start: function(x) {
        return x.interval.contents;
      }
    });
    t.equal(attr(m.match('yello world')), 'yello world');
  });
  t.end();
});

test('lookahead', function(t) {
  var m = util.makeGrammar('M { start = &"hello" _* }');

  it('recognition', function() {
    t.ok(m.match('hello world'));
    t.equal(m.match('hell! world').failed(), true);
  });

  it('semantic actions', function() {
    var attr = m.synthesizedAttribute({
      start: function(x, _) {
        return x.primitiveValue;
      }
    });
    t.equal(attr(m.match('hello world')), 'hello');
  });
  t.end();
});

test('arr', function(t) {
  var m = util.makeGrammar('M { start = ["abc" &_ ["d" "ef"] "g"] }');

  it('recognition', function() {
    t.ok(m.match(['abc', ['d', 'ef'], 'g']));
    t.equal(m.match(['abc', ['def'], 'g']).failed(), true);
    t.equal(m.match(['abc', 'def', 'g']).failed(), true);
    t.equal(m.match(['abc', ['d', 'ef', 'oops'], 'g']).failed(), true);
    t.equal(m.match(['abc', ['d', 'ef'], 'gh']).failed(), true);
    t.equal(m.match(['abc', [5], 'g']).failed(), true);
    t.equal(m.match(['abc', [], 'g']).failed(), true);
    t.equal(m.match(['abc', 5, 'g']).failed(), true);
  });

  it('semantic actions', function() {
    var value = m.synthesizedAttribute({
      start: function(_, y, x, _, _) {
        return [value(x), value(y)];
      },
      _: ohm.actions.passThrough,
      _terminal: ohm.actions.getPrimitiveValue
    });
    t.deepEqual(value(m.match(['abc', ['d', 'ef'], 'g'])), ['d', ['d', 'ef']]);
  });
  t.end();
});

test('obj', function(t) {
  var m = util.makeGrammar([
    'M {',
    '  strict  = {x: 1, y: (2)}',
    '  lenient = {x: 1, y: (2), ...}',
    '  withStringProps = {foos: ``"foo"*\'\', bar: "bar"}',
    '}'
  ]);

  test('strict', function(t) {
    it('recognition', function() {
      t.equal(m.match('foo', 'strict').failed(), true);
      t.equal(m.match([], 'strict').failed(), true);
      t.equal(m.match({y: 2}, 'strict').failed(), true);
      t.ok(m.match({x: 1, y: 2}, 'strict'));
      t.ok(m.match({y: 2, x: 1}, 'strict'));
      t.equal(m.match({x: 1, y: 2, z: 3}, 'strict').failed(), true);
    });

    it('semantic actions', function() {
      t.deepEqual(m.synthesizedAttribute({
        strict: function(a, b) {
          return [a.primitiveValue, b.primitiveValue];
        }
      })(m.match({x: 1, y: 2}, 'strict')), [1, 2]);
      t.deepEqual(m.synthesizedAttribute({
        strict: function(a, b) {
          return [a.primitiveValue, b.primitiveValue];
        }
      })(m.match({y: 2, x: 1}, 'strict')), [1, 2]);
    });
    t.end();
  });

  test('lenient', function(t) {
    it('recognition', function() {
      t.equal(m.match('foo', 'lenient').failed(), true);
      t.equal(m.match([], 'lenient').failed(), true);
      t.equal(m.match({y: 2}, 'lenient').failed(), true);
      t.ok(m.match({x: 1, y: 2}, 'lenient'));
      t.ok(m.match({y: 2, x: 1}, 'lenient'));
      t.ok(m.match({x: 1, y: 2, z: 3}, 'lenient'));
    });

    it('semantic actions', function() {
      t.deepEqual(m.synthesizedAttribute({
        lenient: function(a, b, _) {
          return [a.primitiveValue, b.primitiveValue];
        }
      })(m.match({x: 1, y: 2}, 'lenient')), [1, 2]);
      t.deepEqual(m.synthesizedAttribute({
        lenient: function(a, b, _) {
          return [a.primitiveValue, b.primitiveValue];
        }
      })(m.match({y: 2, x: 1}, 'lenient')), [1, 2]);
    });
    t.end();
  });

  test('string props', function(t) {
    it('recognition', function() {
      t.equal(m.match({foos: 'fo', bar: 'bar'}, 'withStringProps').failed(), true);
      t.ok(m.match({foos: 'foo', bar: 'bar'}, 'withStringProps'));
      t.equal(m.match({foos: 'foofo', bar: 'bar'}, 'withStringProps').failed(), true);
      t.ok(m.match({foos: 'foofoo', bar: 'bar'}, 'withStringProps'));
      t.ok(m.match({foos: 'foofoofoofoofoofoo', bar: 'bar'}, 'withStringProps'));
    });

    it('semantic actions', function() {
      var attr = m.synthesizedAttribute({
        withStringProps: function(foos, bar) {
          return [attr(foos), attr(bar)];
        },
        _many: ohm.actions.makeArray,
        _terminal: ohm.actions.getPrimitiveValue,
      });
      t.deepEqual(attr(m.match({foos: 'foofoo', bar: 'bar'}, 'withStringProps')), [
        ['foo', 'foo'], 'bar'
      ]);
    });
    t.end();
  });

  it('duplicate property names are not allowed', function() {
    try {
      m = util.makeGrammar('M { duh = {x: 1, x: 2, y: 3, ...} }');
      t.fail('Expected an exception to be thrown');
    } catch (e) {
      t.ok(e instanceof errors.DuplicatePropertyNames);
      t.deepEqual(e.duplicates, ['x']);
    }
  });
  t.end();
});

test('apply', function(t) {
  test('simple, no left recursion', function(t) {
    var m = util.makeGrammar([
      'M {',
      '  easy = foo',
      '  foo = "foo"',
      '}'
    ]);

    it('recognition', function() {
      t.equal(m.match('fo').failed(), true);
      t.ok(m.match('foo'));
      t.equal(m.match('fooo').failed(), true);
    });

    it('semantic actions', function() {
      var value = m.synthesizedAttribute({
        easy: function(expr) {
          return ['easy', value(expr)];
        },
        foo: function(expr) {
          return ['foo', value(expr)];
        },
        _terminal: ohm.actions.getPrimitiveValue
      });
      t.deepEqual(value(m.match('foo')), ['easy', ['foo', 'foo']]);
    });
    t.end();
  });

  test('simple left recursion', function(t) {
    var m = util.makeGrammar([
      'M {',
      ' number = numberRec | digit',
      'numberRec = number digit',
      '}'
    ]);

    it('recognition', function() {
      t.equal(m.match('', 'number').failed(), true);
      t.equal(m.match('a', 'number').failed(), true);
      t.ok(m.match('1', 'number'));
      t.ok(m.match('123', 'number'));
      t.ok(m.match('7276218173', 'number'));
    });

    it('semantic actions', function() {
      var f = m.match('1234', 'number');
      var eval = m.synthesizedAttribute({
        number: ohm.actions.passThrough,
        numberRec: function(n, d) {
          return eval(n) * 10 + eval(d);
        },
        digit: function(expr) {
          return eval(expr).charCodeAt(0) - '0'.charCodeAt(0);
        },
        _terminal: ohm.actions.getPrimitiveValue
      });
      t.equal(eval(f), 1234);
      var parseTree = m.synthesizedAttribute({
        number: function(expr) {
          return ['number', parseTree(expr)];
        },
        numberRec: function(n, d) {
          return ['numberRec', parseTree(n), parseTree(d)];
        },
        digit: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      });
      t.deepEqual(parseTree(f),
        ['number',
          ['numberRec',
            ['number',
              ['numberRec',
                ['number',
                  ['numberRec',
                    ['number', '1'],
                    '2']],
                '3']],
            '4']]);
    });
    t.end();
  });

  test('simple left recursion, with non-involved rules', function(t) {
    var m = util.makeGrammar([
      'M {',
      '  add = addRec | pri',
      '  addRec = add "+" pri',
      '  pri = priX | priY',
      '  priX = "x"',
      '  priY = "y"',
      '}'
    ]);

    it('recognition', function() {
      t.ok(m.match('x+y+x', 'add'));
    });

    it('semantic actions', function() {
      var v = m.synthesizedAttribute({
        add: ohm.actions.passThrough,
        addRec: function(x, _, y) {
          return [v(x), '+', v(y)];
        },
        pri: ohm.actions.passThrough,
        priX: ohm.actions.passThrough,
        priY: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      });
      t.deepEqual(v(m.match('x+y+x', 'add')), [
        ['x', '+', 'y'], '+', 'x'
      ]);
    });
    t.end();
  });

  test('indirect left recursion', function(t) {
    var m = util.makeGrammar([
      'M {',
      '  number = foo | digit',
      '  foo = bar', '  bar = baz',
      '  baz = qux', '  qux = quux',
      '  quux = numberRec',
      '  numberRec = number digit',
      '}'
    ]);

    it('recognition', function() {
      t.equal(m.match('', 'number').failed(), true);
      t.equal(m.match('a', 'number').failed(), true);
      t.ok(m.match('1', 'number'));
      t.ok(m.match('123', 'number'));
      t.ok(m.match('7276218173', 'number'));
    });

    it('semantic actions', function() {
      var v = m.synthesizedAttribute({
        number: ohm.actions.passThrough,
        foo: ohm.actions.passThrough,
        bar: ohm.actions.passThrough,
        baz: ohm.actions.passThrough,
        qux: ohm.actions.passThrough,
        quux: ohm.actions.passThrough,
        numberRec: function(n, d) {
          return [v(n), v(d)];
        },
        digit: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      });
      t.deepEqual(v(m.match('1234', 'number')), [[['1', '2'], '3'], '4']);
    });
    t.end();
  });

  test('nested left recursion', function(t) {
    var m = util.makeGrammar([
      'M {',
      '  addExpr = addExprRec | mulExpr',
      '  addExprRec = addExpr "+" mulExpr',
      '  mulExpr = mulExprRec | priExpr',
      '  mulExprRec = mulExpr "*" priExpr',
      '  priExpr = /[0-9]/',
      '  sss = &addExpr addExpr',
      '}'
    ]);

    it('recognition', function() {
      t.ok(m.match('1'));
      t.ok(m.match('2+3'));
      t.equal(m.match('4+').failed(), true);
      t.ok(m.match('5*6'));
      t.ok(m.match('7*8+9+0'));
    });

    it('semantic actions', function() {
      var f = m.match('1*2+3+4*5');
      var parseTree = m.synthesizedAttribute({
        addExpr: function(expr) {
          return ['addExpr', parseTree(expr)];
        },
        addExprRec: function(x, _, y) {
          return ['addExprRec', parseTree(x), parseTree(y)];
        },
        mulExpr: function(expr) {
          return ['mulExpr', parseTree(expr)];
        },
        mulExprRec: function(x, _, y) {
          return ['mulExprRec', parseTree(x), parseTree(y)];
        },
        priExpr: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      });
      t.deepEqual(parseTree(f),
        ['addExpr',
          ['addExprRec',
            ['addExpr',
              ['addExprRec',
                ['addExpr', ['mulExpr', ['mulExprRec', ['mulExpr', '1'], '2']]],
                ['mulExpr', '3']]],
            ['mulExpr', ['mulExprRec', ['mulExpr', '4'], '5']]]]);
      var eval = m.synthesizedAttribute({
        addExpr: function(expr) {
          return eval(expr);
        },
        addExprRec: function(x, _, y) {
          return eval(x) + eval(y);
        },
        mulExpr: function(expr) {
          return eval(expr);
        },
        mulExprRec: function(x, _, y) {
          return eval(x) * eval(y);
        },
        priExpr: function(expr) {
          return parseInt(eval(expr));
        },
        _terminal: ohm.actions.getPrimitiveValue
      });
      t.equal(eval(f), 25);
      var pretty = m.synthesizedAttribute({
        addExpr: ohm.actions.passThrough,
        addExprRec: function(x, _, y) {
          return '(' + pretty(x) + '+' + pretty(y) + ')';
        },
        mulExpr: ohm.actions.passThrough,
        mulExprRec: function(x, _, y) {
          return '(' + pretty(x) + '*' + pretty(y) + ')';
        },
        priExpr: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      });
      t.equal(pretty(f), '(((1*2)+3)+(4*5))');
    });

    it('semantic actions are evaluated lazily', function() {
      var f = m.match('1*2+3+4*5', 'sss');
      var a = buildTreeNodeWithUniqueId(m);
      var tree =
        ['id', 1, 'addExpr',
          ['id', 2, 'addExprRec',
            ['id', 3, 'addExpr',
              ['id', 4, 'addExprRec',
                ['id', 5, 'addExpr',
                  ['id', 6, 'mulExpr',
                    ['id', 7, 'mulExprRec',
                      ['id', 8, 'mulExpr',
                        ['id', 9, 'priExpr', '1']], '*',
                      ['id', 10, 'priExpr', '2']]]], '+',
                  ['id', 11, 'mulExpr',
                    ['id', 12, 'priExpr', '3']]]], '+',
              ['id', 13, 'mulExpr',
                ['id', 14, 'mulExprRec',
                  ['id', 15, 'mulExpr',
                    ['id', 16, 'priExpr', '4']], '*',
                  ['id', 17, 'priExpr', '5']]]]];
      t.deepEqual(a(f), ['id', 0, 'sss', tree, tree]);
      t.equal(a._getNextId(), 18);
    });
    t.end();
  });

  test('nested and indirect left recursion', function(t) {
    var m = util.makeGrammar([
      'G {',
      '  addExpr = a | c',
      '  a = b',
      '  b = addExprRec',
      '  addExprRec = addExpr "+" mulExpr',
      '  c = d',
      '  d = mulExpr',
      '  mulExpr = e | g',
      '  e = f',
      '  f = mulExprRec',
      '  g = h',
      '  h = priExpr',
      '  mulExprRec = mulExpr "*" priExpr',
      '  priExpr = /[0-9]/',
      '}'
    ]);

    it('recognition', function() {
      t.ok(m.match('1'));
      t.ok(m.match('2+3'));
      t.equal(m.match('4+').failed(), true);
      t.ok(m.match('5*6'));
      t.ok(m.match('7+8*9+0'));
    });

    it('semantic actions', function() {
      var buildTree = m.synthesizedAttribute({
        addExprRec: function(x, _, y) {
          return [buildTree(x), '+', buildTree(y)];
        },
        mulExprRec: function(x, _, y) {
          return [buildTree(x), '*', buildTree(y)];
        },
        _terminal: ohm.actions.getPrimitiveValue,
        _default: ohm.actions.passThrough
      });
      t.deepEqual(buildTree(m.match('7+8*9+0')), [
        ['7', '+', ['8', '*', '9']], '+', '0'
      ]);
    });
    t.end();
  });

  test('tricky left recursion (different heads at same position)', function(t) {
    var m = util.makeGrammar([
      'G {',
      '  tricky = &foo bar',
      '  foo = fooRec | digit',
      '  fooRec = bar digit',
      '  bar = barRec | digit',
      '  barRec = foo digit',
      '}'
    ]);

    it('recognition', function() {
      t.ok(m.match('1234', 'tricky'));
    });

    it('semantic actions', function() {
      var f = m.match('1234', 'tricky');
      // TODO: perhaps just use JSON.stringify(f) here, and compare the result?
      var buildTree = m.synthesizedAttribute({
        tricky: function(_, x) {
          return ['tricky', buildTree(x)];
        },
        foo: function(expr) {
          return ['foo', buildTree(expr)];
        },
        fooRec: function(x, y) {
          return ['fooRec', buildTree(x), buildTree(y)];
        },
        bar: function(expr) {
          return ['bar', buildTree(expr)];
        },
        barRec: function(x, y) {
          return ['barRec', buildTree(x), buildTree(y)];
        },
        digit: ohm.actions.passThrough,
        _terminal: ohm.actions.getPrimitiveValue
      });
      t.deepEqual(buildTree(f),
        ['tricky',
          ['bar',
            ['barRec', ['foo', ['fooRec', ['bar', ['barRec', ['foo', '1'], '2']], '3']], '4']]]);
    });
    t.end();
  });
  t.end();
});

test('inheritance', function(t) {
  test('super-grammar does not exist', function(t) {
    it('no namespace', function() {
      try {
        util.makeGrammar('G2 <: G1 {}');
        t.fail('Expected an exception to be thrown');
      } catch (e) {
        t.equal(e.constructor, errors.UndeclaredGrammar);
        t.equal(e.grammarName, 'G1');
      };
    });

    it('empty namespace', function() {
      try {
        util.makeGrammar('G2 <: G1 {}', {});
        t.fail('Expected an exception to be thrown');
      } catch (e) {
        t.equal(e.constructor, errors.UndeclaredGrammar);
        t.equal(e.grammarName, 'G1');
      };
    });
    t.end();
  });

  test('define', function(t) {
    it('should check that rule does not already exist in super-grammar', function() {
      var ns;
      try {
        ns = util.makeGrammars([
          'G1 { foo = "foo" }',
          'G2 <: G1 { foo = "bar" }'
        ]);
        t.fail('Expected an exception to be thrown');
      } catch (e) {
        t.equal(e.constructor, errors.DuplicateRuleDeclaration);
        t.equal(e.ruleName, 'foo');
        t.equal(e.offendingGrammarName, 'G2');
        t.equal(e.declGrammarName, 'G1');
      };
    });
    t.end();
  });

  test('override', function(t) {
    var ns = util.makeGrammars(['G1 { number = digit+ }',
                           'G2 <: G1 { digit := /[a-z]/ }']);

    it('should check that rule exists in super-grammar', function() {
      try {
        ns.G3 = util.makeGrammar('G3 <: G1 { foo := "foo" }', ns);
        t.fail('Expected an exception to be thrown');
      } catch (e) {
        t.equal(e.constructor, errors.UndeclaredRule);
        t.equal(e.ruleName, 'foo');
        t.equal(e.grammarName, 'G1');
      };
    });

    it("shouldn't matter if arities aren't the same", function() {
      // It's OK for the semantic action "API" of a grammar to be different
      // from that of its super-grammar.

      // arity(overriding rule) > arity(overridden rule)
      ns.M1 = util.makeGrammar('M1 { foo = "foo" }');
      util.makeGrammar('M2 <: M1 { foo := "foo" "bar" }', ns);

      // arity(overriding rule) < arity(overridden rule)
      ns.M3 = util.makeGrammar('M3 { foo = digit digit }', ns);
      ns.M4 = util.makeGrammar('M4 <: M3 { foo := digit }', ns);
    });

    it('recognition', function() {
      t.ok(ns.G1.match('1234', 'number'));
      t.equal(ns.G1.match('hello', 'number').failed(), true);
      t.equal(ns.G1.match('h3llo', 'number').failed(), true);

      t.equal(ns.G2.match('1234', 'number').failed(), true);
      t.ok(ns.G2.match('hello', 'number'));
      t.equal(ns.G2.match('h3llo', 'number').failed(), true);
    });

    it('semantic actions', function() {
      var v = ns.G2.synthesizedAttribute({
        number: function(expr) {
          return ['number', v(expr)];
        },
        digit: function(expr) {
          return ['digit', v(expr)];
        },
        _many: ohm.actions.makeArray,
        _terminal: ohm.actions.getPrimitiveValue
      });
      var expected = ['number', [['digit', 'a'], ['digit', 'b'], ['digit', 'c'], ['digit', 'd']]];
      t.deepEqual(v(ns.G2.match('abcd', 'number')), expected);
    });
    t.end();
  });

  test('extend', function(t) {
    var ns = util.makeGrammars(['G1 { foo = "aaa" "bbb" }',
                                'G2 <: G1 { foo += "111" "222" }']);

    it('recognition', function() {
      t.ok(ns.G1.match('aaabbb'));
      t.equal(ns.G1.match('111222').failed(), true);

      t.ok(ns.G2.match('aaabbb'));
      t.ok(ns.G2.match('111222'));
    });

    it('semantic actions', function() {
      t.deepEqual(ns.G2.synthesizedAttribute({
        foo: function(x, y) {
          return [x.primitiveValue, y.primitiveValue];
        }
      })(ns.G2.match('aaabbb')), ['aaa', 'bbb']);

      t.deepEqual(ns.G2.synthesizedAttribute({
        foo: function(x, y) {
          return [x.primitiveValue, y.primitiveValue];
        }
      })(ns.G2.match('111222')), ['111', '222']);
    });

    it('should check that rule exists in super-grammar', function() {
      try {
        util.makeGrammar('G3 <: G1 { bar += "bar" }', ns);
        t.fail('Expected an exception to be thrown');
      } catch (e) {
        t.equal(e.constructor, errors.UndeclaredRule);
        t.equal(e.ruleName, 'bar');
        t.equal(e.grammarName, 'G1');
      }
    });

    it('should make sure rule arities are compatible', function() {
      // An extending rule must produce the same number of values
      // as the underlying rule. This is to ensure the semantic
      // action "API" doesn't change.

      // Too many:
      ns.M1 = util.makeGrammar('M1 { foo = "foo"  bar = "bar"  baz = "baz" }');
      try {
        util.makeGrammar('M2 <: M1 { foo += bar baz }', ns);
        t.fail('Expected an exception to be thrown');
      } catch (e) {
        t.equal(e.constructor, errors.InconsistentArity);
        t.equal(e.ruleName, 'foo');
        t.equal(e.expected, 1);
        t.equal(e.actual, 2);
      }

      // Too few:
      ns.M3 = util.makeGrammar('M3 { foo = digit digit }');
      try {
        util.makeGrammar('M4 <: M3 { foo += digit }', ns);
        t.fail('Expected an exception to be thrown');
      } catch (e) {
        t.equal(e.constructor, errors.InconsistentArity);
        t.equal(e.ruleName, 'foo');
        t.equal(e.expected, 2);
        t.equal(e.actual, 1);
      }
    });
    t.end();
  });
  t.end();
});

test('bindings', function(t) {
  it('inconsistent arity in alts is an error', function() {
    try {
      util.makeGrammar('G { foo = "a" "c" | "b" }');
      t.fail('Expected an exception to be thrown');
    } catch (e) {
      t.equal(e.constructor, errors.InconsistentArity);
      t.equal(e.ruleName, 'foo');
      t.deepEqual(e.expected, 2);
      t.deepEqual(e.actual, 1);
    }
  });

  it('by default, bindings are evaluated lazily', function() {
    var g = util.makeGrammar([
      'G {',
      '  foo = bar baz',
      '  bar = "a"',
      '  baz = "b"',
      '}'
    ]);

    var id = 0;
    var v = g.synthesizedAttribute({
      foo: function(x, y) {
        var xv = v(x);
        var yv = v(y);
        return {
          x: xv,
          y: yv
        };
      },
      bar: function(expr) {
        return ['bar', v(expr), id++];
      },
      baz: function(expr) {
        return ['baz', v(expr), id++];
      },
      _terminal: ohm.actions.getPrimitiveValue
    });
    t.deepEqual(v(g.match('ab')), {
      x: ['bar', 'a', 0],
      y: ['baz', 'b', 1]
    });

    id = 0;
    v = g.synthesizedAttribute({
      foo: function(x, y) {
        var yv = v(y);
        var xv = v(x);
        return {
          x: xv,
          y: yv
        };
      },
      bar: function(expr) {
        return ['bar', v(expr), id++];
      },
      baz: function(expr) {
        return ['baz', v(expr), id++];
      },
      _terminal: ohm.actions.getPrimitiveValue
    });
    t.deepEqual(v(g.match('ab')), {
      x: ['bar', 'a', 1],
      y: ['baz', 'b', 0]
    });
  });
  t.end();
});

test('inline rule declarations', function(t) {
  function makeEval(g) {
    var eval = g.synthesizedAttribute({
      addExpr_plus: function(x, op, y) {
        return eval(x) + eval(y);
      },
      addExpr_minus: function(x, op, y) {
        return eval(x) - eval(y);
      },
      mulExpr_times: function(x, op, y) {
        return eval(x) * eval(y);
      },
      mulExpr_divide: function(x, op, y) {
        return eval(x) / eval(y);
      },
      priExpr_paren: function(oparen, e, cparen) {
        return eval(e);
      },
      number_rec: function(n, d) {
        return eval(n) * 10 + eval(d);
      },
      digit: function(expr) {
        return eval(expr).charCodeAt(0) - '0'.charCodeAt(0);
      },
      _default: ohm.actions.passThrough,
      _terminal: ohm.actions.getPrimitiveValue
    });
    return eval;
  }

  var ns = {};
  var expr = ns.Expr = util.makeGrammar(arithmeticGrammarSource);

  t.ok(expr.match('1*(2+3)-4/5', 'expr'), 'expr is recognized');
  t.equal(makeEval(expr)(expr.match('10*(2+123)-4/5', 'expr')), 1249.2, 'semantic action works');

  var m2 = util.makeGrammar([
      'Good <: Expr {',
      '  addExpr := addExpr "~" mulExpr  -- minus',
      '           | mulExpr',
      '}'
    ], ns);
  t.equal(makeEval(m2)(m2.match('2*3~4', 'expr')), 2);

  try {
    util.makeGrammar('Bad <: Expr { addExpr += addExpr "~" mulExpr  -- minus }', ns);
    t.fail('Expected an exception to be thrown');
  } catch (e) {
    t.ok(e instanceof errors.DuplicateRuleDeclaration);
    t.equal(e.ruleName, 'addExpr_minus');
    t.equal(e.offendingGrammarName, 'Bad');
    t.equal(e.declGrammarName, 'Expr');
  };
  t.end();
});

test('lexical vs. syntactic rules', function(t) {
  it("lexical rules don't skip spaces implicitly", function() {
    var g = util.makeGrammar('G { start = "foo" "bar" }');
    t.ok(g.match('foobar', 'start'));
    t.equal(g.match('foo bar', 'start').failed(), true);
    t.equal(g.match(' foo bar   ', 'start').failed(), true);
  });

  it('syntactic rules skip spaces implicitly', function() {
    var g = util.makeGrammar('G { Start = "foo" "bar" }');
    t.ok(g.match('foobar', 'Start'));
    t.ok(g.match('foo bar', 'Start'));
    t.ok(g.match(' foo bar   ', 'Start'));
  });

  it('mixing lexical and syntactic rules works as expected', function() {
    var g = util.makeGrammar([
      'G {',
      '  foo = "foo"',
      '  bar = "bar"',
      '  Start = foo bar',
      '}'
    ]);
    t.ok(g.match('foobar', 'Start'));
    t.ok(g.match('foo bar', 'Start'));
    t.ok(g.match(' foo bar   ', 'Start'));
  });
  t.end();
});

test('semantic action templates', function(t) {
  var ns = util.makeGrammars([
    'G1 {',
    '  foo = bar',
    '  bar = baz',
    '  baz = qux',
    '  qux = quux',
    '  quux = 42',
    '  aaa = "duh"',
    '  bbb = ~aaa qux  -- blah',
    '}',
    'G2 <: G1 {',
    '  qux := 100',
    '}'
  ]);
  var g1 = ns.G1;
  var g2 = ns.G2;
  t.deepEqual(g1.rulesThatNeedSemanticAction([]), {});
  t.deepEqual(g1.rulesThatNeedSemanticAction(['foo']), {
    foo: true,
    bar: true,
    baz: true,
    qux: true,
    quux: true
  });
  t.deepEqual(g1.rulesThatNeedSemanticAction(['aaa']), {aaa: true});
  t.deepEqual(g1.rulesThatNeedSemanticAction(['bbb']), {
    bbb: true,
    bbb_blah: true,
    qux: true,
    quux: true
  });
  t.deepEqual(g1.rulesThatNeedSemanticAction(['aaa', 'bbb']), {
    aaa: true,
    bbb: true,
    bbb_blah: true,
    qux: true,
    quux: true
  });

  t.deepEqual(g2.rulesThatNeedSemanticAction([]), {});
  t.deepEqual(g2.rulesThatNeedSemanticAction(['foo']), {
    foo: true,
    bar: true,
    baz: true,
    qux: true
  });
  t.deepEqual(g2.rulesThatNeedSemanticAction(['aaa']), {aaa: true});
  t.deepEqual(g2.rulesThatNeedSemanticAction(['bbb']), {
    bbb: true,
    bbb_blah: true,
    qux: true
  });
  t.deepEqual(g2.rulesThatNeedSemanticAction(['aaa', 'bbb']), {
    aaa: true,
    bbb: true,
    bbb_blah: true,
    qux: true
  });

  t.end();
});

test('namespaces', function(t) {
  var ns = util.makeGrammars('G { start = "foo" }');
  t.ok(ns.G.match('foo'), 'G exists in the namespace and works');

  var ns2 = util.makeGrammars('ccc { foo = "foo" }', ns);
  t.ok(ns2);
  try {
    util.makeGrammar('ccc { bar = "bar" }', ns2);
    t.fail('throws exception on duplicate grammar');
  } catch (e) {
    t.equal(e.constructor, errors.DuplicateGrammarDeclaration);
    t.equal(e.grammarName, 'ccc');
  }
  t.ok(ns2.G, 'ns2 delegates to ns1');

  var ns3 = util.makeGrammars('ccc { start = "x" }', ns);
  t.ok(ns3);
  t.ok(ns3.ccc, "grammars with same name can be created in diff't namespaces");
  t.notEqual(ns3.ccc, ns2.ccc, "grammars with same name are diff't objects");
  t.deepEqual(ns3.G, ns2.G, 'super grammar is the same');

  t.end();
});

test('loading from script elements', function(t) {
  function fakeScriptTag(contents) {
    return {
      type: 'text/ohm-js',
      innerHTML: Array.isArray(contents) ? contents.join('\n') : contents,
      getAttribute: function(name) {
        return undefined;
      },
      nodeType: 1
    };
  }
  var script1 = fakeScriptTag(['O { number = number digit  -- rec',
                               '           | digit',
                               '}']);
  var script2 = fakeScriptTag(['M { x = "xx" }',
                               'N { y = "yy" }']);
  var ns1 = ohm.grammarsFromScriptElements([script1]);
  var ns2 = ohm.grammarsFromScriptElements([script2]);
  t.equal(ns1.M, undefined, 'M is undefined in ns1');
  t.ok(ns1.O, 'O is defined in ns1');
  t.ok(ns1.O.match('1234', 'number'), 'O can match');

  t.ok(ns2.M, 'M is defined in ns2');
  t.ok(ns2.N, 'N is also defined');
  t.equal(ns2.O, undefined, 'O is not defined in ns2');
  t.ok(ns2.M.match('xx', 'x'), 'M can match');

  var g1 = ohm.grammarFromScriptElement(script1);
  t.ok(g1.match('1234', 'number'), 'loading a single grammar works');

  t.end();
});

test('bootstrap', function(t) {
  var ns = util.makeGrammars(ohmGrammarSource);

  it('can recognize arithmetic grammar', function() {
    t.ok(ns.Ohm.match(arithmeticGrammarSource, 'Grammar'));
  });

  it('can recognize itself', function() {
    t.ok(ns.Ohm.match(ohmGrammarSource, 'Grammar'));
  });

  var g = ohm._buildGrammar(ns.Ohm.match(ohmGrammarSource, 'Grammar'),
                            ohm.createNamespace(),
                            ns.Ohm);
  t.ok(g.match(ohmGrammarSource, 'Grammar'), 'Ohm grammar can recognize itself');

  it('can produce a grammar that works', function() {
    var a = ohm._buildGrammar(g.match(arithmeticGrammarSource, 'Grammar'),
                              ohm.createNamespace(),
                              g);
    var eval = a.synthesizedAttribute({
      expr: function(expr) {
        return eval(expr);
      },
      addExpr: function(expr) {
        return eval(expr);
      },
      addExpr_plus: function(x, op, y) {
        return eval(x) + eval(y);
      },
      addExpr_minus: function(x, op, y) {
        return eval(x) - eval(y);
      },
      mulExpr: function(expr) {
        return eval(expr);
      },
      mulExpr_times: function(x, op, y) {
        return eval(x) * eval(y);
      },
      mulExpr_divide: function(x, op, y) {
        return eval(x) / eval(y);
      },
      priExpr: function(expr) {
        return eval(expr);
      },
      priExpr_paren: function(oparen, e, cparen) {
        return eval(e);
      },
      number: function(expr) {
        return eval(expr);
      },
      number_rec: function(n, d) {
        return eval(n) * 10 + eval(d);
      },
      digit: function(expr) {
        return eval(expr).charCodeAt(0) - '0'.charCodeAt(0);
      },
      _terminal: ohm.actions.getPrimitiveValue
    });
    t.equal(eval(a.match('10*(2+123)-4/5', 'expr')), 1249.2);
  });

  it('full bootstrap!', function() {
    var g = ohm._buildGrammar(ns.Ohm.match(ohmGrammarSource, 'Grammar'),
                              ohm.createNamespace(),
                              ns.Ohm);
    var gPrime = ohm._buildGrammar(g.match(ohmGrammarSource, 'Grammar'),
                                   ohm.createNamespace(),
                                   g);
    gPrime.namespaceName = g.namespaceName; // make their namespaceName properties the same
    compareGrammars(t, g, gPrime);
  });

  it('inherited attributes', function() {
    var g = util.makeGrammar([
      'G {',
      '  abcs = "a" b "c"*',
      '  b    = "b"',
      '}'
    ]);
    var depth = g.inheritedAttribute({
      _base: function(node) {
        depth.set(0);
      },
      abcs$0: function(a) {
        depth.set(depth(this) + 1);
      },
      abcs$1: function(b) {
        depth.set(depth(this) + 1);
      },
      abcs$2: function(cs) {
        depth.set(depth(this) + 1);
      },
      abcs$2$each: function(c) {
        depth.set(depth(this) + 1);
      },
      b$0: function(b) {
        depth.set(depth(this) + 1);
      }
    });
    var print = g.semanticAction({
      _default: function() {
        for (var idx = 0; idx < this.numChildren(); idx++) {
          print(this.childAt(idx));
        }
      },
      _terminal: function() {}
    });
    var cst = g.match('abccc', 'abcs');
    print(cst);
  });
  t.end();
});

test('definitionInterval', function(t) {
  var g = util.makeGrammar([
    'G {',
    '  foo = bar',
    '  bar = "a" | "b" -- baz',
    '}'
  ]);

  function definitionLoc(grammar, ruleName) {
    var interval = grammar.ruleDict[ruleName].definitionInterval;
    return [interval.startIdx, interval.endIdx];
  }
  it('works for regular rules', function() {
    t.deepEqual(definitionLoc(g, 'foo'), [6, 15]);
    t.deepEqual(definitionLoc(g, 'bar'), [18, 40]);
  });
  it('works for inline rules', function() {
    t.deepEqual(definitionLoc(g, 'bar_baz'), [30, 40]);
  });

  var g2 = util.makeGrammar([
    'G2 <: G {',
    '  foo += bar',
    '  bar := "a" | "b" -- baz',
    '}'
  ], {G: g});
  it('works when overriding and extending rules', function() {
    t.deepEqual(definitionLoc(g2, 'foo'), [12, 22]);
    t.deepEqual(definitionLoc(g2, 'bar'), [25, 48]);
    t.deepEqual(definitionLoc(g2, 'bar_baz'), [38, 48]);
  });
  t.end();
});

test('rule invocation interval', function(t) {
  var g = util.makeGrammar([
    'G {',
    '  foo = bar',
    '  beep = letter bar',
    '  bar = "a" | "blah" | /[a-z]/ -- baz',
    '}'
  ]);

  function fromLoc(pexpr) {
    return [pexpr.interval.startIdx, pexpr.interval.endIdx];
  }
  var fooBody = g.ruleDict.foo;
  var beepBody = g.ruleDict.beep;
  var barBody = g.ruleDict.bar;
  it('works for regular rule applications', function() {
    t.deepEqual(fromLoc(fooBody), [12, 15]);
    t.deepEqual(fromLoc(beepBody.factors[1]), [32, 35]);
  });
  t.deepEqual(fromLoc(beepBody.factors[0]), [25, 31], 'works for built-in rule applications');
  it('works for primitives', function() {
    t.deepEqual(fromLoc(barBody.terms[0]), [44, 47]);
    t.deepEqual(fromLoc(barBody.terms[1]), [50, 56]);

    var barBazBody = g.ruleDict.bar_baz;
    t.deepEqual(fromLoc(barBazBody), [59, 66]);
  });
  t.deepEqual(fromLoc(beepBody), [25, 35], 'works for seq');
  t.deepEqual(fromLoc(barBody), [44, 73], 'works for alt');
  t.end();
});

test('toDisplayString', function(t) {
  var g = util.makeGrammar('G { start = "ab" | letter* | /[a-z]/ }');
  it('does the right thing', function() {
    var seq = g.ruleDict.start;
    t.equal(seq.toDisplayString(), '"ab" | letter* | /[a-z]/');
    t.equal(seq.terms[0].toDisplayString(), '"ab"');

    var many = seq.terms[1];
    t.equal(many.toDisplayString(), 'letter*');
    t.equal(many.expr.toDisplayString(), 'letter');

    t.equal(seq.terms[2].toDisplayString(), '/[a-z]/');
  });
  t.end();
});

test('pexpr.toString()', function(t) {
  var g = util.makeGrammar(
      'G { start = &"a" ~(2 | 3?) ``b a\'\' [c {e: b, ...} {g: /[a-z]/}]  a = 1  b = 2  c = 3 }');
  var e = g.ruleDict.start;
  t.equal(e.toString(), '(&"a" ~(2 | 3?) ``(b a)\'\' [(c {"e": b, ...} {"g": /[a-z]/})])');
  t.end();
});

test('default start rule', function(t) {
  var g = util.makeGrammar('G {}');
  t.equal(g.defaultStartRule, undefined, 'undefined for an empty grammar');
  t.throws(function() { g.match('a'); }, /Missing start rule/, 'match throws with no start rule');
  t.equal(Grammar.ProtoBuiltInRules.defaultStartRule, undefined, 'undefined for ProtoBuiltInRules');
  t.equal(Grammar.BuiltInRules.defaultStartRule, undefined, 'undefined for BuiltInRules');

  var g2 = util.makeGrammar('G2 <: G {}', {G:g});
  t.equal(g2.defaultStartRule, undefined, 'undefined for a subgrammar too');
  t.throws(function() { g2.match('a'); }, /Missing start rule/, 'match throws with no start rule');

  var ns = util.makeGrammars(['G { foo = "a" }', 'G2 <: G {}']);
  t.equal(ns.G.defaultStartRule, 'foo', 'only rule becomes default start rule');
  t.equal(ns.G2.defaultStartRule, 'foo', 'start rule is inherited from supergrammar');
  t.ok(ns.G.match('a'), 'match works without a start rule argument');
  t.ok(ns.G2.match('a'));

  var g3 = util.makeGrammar('G3 <: G { bar = "b" }', ns);
  t.equal(g3.defaultStartRule, 'foo', 'start rule is still inherited');
  t.ok(g3.match('a'));

  var g4 = util.makeGrammar('G4 <: G3 { blah = "c" }', {G3:g3});
  t.equal(g4.defaultStartRule, 'foo', 'start rule inherited from super-supergrammar');
  t.ok(g4.match('a'));

  g = util.makeGrammar('G { digit += _ }');
  t.equal(g.defaultStartRule, undefined, "extending alone doesn't set the start rule");
  t.throws(function() { g.match('a'); }, /Missing start rule/, 'match throws with no start rule');
  g = util.makeGrammar(['G { digit += _', 'blah = "3" }'])
  t.equal(g.defaultStartRule, 'blah', 'rule defined after extending becomes start rule');
  t.ok(g.match('3'));

  g = util.makeGrammar('G { digit := _ }');
  t.equal(g.defaultStartRule, undefined, "overriding alone doesn't set the start rule");
  t.throws(function() { g.match('a'); }, /Missing start rule/, 'match throws with no start rule');
  g = util.makeGrammar(['G { digit := _', 'blah = "3" }'])
  t.equal(g.defaultStartRule, 'blah', 'rule defined after overriding becomes start rule');
  t.ok(g.match('3'));

  // Test passing the default start rule as an argument to the Grammar constructor.
  var root = Grammar.BuiltInRules;
  t.throws(function() {
    new Grammar('G', root, {}, 'nonexistentRule');
  }, /Invalid start rule/, 'throws when start rule is not in the grammar');
  t.ok(new Grammar('G', root, {aRule:null}, 'aRule'), 'works when rule is in the ruleDict');
  var ruleDict = Object.create(root.ruleDict);
  t.ok(new Grammar('G', root, ruleDict, 'digit'), 'works when rule is in the supergrammar');

  t.end();
});
