// how do we get user code to the cloud asap
// how do we handle stages
// how do orgs, apps and servies fit into components
// how would publishing work
// should we keep npm and local components?
// local development?
// specific features
// private components
// breaking changes
// analytics

// sls deploy

// high level components shouldn't use low level ones
// app could replace name

const args = require('minimist')(process.argv.slice(2))
const path = require('path')
const WebSocket = require('ws')
const fetch = require('node-fetch')
const globby = require('globby')
const { utils } = require('@serverless/core')
const Context = require('./Context')
const AWS = require('aws-sdk')
const lambda = new AWS.Lambda({ region: 'us-east-1' })
const s3 = new AWS.S3({ region: 'us-east-1' })

const codeBucket = 'serverless-components-code-test'

const getSocketUrl = () => {
  return `wss://eoh2kfu9e5.execute-api.us-east-1.amazonaws.com/dev`
  // todo update
  const { SERVERLESS_COMPONENTS_STAGE } = process.env

  if (SERVERLESS_COMPONENTS_STAGE === 'dev') {
    return `wss://obvnpcnmz2.execute-api.us-east-1.amazonaws.com/prod`
  }

  if (SERVERLESS_COMPONENTS_STAGE === 'prod') {
    return ``
  }

  return `wss://eoh2kfu9e5.execute-api.us-east-1.amazonaws.com/dev`
}

const invoke = async (functionName, inputs) => {
  const payload = {
    functionName,
    inputs
  }
  const invokeParams = {
    FunctionName: 'arn:aws:lambda:us-east-1:552750238299:function:sandbox',
    InvocationType: 'RequestResponse',
    LogType: 'None',
    Payload: new Buffer.from(JSON.stringify(payload))
  }

  const res = await lambda.invoke(invokeParams).promise()

  const resPayload = JSON.parse(res.Payload)

  if (resPayload && resPayload.errorMessage) {
    const error = new Error(resPayload.errorMessage)
    error.code = resPayload.errorType
    throw error
  } else {
    const outputs = resPayload
    return outputs
  }
}

const putComponentCodeFile = async (file, context) => {
  context.debug(`Uploading ${file.relativePath}`)
  const body = await utils.readFile(file.absolutePath)
  // todo handle errors
  await fetch(file.url, {
    method: 'put',
    body,
    headers: {
      'Content-Type': 'application/octet-stream'
    }
  })
}

const putComponentCodeFiles = async (files, context) => {
  const promises = []
  for (const file of files) {
    promises.push(putComponentCodeFile(file, context))
  }

  return Promise.all(promises)
}

const uploadComponentCodeFiles = async (codeDir, context) => {
  const localCodeDirPath = path.resolve(codeDir)

  const patterns = ['**', '!node_modules']
  context.debug(`Listing files to upload from ${codeDir}`)
  const files = (await globby(patterns, { cwd: localCodeDirPath })).sort().map((relativePath) => {
    return {
      relativePath,
      absolutePath: path.join(localCodeDirPath, relativePath)
    }
  })

  context.debug(`Getting signed urls for upload`)
  const res = await invoke('getSignedUrls', { files, codeDir })

  await putComponentCodeFiles(res.files, context)

  return res.directory
}

// todo refactor this
const uploadComponentsCodeFiles = async (componentsWithCodeInput, context) => {
  const processedDirs = []
  const promises = []
  for (const componentWithCodeInput of componentsWithCodeInput) {
    if (!processedDirs.includes(componentWithCodeInput.code)) {
      promises.push(uploadComponentCodeFiles(componentWithCodeInput.code, context))
    }
    processedDirs.push(componentWithCodeInput.code)
  }

  return Promise.all(promises)
}

const getComponentsWithCodeInput = (serverlessFile) => {
  const components = []
  for (const alias in serverlessFile) {
    const potentialComponent = serverlessFile[alias]
    if (
      potentialComponent.component &&
      potentialComponent.inputs &&
      potentialComponent.inputs.code &&
      potentialComponent.inputs.code.src
    ) {
      components.push({
        code: potentialComponent.inputs.code.src,
        alias
      })
    }
  }

  return components
}

const transformComponentsCodeInput = (serverlessFile, componentsWithCodeInputs, directories) => {
  for (const componentWithCodeInputs of componentsWithCodeInputs) {
    const componentDirectory = directories.find(
      (directory) => directory.local === componentWithCodeInputs.code
    )
    serverlessFile[componentWithCodeInputs.alias].inputs.code.src = componentDirectory.cloud
  }

  return serverlessFile
}

const writeFile = async (Key) => {
  const params = {
    Bucket: codeBucket,
    Key
  }
  const content = (await s3.getObject(params).promise()).Body
  await utils.writeFile(path.join(process.cwd(), 'tmp', Key), content)
}

const downloadComponentCodeFiles = async (codeDir) => {
  const params = {
    Bucket: codeBucket,
    Prefix: codeDir
  }
  const files = (await s3.listObjectsV2(params).promise()).Contents.map((content) => content.Key)

  const promises = []
  for (const file of files) {
    promises.push(writeFile(file))
  }

  await Promise.all(promises)

  return files
}

const downloadComponentsCodeFiles = async (componentsWithCodeInput) => {
  const processedDirs = []
  const promises = []
  for (const componentWithCodeInput of componentsWithCodeInput) {
    if (!processedDirs.includes(componentWithCodeInput.code)) {
      promises.push(downloadComponentCodeFiles(componentWithCodeInput.code))
    }
    processedDirs.push(componentWithCodeInput.code)
  }

  return Promise.all(promises)
}

// error handling in sandbox, sockets and components
// fix globby and packaging
// think about shims
const runComponentInCloud = async (serverlessFile) => {
  const name = args.name || serverlessFile.name || 'defaultComponentId' // todo change this
  const org = args.org || serverlessFile.org

  const context = new Context({ debug: args.debug }) // todo we may want to create our own context
  await context.setCredentials() // don't want to .init() so that we don't create .serverless files
  context.status('Deploying', name)

  const componentsWithCodeInput = getComponentsWithCodeInput(serverlessFile)
  const directories = await uploadComponentsCodeFiles(componentsWithCodeInput, context)
  const resolvedServerlessFile = transformComponentsCodeInput(
    serverlessFile,
    componentsWithCodeInput,
    directories
  )
  // const componentsWithS3CodeInput = getComponentsWithCodeInput(resolvedServerlessFile)
  // const files = await downloadComponentsCodeFiles(componentsWithS3CodeInput)

  const url = getSocketUrl()
  const ws = new WebSocket(url)

  const componentName = '@serverless/cloud'
  const componentId = name
  const componentMethod = args._[0] || 'default'

  const componentInputs = { template: resolvedServerlessFile }
  const componentContext = {
    id: componentId,
    org,
    credentials: context.credentials,
    accessKey: process.env.SERVERLESS_ACCESS_KEY
  }

  const inputs = {
    componentName,
    componentId,
    componentMethod,
    componentInputs,
    componentContext
  }

  ws.on('open', () => {
    const payload = {
      action: '$default',
      data: {
        functionName: 'runComponent',
        inputs
      }
    }
    ws.send(JSON.stringify(payload))
  })

  ws.on('message', (message) => {
    const messageObj = JSON.parse(message)
    if (messageObj.action === 'debug') {
      // console.log(messageObj.data)
      context.debug(messageObj.data)
    } else if (messageObj.action === 'outputs') {
      context.renderOutputs(messageObj.data)
      context.close('done')
      process.exit(0)
    } else {
      console.log(message) // eslint-disable-line
    }
  })

  ws.on('close', () => {
    context.close('closed')
    process.exit(0)
  })

  ws.on('error', (e) => {
    context.renderError(e)
    context.close('error', e)
    process.exit(1)
  })
}

module.exports = runComponentInCloud
