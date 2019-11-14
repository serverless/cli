const cliVersion = require('../package.json').version
const coreVersion = require('@serverless/core/package.json').version
const { getServerlessFile, isComponentsFile, shouldRunInCloud } = require('./utils')
const runComponentLocally = require('./local')
const runComponentInCloud = require('./cloud')

const runningComponents = () => {
  const serverlessFile = getServerlessFile(process.cwd())

  if (serverlessFile && isComponentsFile(serverlessFile)) {
    return true
  }

  return false
}

const runComponents = async (serverlessFileArg) => {
  const serverlessFile = serverlessFileArg || getServerlessFile(process.cwd())

  if (!serverlessFile || !isComponentsFile(serverlessFile)) {
    return
  }

  if (shouldRunInCloud(serverlessFile)) {
    return runComponentInCloud(serverlessFile)
  }

  return runComponentLocally(serverlessFile)
}

module.exports = { runningComponents, runComponents, cliVersion, coreVersion }
