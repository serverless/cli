const args = require('minimist')(process.argv.slice(2))
const cliVersion = require('../package.json').version
const coreVersion = require('@serverless/core/package.json').version
const { getServerlessFile, getServerlessComponentFile } = require('./utils')
const CLI = require('./CLI')

const runningComponents = () => {
  const serverlessFile = getServerlessComponentFile(process.cwd())

  if (serverlessFile) {
    return true
  }

  return false
}

const runComponents = async () => {
  const serverlessComponentFile = getServerlessComponentFile(process.cwd())
  const serverlessFile = getServerlessFile(process.cwd())
  if (!serverlessFile && !serverlessComponentFile) {
    return
  }

  const command = args._[0]
  let cli
  try {
    const commandFn = require(`./commands/${command}`)
    const debug = args.debug ? true : false
    cli = new CLI({ debug })

    await commandFn(cli)
  } catch (e) {
    if (e.message.includes(`Cannot find module './commands/${command}'`)) {
      const error = new Error(`Command "${command}" Does Not Exist`)
      error.name = 'CommandNotFound'
      throw error
    }
    throw e
    cli.renderError(e)
    cli.close('error', e)
    process.exit(1)
  }
}

module.exports = { runningComponents, runComponents, cliVersion, coreVersion }
