'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')
const spawnSync = require('child_process').spawnSync

function runChild () {
  const fixture = JSON.parse(process.env.RESUME_TEST_CASE)
  const target = process.env.RESUME_TEST_TARGET
  const prompts = []
  const output = []
  const rejections = []
  let thrown
  let returned
  const originalLog = console.log
  const bold = value => '<bold>' + value + '</bold>'
  bold.cyan = value => '<cyan>' + value + '</cyan>'
  bold.red = value => '<red>' + value + '</red>'
  const entry = new Module(target, module)
  entry.filename = target
  entry.require = name => {
    if (name === 'chalk') return { bold }
    if (name === 'inquirer') {
      return {
        prompt: options => {
          const index = prompts.length
          prompts.push(JSON.parse(JSON.stringify(options)))
          if (fixture.rejectAt === index) return Promise.reject(new Error('fixture prompt rejection'))
          if (index >= fixture.answers.length) return Promise.reject(new Error('Unexpected extra prompt'))
          return Promise.resolve(fixture.answers[index])
        }
      }
    }
    assert.strictEqual(name, fixture.defaultPath ? './resume.json' : fixture.resumePath)
    return require(fixture.resumePath)
  }
  process.on('unhandledRejection', error => {
    rejections.push({ name: error.name, message: error.message })
  })
  try {
    console.log = value => output.push(value)
    entry._compile(fs.readFileSync(target, 'utf8'), target)
    returned = entry.exports(fixture.defaultPath ? undefined : fixture.resumePath, fixture.options)
  } catch (error) {
    thrown = { name: error.name, message: error.message }
  }
  let remaining = 6
  function finish () {
    if (remaining--) return setImmediate(finish)
    console.log = originalLog
    process.stdout.write(JSON.stringify({ prompts, output, rejections, thrown, returnsUndefined: returned === undefined }))
  }
  finish()
}

function runTests () {
  const target = path.resolve(process.env.RESUME_TEST_TARGET || path.join(__dirname, 'index.js'))
  const separator = '--------------------------------------'
  const sectionOutput = ['<cyan>' + separator + '</cyan>', '<bold>fixture detail</bold>', '<cyan>' + separator + '</cyan>']
  const main = answer => ({ answer })
  const follow = exitBack => ({ exitBack })
  const cases = [
    { name: 'main Exit finishes immediately', answers: [main('Exit')], count: 1 },
    { name: 'empty resume can exit', resume: {}, answers: [main('Exit')], count: 1 },
    { name: 'reserved Exit does not display a section', resume: { Exit: ['reserved section'] }, answers: [main('Exit')], count: 1 },
    { name: 'greeting is retained on Exit', answers: [main('Exit')], options: { greeting: 'Hello fixture' }, count: 1, output: ['Hello fixture'] },
    { name: 'lowercase exit remains a section', resume: { exit: ['fixture detail'] }, answers: [main('exit'), follow('Exit')], count: 2, output: sectionOutput },
    { name: 'uppercase EXIT remains a section', resume: { EXIT: ['fixture detail'] }, answers: [main('EXIT'), follow('Exit')], count: 2, output: sectionOutput },
    { name: 'mixed case section remains a section', resume: { eXiT: ['fixture detail'] }, answers: [main('eXiT'), follow('Exit')], count: 2, output: sectionOutput },
    { name: 'section then Exit', answers: [main('About'), follow('Exit')], count: 2, output: sectionOutput },
    { name: 'Back then main Exit', answers: [main('About'), follow('Back'), main('Exit')], count: 3, output: sectionOutput },
    { name: 'Back then another section', resume: { About: ['fixture detail'], Skills: ['second detail'] }, answers: [main('About'), follow('Back'), main('Skills'), follow('Exit')], count: 4, output: sectionOutput.concat(['<cyan>' + separator + '</cyan>', '<bold>second detail</bold>', '<cyan>' + separator + '</cyan>']) },
    { name: 'custom formatting and greeting', answers: [main('About'), follow('Exit')], options: { greeting: 'Hi', seperator: '***', seperatorColor: 'red' }, count: 2, output: ['Hi', '<red>***</red>', '<bold>fixture detail</bold>', '<red>***</red>'] },
    { name: 'empty section keeps separators', resume: { About: [] }, answers: [main('About'), follow('Exit')], count: 2, output: ['<cyan>' + separator + '</cyan>', '<cyan>' + separator + '</cyan>'] },
    { name: 'false section skips details', resume: { About: false }, answers: [main('About'), follow('Exit')], count: 2 },
    { name: 'unknown choice keeps follow-up behavior', answers: [main('Unknown'), follow('Exit')], count: 2 },
    { name: 'lowercase back does not repeat', answers: [main('About'), follow('back')], count: 2, output: sectionOutput },
    { name: 'default resume identifier is unchanged', defaultPath: true, answers: [main('Exit')], count: 1 },
    { name: 'first prompt rejection remains unhandled', answers: [], rejectAt: 0, count: 1, rejection: 'fixture prompt rejection' },
    { name: 'follow-up rejection remains unhandled', answers: [main('About')], rejectAt: 1, count: 2, output: sectionOutput, rejection: 'fixture prompt rejection' },
    { name: 'repeated main prompt rejection remains unhandled', answers: [main('About'), follow('Back')], rejectAt: 2, count: 3, output: sectionOutput, rejection: 'fixture prompt rejection' },
    { name: 'invalid section type retains rejection', resume: { About: 'text' }, answers: [main('About')], count: 1, output: ['<cyan>' + separator + '</cyan>'], rejectionType: 'TypeError' },
    { name: 'invalid custom color retains rejection', answers: [main('About')], options: { seperatorColor: 'missing' }, count: 1, rejectionType: 'TypeError' },
    { name: 'missing resume still throws synchronously', missing: true, answers: [], count: 0, thrown: 'Error' },
    { name: 'malformed JSON still throws synchronously', malformed: true, answers: [], count: 0, thrown: 'SyntaxError' }
  ]
  let failures = 0
  cases.forEach(testCase => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'instant-resume-test-'))
    const resumePath = path.join(directory, 'resume.json')
    try {
      const resume = testCase.resume || { About: ['fixture detail'] }
      if (!testCase.missing) fs.writeFileSync(resumePath, testCase.malformed ? '{invalid' : JSON.stringify(resume))
      const fixture = Object.assign({}, testCase, { resumePath })
      const result = spawnSync(process.execPath, [__filename], {
        env: Object.assign({}, process.env, { RESUME_TEST_TARGET: target, RESUME_TEST_CASE: JSON.stringify(fixture) }),
        encoding: 'utf8',
        timeout: 5000
      })
      assert.ifError(result.error)
      assert.strictEqual(result.status, 0, result.stderr)
      const actual = JSON.parse(result.stdout)
      assert.strictEqual(actual.returnsUndefined, true)
      assert.strictEqual(actual.prompts.length, testCase.count, 'prompt count')
      actual.prompts.forEach((prompt, index) => {
        assert.deepStrictEqual(prompt, index % 2 === 0
          ? { type: 'list', name: 'answer', message: 'What would you like to know?', choices: Object.keys(resume).concat('Exit') }
          : { type: 'list', name: 'exitBack', message: 'Go back or Exit?', choices: ['Back', 'Exit'] })
      })
      assert.deepStrictEqual(actual.output, testCase.output || [])
      if (testCase.thrown) assert.strictEqual(actual.thrown.name, testCase.thrown)
      else assert.strictEqual(actual.thrown, undefined)
      if (testCase.rejection || testCase.rejectionType) {
        assert.strictEqual(actual.rejections.length, 1)
        if (testCase.rejection) assert.strictEqual(actual.rejections[0].message, testCase.rejection)
        if (testCase.rejectionType) assert.strictEqual(actual.rejections[0].name, testCase.rejectionType)
      } else assert.deepStrictEqual(actual.rejections, [])
      console.log('PASS ' + testCase.name)
    } catch (error) {
      failures++
      console.error('FAIL ' + testCase.name + ': ' + error.message)
    } finally {
      if (!testCase.missing) fs.unlinkSync(resumePath)
      fs.rmdirSync(directory)
    }
  })
  console.log((cases.length - failures) + ' passed; ' + failures + ' failed')
  if (failures) process.exitCode = 1
}

if (process.env.RESUME_TEST_CASE) runChild()
else runTests()
