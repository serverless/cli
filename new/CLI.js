const os = require('os')
const chalk = require('chalk')
const ansiEscapes = require('ansi-escapes')
const stripAnsi = require('strip-ansi')
const figures = require('figures')
const dotenv = require('dotenv')
const path = require('path')
const prettyoutput = require('prettyoutput')
const { utils } = require('@serverless/core')
const packageJson = require('../package.json')

// Serverless Components CLI Colors
const grey = chalk.dim
const green = chalk.rgb(0, 253, 88)
const red = chalk.rgb(255, 93, 93)

class CLI {
  constructor(config = {}) {
    this.command = config.command
    this.version = packageJson.version
    this.debugMode = config.debug || false

    // Defaults
    this._ = {}
    this._.entity = 'Serverless'
    this._.useTimer = true
    this._.seconds = 0
    // Status defaults
    this._.status = {}
    this._.status.running = false
    this._.status.message = 'Running'
    this._.status.loadingDots = ''
    this._.status.loadingDotCount = 0

    // Hide cursor always, to keep it clean
    process.stdout.write(ansiEscapes.cursorHide)

    // Event Handler: Control + C
    process.on('SIGINT', async () => {
      if (this.isStatusEngineActive()) {
        return this.statusEngineStop('cancel')
      }
      process.exit(1)
    })

    // Count seconds
    setInterval(() => {
      this._.seconds++
    }, 1000)
  }

  getRelativeVerticalCursorPosition(contentString) {
    const base = 1
    const terminalWidth = process.stdout.columns
    const contentWidth = stripAnsi(contentString).length
    const nudges = Math.ceil(Number(contentWidth) / Number(terminalWidth))
    return base + nudges
  }

  async statusEngine() {
    this.renderStatus()
    await utils.sleep(100)
    if (this.isStatusEngineActive()) {
      return this.statusEngine()
    }
  }

  isStatusEngineActive() {
    return this._.status.running
  }

  statusEngineStart() {
    if (this.debugMode) {
      this.log()
    }
    this._.status.running = true
    // Start Status engine
    return this.statusEngine()
  }

  statusEngineStop(reason, message) {
    this._.status.running = false

    if (reason === 'error') {
      message = red(message)
    }
    if (reason === 'cancel') {
      message = red('canceled')
    }
    if (reason === 'done') {
      message = green(message || 'done')
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.cursorLeft)
    process.stdout.write(ansiEscapes.eraseDown)

    // Write content
    this.log()
    let content = ' '
    if (this._.useTimer) {
      content += ` ${grey(this._.seconds + 's')}`
      content += ` ${grey(figures.pointerSmall)}`
    }
    content += ` ${this._.entity}`
    content += ` ${grey(figures.pointerSmall)} ${message}`
    process.stdout.write(content)

    // Put cursor to starting position for next view
    console.log(os.EOL) // eslint-disable-line
    process.stdout.write(ansiEscapes.cursorLeft)
    process.stdout.write(ansiEscapes.cursorShow)

    if (reason === 'error') {
      process.exit(1)
    } else {
      process.exit(0)
    }
  }

  renderStatus(status, entity) {
    // Start Status engine, if it isn't running yet
    if (!this.isStatusEngineActive()) {
      this.statusEngineStart()
    }

    // Set global status
    if (status) {
      this._.status.message = status
    }

    // Set global status
    if (entity) {
      this._.entity = entity
    }

    // Loading dots
    if (this._.status.loadingDotCount === 0) {
      this._.status.loadingDots = `.`
    } else if (this._.status.loadingDotCount === 2) {
      this._.status.loadingDots = `..`
    } else if (this._.status.loadingDotCount === 4) {
      this._.status.loadingDots = `...`
    } else if (this._.status.loadingDotCount === 6) {
      this._.status.loadingDots = ''
    }
    this._.status.loadingDotCount++
    if (this._.status.loadingDotCount > 8) {
      this._.status.loadingDotCount = 0
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown)

    // Write content
    console.log() // eslint-disable-line
    let content = ' '
    if (this._.useTimer) {
      content += ` ${grey(this._.seconds + 's')}`
      content += ` ${grey(figures.pointerSmall)}`
    }

    content += ` ${this._.entity}`
    content += ` ${grey(figures.pointerSmall)} ${grey(this._.status.message)}`
    content += ` ${grey(this._.status.loadingDots)}`
    process.stdout.write(content)
    console.log() // eslint-disable-line

    // Get cursor starting position according to terminal & content width
    const startingPosition = this.getRelativeVerticalCursorPosition(content)

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorUp(startingPosition))
    process.stdout.write(ansiEscapes.cursorLeft)
  }

  renderLog(msg) {
    if (!msg || msg == '') {
      console.log() // eslint-disable-line
      return
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown)
    // console.log() // eslint-disable-line

    console.log(`  ${msg}`) // eslint-disable-line

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft)
  }

  renderDebug(msg) {
    if (!this.debugMode || !msg || msg == '') {
      return
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown)

    console.log(`  ${msg}`) // eslint-disable-line

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft)
  }

  renderError(error, entity) {
    // If no argument, skip
    if (!error || error === '') {
      return
    }

    if (typeof error === 'string') {
      error = new Error(error)
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown)
    console.log() // eslint-disable-line

    // Write Error
    if (entity) {
      entity = `${red(entity)} ${red(figures.pointerSmall)} ${red(`error:`)}`
      console.log(`  ${entity}`) // eslint-disable-line
    } else {
      console.log(`  ${red('error:')}`) // eslint-disable-line
    }

    delete error.name
    console.log(` `, error) // eslint-disable-line

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft)
  }

  renderOutputs(outputs) {
    if (typeof outputs !== 'object' || Object.keys(outputs).length === 0) {
      return
    }
    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown)
    console.log() // eslint-disable-line
    process.stdout.write(prettyoutput(outputs, {}, 2)) // eslint-disable-line
  }

  close(reason, message) {
    // Skip if not active
    process.stdout.write(ansiEscapes.cursorShow)
    if (!this.isStatusEngineActive()) {
      console.log() // eslint-disable-line
      process.exit(0)
      return
    }
    return this.statusEngineStop(reason, message)
  }

  // basic CLI utilities
  log(msg) {
    this.renderLog(msg)
  }

  debug(msg) {
    this.renderDebug(msg)
  }

  status(status, entity) {
    this.renderStatus(status, entity)
  }

  error(e) {
    this.renderError(e)
    this.close('error', e)
  }

  outputs(outputs) {
    return this.renderOutputs(outputs)
  }
}

module.exports = CLI
