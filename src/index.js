const path = require('path')
const args = require('minimist')(process.argv.slice(2))
const { utils } = require('@serverless/core')
const Context = require('./Context')

const getServerlessFile = (dir) => {
  const jsFilePath = path.join(dir, 'serverless.js')
  const ymlFilePath = path.join(dir, 'serverless.yml')
  const yamlFilePath = path.join(dir, 'serverless.yaml')
  const jsonFilePath = path.join(dir, 'serverless.json')

  if (utils.fileExistsSync(jsFilePath)) {
    return require(jsFilePath)
  }

  try {
    if (utils.fileExistsSync(ymlFilePath)) {
      return utils.readFileSync(ymlFilePath)
    }
    if (utils.fileExistsSync(yamlFilePath)) {
      return utils.readFileSync(yamlFilePath)
    }
  } catch (e) {
    // todo currently our YAML parser does not support
    // CF schema (!Ref for example). So we silent that error
    // because the framework can deal with that
    if (e.name !== 'YAMLException') {
      throw e
    }
    return false
  }

  if (utils.fileExistsSync(jsonFilePath)) {
    return utils.readFileSync(jsonFilePath)
  }

  return false
}

const isComponentsTemplate = (serverlessFile) => {
  if (typeof serverlessFile !== 'object') {
    return false
  }

  // make sure it's NOT a framework file
  if (serverlessFile.provider && serverlessFile.provider.name) {
    return false
  }

  // make sure it IS a components file
  for (const key in serverlessFile) {
    if (serverlessFile[key] && serverlessFile[key].component) {
      return true
    }
  }

  return false
}

const isComponentsFile = (serverlessFile) => {
  if (typeof serverlessFile === 'function' || isComponentsTemplate(serverlessFile)) {
    return true
  }
  return false
}
// // needs to be a sync function to work simply with v1
const runningComponents = () => {
  const serverlessFile = getServerlessFile(process.cwd())

  if (serverlessFile && isComponentsFile(serverlessFile)) {
    return true
  }

  return false
}

const runComponents = async () => {
  const serverlessFile = getServerlessFile(process.cwd())

  if (!serverlessFile || !isComponentsFile(serverlessFile)) {
    return
  }

  const method = args._[0] || undefined
  const inputs = args
  delete inputs._ // remove the method name if any

  let Component
  if (isComponentsTemplate(serverlessFile)) {
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

module.exports = { runningComponents, runComponents }
