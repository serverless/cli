const path = require('path')
const axios = require('axios')
const { contains, isNil, last, split } = require('ramda')
const globby = require('globby')
const AdmZip = require('adm-zip')
const download = require('download')
const fs = require('fs')
const fse = require('fs-extra')
const {
  saveComponentState,
  sendToConnection,
  runComponent,
  getPackageUrls
} = require('@serverless/client')()

const getComponentCodeFile = async (file, downloadDirectory) => {
  const instance = axios.create()
  instance.defaults.headers.common = {}
  instance.defaults.headers.get = {}
  // todo handle errors
  try {
    const res = await instance.get(file.downloadUrl)

    fs.writeFileSync(path.join(downloadDirectory, file.relativePath), res.data)
  } catch (e) {
    throw e
  }
}

const getComponentCodeFiles = async (files, downloadDirectory) => {
  const promises = []
  for (const file of files) {
    promises.push(getComponentCodeFile(file, downloadDirectory))
  }

  return Promise.all(promises)
}

const pack = async (inputDirPath, outputFilePath, socket, include = [], exclude = []) => {
  const format = last(split('.', outputFilePath))

  if (!contains(format, ['zip', 'tar'])) {
    throw new Error('Please provide a valid format. Either a "zip" or a "tar"')
  }

  const patterns = ['**']

  if (!isNil(exclude)) {
    exclude.forEach((excludedItem) => patterns.push(`!${excludedItem}`))
  }

  const zip = new AdmZip()

  const files = (await globby(patterns, { cwd: inputDirPath })).sort()

  files.map((file) => {
    if (file === path.basename(file)) {
      zip.addLocalFile(path.join(inputDirPath, file))
    } else {
      zip.addLocalFile(path.join(inputDirPath, file), path.dirname(file))
    }
  })

  if (!isNil(include)) {
    include.forEach((file) => zip.addLocalFile(path.join(inputDirPath, file)))
  }

  zip.writeZip(outputFilePath)

  return outputFilePath
}

const putPackage = async (packagePath, packageUploadUrl) => {
  const instance = axios.create()
  instance.defaults.headers.common = {}
  instance.defaults.headers.put = {}
  const body = fs.readFileSync(packagePath)
  // todo handle errors
  try {
    await instance.put(packageUploadUrl, body)
  } catch (e) {
    throw e
  }
}

const uploadComponentSrc = async (src, socket) => {
  const packagePath = path.join(
    '/tmp',
    `${Math.random()
      .toString(36)
      .substring(6)}.zip`
  )

  await sendToConnection({ socket, event: 'debug', data: 'Packaging from lambda' })

  const res = await Promise.all([getPackageUrls(), pack(src, packagePath, socket)])

  const packageUrls = res[0]

  await putPackage(packagePath, packageUrls.upload)

  await sendToConnection({ socket, event: 'debug', data: 'Package uploaded from lambda' })

  return packageUrls.download
}

class Component {
  constructor(config) {
    this.name = config.name
    this.org = config.org
    this.app = config.app
    this.accessKey = config.accessKey
    this.credentials = config.credentials
    this.socket = config.socket || {}
    this.debugMode = config.debugMode
    this.stage = config.stage || 'dev'
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

  load(component, alias) {
    const runComponentInputs = {
      org: this.org,
      app: this.app,
      stage: this.stage,
      credentials: this.credentials,
      debugMode: this.debugMode,
      accessKey: this.accessKey,
      socket: this.socket
    }
    if (component.split('@').length === 2) {
      runComponentInputs.componentName = component.split('@')[0]
      runComponentInputs.componentVersion = component.split('@')[1]
    } else if (component.split('@').length === 1) {
      runComponentInputs.componentName = component
      runComponentInputs.componentVersion = 'dev'
    } else {
      const error = new Error(
        `Unable to load component ${component}. Component name/version pair is invalid.`
      )
      error.name = 'invalidComponentReference'
      throw error
    }

    if (!alias) {
      const error = new Error(`Unable to load component ${component}. Missing alias argument.`)
      error.name = 'missingComponentAlias'
      throw error
    }

    runComponentInputs.name = `${this.name}.${alias}`

    const socket = this.socket

    const proxy = new Proxy(
      {},
      {
        get: (obj, method) => {
          const runChildComponent = async (inputs = {}) => {
            if (inputs.src) {
              inputs.src = await uploadComponentSrc(inputs.src, socket)
            }
            runComponentInputs.method = method
            runComponentInputs.inputs = inputs
            return runComponent(runComponentInputs)
            // return uploadComponentSrc(inputs.src, socket)
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
  if (event.inputs.src) {
    const downloadDirectory = path.join(
      '/tmp',
      Math.random()
        .toString(36)
        .substring(6)
    )
    await download(event.inputs.src, downloadDirectory, { extract: true })

    event.inputs.src = downloadDirectory
  }

  const outputs = await userComponent[event.method](event.inputs)

  // clear tmp code dir
  if (event.inputs.src) {
    fse.removeSync(event.inputs.src)
  }

  return outputs
}

module.exports = Component
