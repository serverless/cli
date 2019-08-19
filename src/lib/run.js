/**
 * Run
 * - Runs a Component method
 */

const path = require('path')
const Context = require('./Context')
const utils = require('../utils')

module.exports = async (serverlessFile, method, inputs) => {
  let Component
  if (utils.fs.isComponentsTemplate(serverlessFile)) {
    Component = require('@serverless/template')
    inputs.template = serverlessFile
  } else {
    Component = serverlessFile
  }

  const config = {
    root: process.cwd(),
    stateRoot: path.join(process.cwd(), '.serverless'),
    debug: inputs.debug,
    entity: Component.constructor.name
  }
  const context = new Context(config)

  try {
    const component = new Component(undefined, context)
    await component.init()
    let outputs

    if (method) {
      if (typeof component[method] !== 'function') {
        throw Error(`  method ${method} not found`)
      }
      outputs = await component[method](inputs)
    } else {
      outputs = await component(inputs)
    }

    context.renderOutputs(outputs)
    context.close('done')
    process.exit(0)
  } catch (e) {
    context.renderError(e)
    context.close('error', e)
    process.exit(1)
  }
}
