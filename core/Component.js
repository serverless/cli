const path = require('path')
const { saveComponentState, sendToConnection, runComponent } = require('@serverless/client')()

class Component {
  constructor(config) {
    this.name = config.name
    this.org = config.org
    this.app = config.app
    this.accessKey = config.accessKey
    this.credentials = config.credentials
    this.socket = config.socket || {}
    this.debugMode = config.debugMode
    this.stage = config.stage
    this.state = config.state || {}
    this.componentName = config.componentName
    this.componentVersion = config.componentVersion
  }

  async debug(message) {
    if (this.socket && this.socket.connectionId && this.debugMode) {
      const inputs = {
        name: this.name,
        org: this.org,
        app: this.app,
        stage: this.stage,
        accessKey: this.accessKey,
        event: 'debug',
        data: message,
        socket: this.socket
      }
      await sendToConnection(inputs)
    }
  }

  async log(message) {
    if (this.socket && this.socket.connectionId && this.debugMode) {
      const inputs = {
        name: this.name,
        org: this.org,
        app: this.app,
        stage: this.stage,
        accessKey: this.accessKey,
        event: 'log',
        data: message,
        socket: this.socket
      }
      await sendToConnection(inputs)
    }
  }

  async status(message) {
    if (this.socket && this.socket.connectionId) {
      const inputs = {
        name: this.name,
        org: this.org,
        app: this.app,
        stage: this.stage,
        accessKey: this.accessKey,
        event: 'status',
        data: message,
        socket: this.socket
      }
      await sendToConnection(inputs)
    }
  }

  async save() {
    const inputs = {
      org: this.org,
      app: this.app,
      stage: this.stage,
      name: this.name,
      componentName: this.componentName,
      componentVersion: this.componentVersion,
      accessKey: this.accessKey,
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

  if (typeof userComponent[event.method] !== 'function') {
    const error = new Error(
      `method "${event.method}" does not exist in component "${userComponent.componentName}@${userComponent.componentVersion}"`
    )
    error.name = 'MethodNotFound'

    throw error
  }
  return userComponent[event.method](event.inputs)
}

module.exports = Component
