const path = require('path')
const { saveComponentState, logComponentMessage, runComponent } = require('@serverless/client')()

class Component {
  constructor(config) {
    if (!config.name) {
      const error = new Error('component name is missing')
      error.name = 'missingComponentName'
      throw error
    }

    if (!config.org) {
      const error = new Error('org is missing')
      error.name = 'missingOrg'
      throw error
    }

    if (!config.app) {
      const error = new Error('app is missing')
      error.name = 'missingApp'
      throw error
    }

    if (!config.accessKey) {
      const error = new Error('accessKey is missing')
      error.name = 'missingAccessKey'
      throw error
    }

    this.name = config.name
    this.app = config.app
    this.accessKey = config.accessKey
    this.socket = config.socket
    this.debugMode = config.debugMode
    this.stage = config.stage || 'dev'
    this.state = config.state || {}
  }

  async debug(message) {
    if (this.socket && this.socket.connectionId && this.debugMode) {
      const inputs = {
        name: this.name,
        app: this.app,
        accessKey: this.accessKey,
        stage: this.stage,
        message,
        socket: this.socket
      }
      await logComponentMessage(inputs)
    }
  }

  async save() {
    const inputs = {
      name: this.name,
      app: this.app,
      accessKey: this.accessKey,
      stage: this.stage,
      state: this.state
    }
    await saveComponentState(inputs)
  }

  async load(component, alias) {
    const runComponentInputs = {
      accessKey: this.accessKey,
      app: this.app,
      component,
      stage: this.stage,
      name: `${this.name}.${alias}`,
      connectionId: this.connectionId
    }
    const proxy = new Proxy(
      {},
      {
        get: (obj, method) => {
          const runChildComponent = async (inputs = {}) => {
            runComponentInputs.method = method
            runComponentInputs.inputs = inputs
            return runComponent(runComponentInputs)
          }

          return runChildComponent
        }
      }
    )

    return proxy
  }
}

Component.handler = async (event = {}) => {
  const serverlessFilePath = path.join(process.env.LAMBDA_TASK_ROOT, 'serverless')
  const UserComponent = require(serverlessFilePath)
  const userComponent = new UserComponent(event)
  return userComponent[event.method](event.inputs)
}

module.exports = Component
