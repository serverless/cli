const args = require('minimist')(process.argv.slice(2))
const path = require('path')
const chokidar = require('chokidar')
const { isComponentsTemplate, getServerlessFile } = require('./utils')
const Context = require('./Context')

const watch = (component, inputs, method, context) => {
  let isProcessing = false
  let queuedOperation = false
  let outputs
  const directory = process.cwd()
  const directoryName = path.basename(directory)
  const watcher = chokidar.watch(directory, { ignored: /\.serverless/ })

  watcher.on('ready', async () => {
    component.context.instance._.useTimer = false
    component.context.instance.renderStatus('Watching', directoryName)

    // UNCOMMENT if we wanna start with deployment before watching

    // try {
    //   if (method) {
    //     outputs = await component[method](inputs)
    //   } else {
    //     outputs = await component(inputs)
    //   }
    //   component.context.instance.renderOutputs(outputs)
    //   component.context.instance._.useTimer = false
    //   component.context.instance.renderStatus('Watching', directoryName)
    // } catch (e) {
    //   component.context.instance.renderError(e)
    //   component.context.instance._.useTimer = false
    //   component.context.instance.renderStatus('Watching', directoryName)
    // }
  })

  watcher.on('change', async () => {
    component.context.instance._.useTimer = true
    try {
      if (isProcessing && !queuedOperation) {
        queuedOperation = true
      } else if (!isProcessing) {
        // perform operation
        isProcessing = true

        const serverlessFile = getServerlessFile(process.cwd())

        let Component
        if (isComponentsTemplate(serverlessFile)) {
          Component = require('@serverless/template')
          inputs.template = serverlessFile
        } else {
          Component = serverlessFile
        }

        component = new Component(undefined, context)
        await component.init()

        component.context.instance._.seconds = 0
        if (method) {
          outputs = await component[method](inputs)
        } else {
          outputs = await component(inputs)
        }
        // check if another operation is queued
        if (queuedOperation) {
          component.context.instance._.seconds = 0
          if (method) {
            outputs = await component[method](inputs)
          } else {
            outputs = await component(inputs)
          }
        }
        // reset everything
        isProcessing = false
        queuedOperation = false
        component.context.instance.renderOutputs(outputs)

        component.context.instance._.useTimer = false
        component.context.instance.renderStatus('Watching', directoryName)
      }
    } catch (e) {
      isProcessing = false
      queuedOperation = false
      component.context.instance.renderError(e)
      component.context.instance._.useTimer = false
      component.context.instance.renderStatus('Watching', directoryName)
    }
  })
}

const runComponentLocally = async (serverlessFile) => {
  const method = args._[0] || undefined
  const inputs = args
  delete inputs._

  // cli input.name, or name prop of the yaml, or class name of js
  const name = inputs.name || serverlessFile.name
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
    entity: name
  }

  const context = new Context(config)

  try {
    const component = new Component(name, context)
    await component.init()

    if (inputs.watch) {
      delete inputs.watch // remove it so that it doesn't pass as an input
      return watch(component, inputs, method, context)
    }

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

module.exports = runComponentLocally
