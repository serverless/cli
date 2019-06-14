const path = require('path')
const args = require('minimist')(process.argv.slice(2))
const Context = require('./Context')

/**
 * serverless
 */

// todo support remove/methods
const run = async () => {
  const method = args._[0] || null
  const Component = require(path.join(process.cwd(), 'serverless'))

  const config = {
    root: process.cwd(),
    stateRoot: path.join(process.cwd(), '.serverless'),
    stage: args.s || args.stage ? args.s || args.stage : 'dev'
  }
  const context = new Context(config)
  await context.setCredentials()

  const componentId = `${config.stage}.${Component.constructor.name}`
  const component = new Component(undefined, context)
  await component.init()

  try {
    if (method) {
      await component[method]()
    } else {
      await component()
    }
    context.close('done')
  } catch (e) {
    context.error(e)
  }
}

module.exports = run
