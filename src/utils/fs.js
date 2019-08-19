/**
 * Utils: FS
 */

const path = require('path')
const { utils } = require('@serverless/core')

/**
 * Get Serverless File
 * - Checks the dir for the different types of serverless files
 */

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

/**
 * Is Component File
 */

const isComponentsFile = (serverlessFile) => {
  if (typeof serverlessFile === 'function' || isComponentsTemplate(serverlessFile)) {
    return true
  }
  return false
}

/**
 * Is Component Template
 * - Checks the serverless.yml and ensures it's a Serverless Component
 */

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

module.exports = {
  getServerlessFile,
  isComponentsFile,
  isComponentsTemplate
}
