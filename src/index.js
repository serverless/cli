const path = require('path')
const args = require('minimist')(process.argv.slice(2))
const { utils } = require('@serverless/core')
const Context = require('./Context')

// needs to be a sync function to work simply with v1
const runningComponents = () => {
  const serverlessJsPath = path.join(process.cwd(), 'serverless.js')

  if (utils.fileExistsSync(serverlessJsPath)) {
    const component = require(serverlessJsPath)
    if (typeof component === 'function') {
      return true
    }
  }
  return false
}

const runComponents = async () => {
  const method = args._[0] || undefined
  const inputs = args
  delete inputs._ // remove the method name if any

  const componentPath = path.join(process.cwd(), 'serverless.js')

  if (!(await utils.fileExists(componentPath))) {
    console.log() // eslint-disable-line
    console.log('  serverless.js file not found.') // eslint-disable-line
    console.log() // eslint-disable-line
    return
  }

  const Component = require(componentPath)

  const config = {
    root: process.cwd(),
    stateRoot: path.join(process.cwd(), '.serverless'),
    debug: inputs.debug,
    entity: Component.constructor.name
  }
  const context = new Context(config)

  try {
    await context.setCredentials()

    const component = new Component(undefined, context)
    await component.init()

    if (method) {
      if (typeof component[method] !== 'function') {
        throw Error(`  method ${method} not found`)
      }
      await component[method](inputs)
    } else {
      await component(inputs)
    }
    context.close('done')
  } catch (e) {
    context.error(e)
  }
}

module.exports = { runningComponents, runComponents }
