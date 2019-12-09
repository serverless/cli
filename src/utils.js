const args = require('minimist')(process.argv.slice(2))
const path = require('path')
const fse = require('fs-extra')
const fs = require('fs')
const { tmpdir } = require('os')
const YAML = require('js-yaml')
const traverse = require('traverse')
const globby = require('globby')
const AdmZip = require('adm-zip')
const axios = require('axios')
const WebSocket = require('ws')
const dotenv = require('dotenv')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const {
  readConfigFile,
  writeConfigFile,
  createAccessKeyForTenant
} = require('@serverless/platform-sdk')
const { merge, endsWith, contains, isNil, last, split } = require('ramda')
const cli = require('./cli')

const getEndpoints = () => {
  let stage = 'prod'
  if (process.env.SERVERLESS_PLATFORM_STAGE && process.env.SERVERLESS_PLATFORM_STAGE !== 'prod') {
    stage = 'dev'
  }

  const stages = {
    dev: {
      http: `https://y6w6rsjkib.execute-api.us-east-1.amazonaws.com/dev`,
      socket: `wss://kiexxv95i8.execute-api.us-east-1.amazonaws.com/dev`
    },
    prod: {
      http: `https://foerm0pfil.execute-api.us-east-1.amazonaws.com/prod`,
      socket: `wss://qtrusbzkq4.execute-api.us-east-1.amazonaws.com/prod`
    }
  }

  const endpoints = stages[stage]

  return endpoints
}

const engine = new Proxy(
  {},
  {
    get: (obj, functionName) => {
      const endpoints = getEndpoints()

      const callFunction = async (inputs = {}) => {
        const options = {
          url: `${endpoints.http}/engine/${functionName}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          data: inputs
        }

        if (inputs.accessKey) {
          options.headers['Authorization'] = `Bearer ${inputs.accessKey}`
        }
        if (inputs.org) {
          options.headers['serverless-org-name'] = inputs.org
        }

        try {
          const res = await axios(options)
          return res.data
        } catch (requestError) {
          if (requestError.response) {
            const { message, stack, code } = requestError.response.data

            const backendError = new Error(message)

            if (stack) {
              backendError.stack = stack
            }

            if (code) {
              backendError.code = code
            }

            throw backendError
          }
          throw requestError
        }
      }

      return callFunction
    }
  }
)

const connect = async () => {
  if (!cli.debugMode) {
    return
  }

  cli.debug('Establishing streaming connection')

  const endpoints = getEndpoints()

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoints.socket)
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          action: '$default'
        })
      )
    })

    ws.on('message', (message) => {
      const msg = JSON.parse(message)
      if (msg.event === 'echo') {
        resolve(msg.data)
      } else if (msg.event === 'debug') {
        cli.debug(msg.data)
      } else if (msg.event === 'log') {
        cli.log(msg.data)
      } else if (msg.event === 'status') {
        cli.status(msg.data)
      }
    })

    ws.on('error', (e) => reject(e))
  })
}

const fileExistsSync = (filePath) => {
  try {
    const stats = fse.lstatSync(filePath)
    return stats.isFile()
  } catch (e) {
    return false
  }
}

const getCredentials = () => {
  // Load env vars
  let envVars = {}
  const defaultEnvFilePath = path.join(process.cwd(), `.env`)
  const stageEnvFilePath = path.join(process.cwd(), `.env.dev`) // todo remove this
  if (fileExistsSync(stageEnvFilePath)) {
    envVars = dotenv.config({ path: path.resolve(stageEnvFilePath) }).parsed || {}
  } else if (fileExistsSync(defaultEnvFilePath)) {
    envVars = dotenv.config({ path: path.resolve(defaultEnvFilePath) }).parsed || {}
  }

  // Known Provider Environment Variables and their SDK configuration properties
  const providers = {}

  // AWS
  providers.aws = {}
  providers.aws.AWS_ACCESS_KEY_ID = 'accessKeyId'
  providers.aws.AWS_SECRET_ACCESS_KEY = 'secretAccessKey'
  providers.aws.AWS_REGION = 'region'

  // Google
  providers.google = {}
  providers.google.GOOGLE_APPLICATION_CREDENTIALS = 'applicationCredentials'
  providers.google.GOOGLE_PROJECT_ID = 'projectId'
  providers.google.GOOGLE_CLIENT_EMAIL = 'clientEmail'
  providers.google.GOOGLE_PRIVATE_KEY = 'privateKey'

  // Tencent
  providers.tencent = {}
  providers.tencent.TENCENT_APP_ID = 'AppId'
  providers.tencent.TENCENT_SECRET_ID = 'SecretId'
  providers.tencent.TENCENT_SECRET_KEY = 'SecretKey'

  // Docker
  providers.docker = {}
  providers.docker.DOCKER_USERNAME = 'username'
  providers.docker.DOCKER_PASSWORD = 'password'

  const credentials = {}

  for (const provider in providers) {
    const providerEnvVars = providers[provider]
    for (const providerEnvVar in providerEnvVars) {
      if (!envVars.hasOwnProperty(providerEnvVar)) {
        continue
      }
      if (!credentials[provider]) {
        credentials[provider] = {}
      }
      credentials[provider][providerEnvVars[providerEnvVar]] = envVars[providerEnvVar]
    }
  }

  return credentials
}

const isYamlPath = (filePath) => endsWith('.yml', filePath) || endsWith('.yaml', filePath)

const isJsonPath = (filePath) => endsWith('.json', filePath)

const parseFile = (filePath, contents, options = {}) => {
  if (isJsonPath(filePath)) {
    return JSON.parse(contents)
  } else if (isYamlPath(filePath)) {
    return YAML.load(contents.toString(), merge(options, { filename: filePath }))
  } else if (filePath.endsWith('.slsignore')) {
    return contents.toString().split('\n')
  }
  return contents.toString().trim()
}

const readFileSync = (filePath, options = {}) => {
  const contents = fse.readFileSync(filePath, 'utf8')
  return parseFile(filePath, contents, options)
}

const getConfig = (fileName) => {
  const ymlFilePath = path.join(process.cwd(), `${fileName}.yml`)
  const yamlFilePath = path.join(process.cwd(), `${fileName}.yaml`)
  const jsonFilePath = path.join(process.cwd(), `${fileName}.json`)

  try {
    if (fileExistsSync(ymlFilePath)) {
      return readFileSync(ymlFilePath)
    }
    if (fileExistsSync(yamlFilePath)) {
      return readFileSync(yamlFilePath)
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

  if (fileExistsSync(jsonFilePath)) {
    return readFileSync(jsonFilePath)
  }

  return false
}

const resolveConfig = (config) => {
  const regex = /\${(\w*:?[\w\d.-]+)}/g
  let variableResolved = false
  const resolvedConfig = traverse(config).forEach(function(value) {
    const matches = typeof value === 'string' ? value.match(regex) : null
    if (matches) {
      let newValue = value
      for (const match of matches) {
        const referencedPropertyPath = match.substring(2, match.length - 1).split('.')
        const referencedTopLevelProperty = referencedPropertyPath[0]
        if (/\${env\.(\w*:?[\w\d.-]+)}/g.test(match)) {
          newValue = process.env[referencedPropertyPath[1]]
          variableResolved = true
        } else {
          if (!config[referencedTopLevelProperty]) {
            throw Error(`invalid reference ${match}`)
          }

          if (!config[referencedTopLevelProperty].component) {
            variableResolved = true
            const referencedPropertyValue = path(referencedPropertyPath, config)

            if (referencedPropertyValue === undefined) {
              throw Error(`invalid reference ${match}`)
            }

            if (match === value) {
              newValue = referencedPropertyValue
            } else if (typeof referencedPropertyValue === 'string') {
              newValue = newValue.replace(match, referencedPropertyValue)
            } else {
              throw Error(`the referenced substring is not a string`)
            }
          }
        }
      }
      this.update(newValue)
    }
  })
  if (variableResolved) {
    return resolveConfig(resolvedConfig)
  }
  return resolvedConfig
}

const isComponentsProject = () => {
  const serverlessComponentFile = getConfig('serverless.component')
  const serverlessFile = getConfig('serverless')

  if (serverlessComponentFile || (serverlessFile && !serverlessFile.provider)) {
    return true
  }

  return false
}

const sleep = async (wait) => new Promise((resolve) => setTimeout(() => resolve(), wait))

const pack = async (inputDirPath, outputFilePath, include = [], exclude = []) => {
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

// uploads a src input code package to the given upload URL
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

// fetches signed upload/download url, uploads src code and returns download url
const uploadComponentSrc = async (src, accessKey, org) => {
  const { getPackageUrls } = engine

  const packagePath = path.join(
    tmpdir(),
    `${Math.random()
      .toString(36)
      .substring(6)}.zip`
  )

  cli.debug(`Packaging from ${src} into ${packagePath}`)
  cli.status('Packaging')

  const res = await Promise.all([getPackageUrls({ accessKey, org }), pack(src, packagePath)])

  const packageUrls = res[0]

  cli.status('Uploading')
  cli.debug(`Uploading ${packagePath} to ${packageUrls.upload.split('?')[0]}`)
  await putPackage(packagePath, packageUrls.upload)
  cli.debug(`Upload completed`)

  return packageUrls.download
}

// Resolves any "src" inputs for that componnet and uploads its code
const resolveComponentSrcInput = async (inputs, accessKey, org) => {
  let uploadDirectoryPath

  if (typeof inputs.src === 'object' && inputs.src.hook && inputs.src.dist) {
    // First run the build hook, if "hook" and "dist" are specified
    cli.status('Building')
    const options = { cwd: inputs.src.src }
    try {
      await exec(inputs.src.hook, options)
    } catch (err) {
      throw new Error(
        `Failed building website via "${inputs.src.hook}" due to the following error: "${err.stderr}"
        ${err.stdout}`
      )
    }
    uploadDirectoryPath = path.resolve(path.join(inputs.src.src, inputs.src.dist))
  } else if (typeof inputs.src === 'object' && inputs.src.src) {
    uploadDirectoryPath = path.resolve(inputs.src.src)
  } else if (typeof inputs.src === 'string') {
    uploadDirectoryPath = path.resolve(inputs.src)
  } else {
    throw new Error(`Invalid "inputs.src".  Value must be a string or object.`)
  }

  inputs.src = await uploadComponentSrc(uploadDirectoryPath, accessKey, org)

  return inputs
}

// Gets or creates an access key based on org
const getOrCreateAccessKey = async (org) => {
  cli.status('Preparing')

  const userConfigFile = readConfigFile()

  // Verify config file
  if (!userConfigFile || !userConfigFile.users || !userConfigFile.users[userConfigFile.userId]) {
    cli.error(`Run 'serverless login' first to rapidly deploy your serverless application.`, true)
  }

  const user = userConfigFile.users[userConfigFile.userId]

  if (!user.dashboard.accessKeys[org]) {
    // create access key and save it
    const accessKey = await createAccessKeyForTenant(org)
    userConfigFile.users[userConfigFile.userId].dashboard.accessKeys[org] = accessKey
    writeConfigFile(userConfigFile)
    return accessKey
  }

  return user.dashboard.accessKeys[org]
}

const getComponentInstanceData = async (config) => {
  const serverlessFile = getConfig('serverless')

  if (!serverlessFile) {
    throw new Error(`serverless.yml file not found in the current working directory`)
  }

  const resolvedServerlessFile = resolveConfig(serverlessFile)

  const { org, app, stage, name, component, inputs } = resolvedServerlessFile

  if (typeof app === 'undefined') {
    throw new Error(`Missing "app" property in serverless.yml`)
  }

  if (typeof component === 'undefined') {
    throw new Error(`Missing "component" property in serverless.yml`)
  }

  if (typeof name === 'undefined') {
    throw new Error(`Missing "name" property in serverless.yml`)
  }

  const data = {
    org,
    app,
    stage: stage || 'dev', // Default to "dev" stage
    name,
    method: config.command,
    debugMode: config.debug,
    credentials: getCredentials(),
    inputs: config.command === 'deploy' ? inputs : {} // Inputs are only for the "deploy" command
  }

  // Support for specifying "org" and "app" like: app: "myOrg/myApp"
  if (data.app.includes('/')) {
    data.org = data.app.split('/')[0]
    data.app = data.app.split('/')[1]
  }

  // Get Serverless Framework access key
  data.accessKey = await getOrCreateAccessKey(data.org)

  if (component.split('@').length === 2) {
    data.componentName = component.split('@')[0]
    data.componentVersion = component.split('@')[1]
  } else {
    data.componentName = component
    data.componentVersion = 'dev'
  }

  if (args.dev) {
    data.componentVersion = 'dev'
  }

  if (data.inputs && data.inputs.src) {
    data.inputs = await resolveComponentSrcInput(inputs, data.accessKey, data.org)
  }

  return data
}

const validateComponentDefinition = async (serverlessComponentFile) => {
  if (!serverlessComponentFile.name) {
    throw new Error('"name" is required in serverless.component.yml.')
  }
  if (!serverlessComponentFile.org) {
    throw new Error('"org" is required in serverless.component.yml.')
  }
  if (!serverlessComponentFile.author) {
    throw new Error('"author" is required in serverless.component.yml.')
  }
}

const putComponentPackage = async (componentPackagePath, componentUploadUrl) => {
  // axios auto adds headers that causes signature mismatch
  // so we gotta hack it to remove that
  const instance = axios.create()
  instance.defaults.headers.common = {}
  instance.defaults.headers.put = {}
  const file = fs.readFileSync(componentPackagePath)

  try {
    await instance.put(componentUploadUrl.url, file)
  } catch (e) {
    throw e
  }
}

const getComponentUploadUrl = async (serverlessComponentFile) => {
  const endpoints = getEndpoints()
  const url = `${endpoints.http}/component/${serverlessComponentFile.name}`
  const data = JSON.stringify(serverlessComponentFile)
  const serverlessAccessKey = await getOrCreateAccessKey(serverlessComponentFile.org)

  const headers = {
    Authorization: `Bearer ${serverlessAccessKey}`,
    'serverless-org-name': serverlessComponentFile.org,
    'content-type': 'application/json'
  }
  try {
    const res = await axios({
      method: 'put',
      url,
      data,
      headers
    })
    return res.data
  } catch (e) {
    if (e.response && e.response.status !== 200) {
      throw new Error(
        `${e.response.status} ${e.response.statusText || ''} ${e.response.data.message || ''}`
      )
    }
    throw e
  }
}

module.exports = {
  engine,
  connect,
  getCredentials,
  getConfig,
  resolveConfig,
  isComponentsProject,
  fileExistsSync,
  sleep,
  pack,
  getComponentInstanceData,
  validateComponentDefinition,
  putComponentPackage,
  getComponentUploadUrl
}
