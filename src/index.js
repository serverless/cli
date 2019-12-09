const args = require('minimist')(process.argv.slice(2))
const cliVersion = require('../package.json').version
const { isComponentsProject } = require('./utils')
const commands = require('./commands')
const cli = require('./cli')

// Keeping it backward compatible
const runningComponents = () => isComponentsProject()

const runComponents = async () => {
  const config = {}
  config.command = args._[0] || 'deploy'
  config.debug = args.debug ? true : false
  config.timer = commands[config.command] ? false : true

  // Start CLI process
  cli.start(config)

  try {
    if (commands[config.command]) {
      await commands[config.command](config)
    } else {
      await commands.custom(config)
    }
  } catch (e) {
    return cli.error(e)
  }
}

// TODO I removed the core version because the core has moved to
// a backend layer. We need to remove that from the Framework V1
// otherwise it'll break
module.exports = { runningComponents, runComponents, cliVersion }
