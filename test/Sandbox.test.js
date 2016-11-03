const expect = require('chai').expect;
const Sandbox = require('../lib/Sandbox');

describe('Sandbox', () => {
  let testSandbox;

  before(() => {
    testSandbox = new Sandbox({
      env: {
        MY_GLOBALVAR: 'test',
      },
      globalModules: [
        'fs',
      ],
      asyncTimeout: 100,
      config: {
        test: 'test',
      },
    });
  });

  it('should assure the globalModules were required', () => {
    expect(testSandbox.loadedGlobalModules[0]).to.have.property('readFile');
  });

  describe('#createEmptyContext()', () => {
    let context;
    before(() => {
      const backstageOptions = { pluggedAction: true };
      context = testSandbox.createEmptyContext(backstageOptions);
    });

    it('should return context with Backstage modules', () => {
      expect(context.Backstage.modules).to.eql({});
    });

    it('should return context with Backstage env', () => {
      expect(context.Backstage.env.MY_GLOBALVAR).to.eql('test');
    });

    it('should return context with Backstage config', () => {
      expect(context.Backstage.config.test).to.eql('test');
    });

    it('should return context with console', () => {
      expect(context.console).to.be.eql(console);
    });

    it('should return context with exports', () => {
      expect(context.exports).to.eql({});
    });

    it('should return context with module', () => {
      expect(context.module).to.eql({ exports: {} });
    });

    it('should return context with setTimeout', () => {
      expect(context.setTimeout).to.equal(setTimeout);
    });

    it('should return context with Buffer', () => {
      expect(context.Buffer).to.equal(Buffer);
    });

    it('should allow to extends Backstage object', () => {
      expect(context.Backstage.pluggedAction).to.be.true;
    });

    it('should return context with require', () => {
      expect(context.require).to.exist;
    });

    it('should return context with relativeRequire', () => {
      expect(context.relativeRequire).to.exist;
    });

    describe('when attach a module', () => {
      before(() => {
        context.Backstage.modules['./foo'] = () => 10;
        context.Backstage.modules['./foo/bar'] = () => 20;
      });

      it('should allow import absolute modules', () => {
        expect(context.require('./foo')).to.be.eql(10);
      });

      it('should allow import relative modules', () => {
        const relativeRequire = context.relativeRequire('foo');
        expect(relativeRequire('./bar')).to.be.eql(20);
      });
    });
  });

  describe('#testSyntaxError()', () => {
    describe('when code is correct', () => {
      it('should not return any error', () => {
        const code = 'function main() {}';
        const result = testSandbox.testSyntaxError('test.js', code);

        expect(result).to.be.null;
      });
    });

    describe('when code has any SyntaxError', () => {
      it('should raise an error', () => {
        const code = 'var a = [};';
        const result = testSandbox.testSyntaxError('test.js', code);

        expect(result.error).to.be.eql('SyntaxError: Unexpected token }');
        expect(result.stack).to.be.eql('');
      });
    });

    describe('when code has a RuntimeError', () => {
      it('should raise an error', () => {
        const code = `
             function calculateBar() {
                throw new Error('Runtime Error');
             }
             calculateBar();
             function main() {}
        `;
        const result = testSandbox.testSyntaxError('test.js', code);

        expect(result.error).to.be.eql('Error: Runtime Error');
        expect(result.stack).to.be.eql('at calculateBar (test.js:3)\n' +
                                       'at test.js:5\n' +
                                       'at test.js:8');
      });
    });
  });

  describe('#compileCode() and #runScript()', () => {
    describe('when code has a const variable', () => {
      it('should allow to compile two times', (done) => {
        const filename = 'test.js';

        const code1 = 'const a = 10; function main(req, res){ res.send(a); }';
        const code2 = 'const a = 20; function main(req, res){ res.send(a); }';

        const script1 = testSandbox.compileCode(filename, code1);
        const script2 = testSandbox.compileCode(filename, code2);

        Promise
          .all([
            testSandbox.runScript(script1, {}),
            testSandbox.runScript(script2, {}),
          ])
          .then(([res1, res2]) => {
            expect(res1.body).to.be.eql(10);
            expect(res2.body).to.be.eql(20);
            done();
          })
          .catch((error) => {
            done(error);
          });
      });
    });

    describe('when code has an error in main function', () => {
      it('should resolve promise as rejected', (done) => {
        const filename = 'test.js';
        const code = 'function main(req, res){ throw new Error(\'An error\'); }';
        const script = testSandbox.compileCode(filename, code);

        testSandbox
          .runScript(script, {})
          .then(() => {
            done(new Error('It is expected an error'));
          }, (error) => {
            expect(error.message).to.be.eql('An error');
            done();
          })
          .catch(err => done(err));
      });
    });

    describe('when code has an error in anonymous function', () => {
      it('should resolve promise as rejected', (done) => {
        const filename = 'test.js';
        const code = `
          function main(req, res) {
            setTimeout(() => {
              throw new Error('An error');
            }, 10);
          }
        `;
        const script = testSandbox.compileCode(filename, code);

        testSandbox
          .runScript(script, {})
          .then(() => {
            done(new Error('It is expected an error'));
          }, (error) => {
            expect(error.message).to.be.eql('An error');
            done();
          })
          .catch(err => done(err));
      });
    });

    describe('when code has a timeout problem', () => {
      it('should resolve promise as rejected', (done) => {
        const filename = 'test.js';
        const code = 'function main(req, res) {}';
        const script = testSandbox.compileCode(filename, code);

        testSandbox
          .runScript(script, {})
          .then(() => {
            done(new Error('It is expected an error'));
          }, (error) => {
            expect(error.message).to.be.eql('Function timeout');
            done();
          })
          .catch(err => done(err));
      });
    });
  });

  describe('#runLocalCode()', () => {
    describe('when code is correct', () => {
      it('should not return any error', (done) => {
        const filename = './test/support/valid.js';
        const req = {};

        testSandbox
          .runLocalCode(filename, req)
          .then((result) => {
            expect(result.body).to.be.eql(11);
            expect(result.status).to.be.eql(200);
            done();
          }).catch(err => done(err));
      });
    });

    describe('when code is incorrect', () => {
      it('should return any error', (done) => {
        const filename = './test/support/invalid.js';
        const req = {};

        testSandbox
          .runLocalCode(filename, req)
          .catch((err) => {
            expect(err.message).to.be.eql('b is not defined');
            done();
          }).catch(err => done(err));
      });
    });
  });
});
