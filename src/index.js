const args = require('minimist')(process.argv.slice(2))
const cliVersion = require('../package.json').version
const { isComponentsProject } = require('./utils')
const commands = require('./commands')
const CLI = require('./CLI')

// keeping it backward compatible
const runningComponents = () => isComponentsProject()

const runComponents = async () => {
  const command = args._[0]
  const debug = args.debug ? true : false
  const cli = new CLI({ debug, command })

  try {
    if (commands[command]) {
      await commands[command](cli)
    } else {
      await commands.custom(cli)
    }
  } catch (e) {
    cli.error(e)
  }
}

// TODO I removed the core version because the core has moved to
// a backend layer. We need to remove that from the Framework V1
// otherwise it'll break
module.exports = { runningComponents, runComponents, cliVersion }
