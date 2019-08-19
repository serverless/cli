const args = require('minimist')(process.argv.slice(2))
const lib = require('./lib')
const utils = require('./utils')

/**
 * Running Components
 * - Checks if CWD is a Component
 * - Needs to be a sync function to work simply with SFV1
 */

const runningComponents = () => {
  const serverlessFile = utils.fs.getServerlessFile(process.cwd())

  if (serverlessFile && utils.fs.isComponentsFile(serverlessFile)) {
    return true
  }

  return false
}

/**
 * Run Components
 * - Runs a Component's method
 */

const runComponents = async () => {
  const serverlessFile = utils.fs.getServerlessFile(process.cwd())

  if (!serverlessFile || !utils.fs.isComponentsFile(serverlessFile)) {
    return
  }

  const method = args._[0] || undefined
  const inputs = args
  delete inputs._ // remove the method name if any

  // Handle routing
  switch (method) {
    case 'publish':
      return await lib.publish(inputs)
    case 'unpublish':
      return await lib.unpublish(inputs)
    case 'login':
      return await lib.login(inputs)
    case 'logout':
      return await lib.logout(inputs)
    default:
      return await lib.run(serverlessFile, method, inputs)
  }
}

module.exports = {
  runningComponents,
  runComponents
}
