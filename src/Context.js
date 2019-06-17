// CLI context
// - saves state in cwd
// - generates credentials from cwd
// - logs stuff in CLI
const os = require('os')
const util = require('util')
const chalk = require('chalk')
const ansiEscapes = require('ansi-escapes')
const stripAnsi = require('strip-ansi')
const figures = require('figures')
const dotenv = require('dotenv')
const path = require('path')
const { utils } = require('@serverless/core')

// Serverless Components CLI Colors
const grey = chalk.dim
const green = chalk.rgb(0, 253, 88)
const yellow = chalk.rgb(255, 242, 129)
const red = chalk.rgb(255, 93, 93)
const { bold } = chalk.gray

class CLI {
  constructor(config) {
    this.root = path.resolve(config.root) || process.cwd()
    this.stateRoot = config.stateRoot
      ? path.resolve(config.stateRoot)
      : path.join(this.root, '.serverless')
    this.credentials = config.credentials || {}
    this.outputs = {}
    this.resourceGroupId = Math.random()
    .toString(36)
    .substring(6)

    // Defaults
    this._ = {}
    this._.entity = 'Components'
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
    process.on('SIGINT', async function() {
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

  config(config) {
    if (typeof config.useTimer === 'boolean') {
      this._.useTimer = config.useTimer
    }
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

  getRelativeVerticalCursorPosition(contentString) {
    const base = 2
    const terminalWidth = process.stdout.columns
    const contentWidth = stripAnsi(contentString).length
    const nudges = Math.ceil(Number(contentWidth) / Number(terminalWidth))
    return base + nudges
  }

  async statusEngine() {
    this.renderStatusEngineStatement()
    await utils.sleep(100)
    if (this.isStatusEngineActive()) {
      return this.statusEngine()
    }
  }

  isStatusEngineActive() {
    return this._.status.running
  }

  statusEngineStart() {
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
      message = green('done')
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.cursorLeft)
    process.stdout.write(ansiEscapes.eraseDown)
    console.log(os.EOL) // eslint-disable-line

    // Write content
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

  renderStatusEngineStatement(status, entity) {
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
    console.log(os.EOL) // eslint-disable-line
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

  renderStatusStatement(status, entity) {
    // If no arguments, skip
    if (!status || status == '') {
      return
    }
    if (!entity || entity == '') {
      return
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown)
    console.log() // eslint-disable-line

    // Write log
    entity = `${this._.useTimer ? grey(this._.seconds + `s` + figures.pointerSmall) : ''} ${grey(
      entity
    )} ${grey(figures.pointerSmall)} ${grey(`status:`)}`
    console.log(`  ${entity}`) // eslint-disable-line
    console.log(` `, status) //eslint-disable-line

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft)
  }

  renderStatus(verbose, status, entity) {
    if (!verbose) {
      return this.renderStatusEngineStatement(status, entity)
    }
    return this.renderStatusStatement(status, entity)
  }

  renderLog(log) {
    if (!log || log == '') {
      console.log() // eslint-disable-line
      return
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown)
    console.log() // eslint-disable-line

    console.log(`  ${log}`) // eslint-disable-line

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft)
  }

  renderWarning(warning, entity) {
    // If no argument, skip
    if (!warning || warning === '') {
      return
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown)
    console.log() // eslint-disable-line

    // Write warning
    if (entity) {
      entity = `${yellow(entity)} ${yellow(figures.pointerSmall)} ${yellow(`Warning:`)}`
      console.log(`  ${entity}`) // eslint-disable-line
    } else {
      console.log(` ${yellow('warning:')}`) // eslint-disable-line
    }
    console.log(` `, warning) // eslint-disable-line

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft)
  }

  renderError(error, entity) {
    // If no argument, skip
    if (!error || error === '') {
      return
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
    console.log(` `, error) // eslint-disable-line

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft)
  }

  renderOutputs(outputs, entity) {
    // If no argument, skip
    if (!outputs || !Object.keys(outputs).length) {
      return
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown)
    console.log() // eslint-disable-line

    // Write Outputs
    if (entity) {
      entity = `${green(entity)} ${green(figures.pointerSmall)} ${green(`outputs:`)}`
      console.log(`  ${entity}`) // eslint-disable-line
    } else {
      console.log(`  ${green('outputs:')}`) // eslint-disable-line
    }

    for (const output in outputs) {
      // If nested object, pretty-print at least one level to help readability
      if (!!outputs[output] && outputs[output].constructor === Object) {
        const nextOutputs = outputs[output]
        console.log(`  ${grey(output + ':')} `) // eslint-disable-line
        for (const nextOutput in nextOutputs) {
          // eslint-disable-next-line
          console.log(
            `    ${grey(nextOutput + ':')} `,
            util.inspect(nextOutputs[nextOutput], { colors: false })
          )
        }
      } else {
        // eslint-disable-next-line
        console.log(`  ${grey(output + ':')} `, util.inspect(outputs[output], { colors: false }))
      }
    }

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft)
  }

  renderOutput(key, value) {
    // If no argument, skip
    if (!key || !value) {
      console.log()
      return
    }
    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown)

    console.log(`  ${bold(key + ':')} ${value}`)
  }

  // basic CLI utilities
  log(msg) {
    this.renderLog(msg)
  }

  status(verbose, status, entity) {
    this.renderStatus(verbose, status, entity)
  }

  warn(warning, entity) {
    this.renderWarning(warning, entity)
  }

  error(error, entity) {
    if (typeof error === 'string') {
      error = new Error(error)
    }
    this.renderError(error, entity)
    this.close('error', error)
  }

  output(key, value) {
    this.outputs[key] = value
    this.renderOutput(key, value)
  }

  async readState(id) {
    const stateFilePath = path.join(this.stateRoot, `${id}.json`)
    let state = {
      resourceGroupId: this.resourceGroupId
    }
    if ((await fileExists(stateFilePath)) && (await readFile(stateFilePath)).resourceGroupId) {
      state = await readFile(stateFilePath)
      this.resourceGroupId = state.resourceGroupId
    } else {
      await this.writeState(id, state)
    }

    return state
  }

  async writeState(id, state) {
    const stateFilePath = path.join(this.stateRoot, `${id}.json`)
    await utils.writeFile(stateFilePath, state)
    return state
  }

  async setCredentials() {
    // Load env vars
    let envVars = {}
    const defaultEnvFilePath = path.join(this.root, `.env`)
    const stageEnvFilePath = path.join(this.root, `.env.dev`) // todo remove this
    if (await utils.fileExists(stageEnvFilePath)) {
      envVars = dotenv.config({ path: path.resolve(stageEnvFilePath) }).parsed || {}
    } else if (await utils.fileExists(defaultEnvFilePath)) {
      envVars = dotenv.config({ path: path.resolve(defaultEnvFilePath) }).parsed || {}
    }

    // Known Provider Environment Variables and their SDK configuration properties
    const providers = {}

    // AWS
    providers.aws = {}
    providers.aws.AWS_ACCESS_KEY_ID = 'accessKeyId'
    providers.aws.AWS_SECRET_ACCESS_KEY = 'secretAccessKey'
    providers.aws.AWS_REGION = 'region'

    const credentials = {}

    for (const provider in providers) {
      const providerEnvVars = providers[provider]
      for (const providerEnvVar in providerEnvVars) {
        if (!envVars.hasOwnProperty(providerEnvVar)) {
          continue
        }
        if (!credentials[provider]) {
          credentials[provider] = {}
        }
        credentials[provider][providerEnvVars[providerEnvVar]] = envVars[providerEnvVar]
      }
    }

    this.credentials = credentials

    return credentials
  }
}

module.exports = CLI
