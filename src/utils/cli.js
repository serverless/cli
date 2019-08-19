/**
 * Utils: CLI
 */

const os = require('os')
const chalk = require('chalk')
const ansiEscapes = require('ansi-escapes')

/**
 * Colors
 */

const colors = {}
colors.grey = chalk.dim
colors.green = chalk.rgb(0, 253, 88)
colors.red = chalk.rgb(255, 93, 93)

/**
 * Close
 */

const close = (reason, message) => {
  if (reason === 'error') {
    message = colors.red(message)
  }
  if (reason === 'cancel') {
    message = colors.red('canceled')
  }
  if (reason === 'done') {
    message = colors.green(message || 'done')
  }

  console.log('') // eslint-disable-line
  process.stdout.write(`${message}`)
  console.log(os.EOL) // eslint-disable-line

  if (reason === 'error') {
    process.exit(1)
  } else {
    process.exit(0)
  }
}

const log = (message, color) => {
  if (color) {
    message = colors[color](message)
  }

  process.stdout.write(`${message}\n`)
}

module.exports = {
  colors,
  close,
  log
}
