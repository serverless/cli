/**
 * Publish
 * - Publishes a Component to the Component Registry
 */

const path = require('path')
const fs = require('fs')
const fetch = require('node-fetch')
const utils = require('../utils')
const { promisify } = require('util')
const platformSdk = require('@serverless/platform-sdk')
const exec = promisify(require('child_process').exec)

const registryAPI = 'https://rl9hc5i1w2.execute-api.us-east-1.amazonaws.com/production/'

const publish = async (inputs) => {
  const user = platformSdk.getLoggedInUser()

  if (!user) {
    utils.cli.close(
      'error',
      'Please login to the Serverless Dashboard to publish your component. Just run "sls login".'
    )
  }

  const pathPackageJson = path.join(process.cwd(), 'package.json')
  const pathReadme = path.join(process.cwd(), 'README.md')

  // Check files exist
  if (!fs.existsSync(pathPackageJson)) {
    utils.cli.close(
      `error`,
      `A "package.json" file was not found in the current directory and is required.`
    )
  }

  // Load
  const packageJSON = require(pathPackageJson)

  // Validate
  if (packageJSON.name.includes('@') || packageJSON.name.includes('/')) {
    utils.cli.close(
      `error`,
      `To publish to the Serverless Registry, your Component name cannot include the characters "@" or "/", which come from your npm organization.  Instead, add a custom name by adding a "serverless" object with a "name" property to "package.json", like - 'serverless': { 'name': 'website' }`
    )
  }
  if (
    packageJSON.publishConfig &&
    packageJSON.publishConfig.access &&
    packageJSON.publishConfig.access !== 'public'
  ) {
    utils.cli.close(
      `error`,
      `"publishConfig.access" must be set to "public" in "package.json" in order to publish to the Serverless Components Registry.`
    )
  }

  await exec(`npm publish`)

  // Optionally load README.md
  let readme
  if (fs.existsSync(pathReadme)) {
    readme = fs.readFileSync(pathReadme, 'utf-8')
  }

  // todo we may want to send over user data as well
  // Create Data Object
  const data = {}
  data.name = packageJSON.name
  data.version = packageJSON.version
  data.author = packageJSON.author
  data.description = packageJSON.description
  data.keywords = packageJSON.keywords
  data.homepage = packageJSON.homepage
  data.license = packageJSON.license

  data.readme = readme

  let response = await fetch(`${registryAPI}/api/v1/component`, {
    method: 'post',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' }
  })

  if (response.status && response.status !== 200) {
    response = await response.json()
    utils.cli.close(`error`, `Publish failed: ${response.message}`)
  }

  response = await response.json()
  utils.cli.close(`done`, `${response.message}`)
}

/**
 * Unpublish
 */

const unpublish = async (inputs) => {
  const pathPackageJson = path.join(process.cwd(), 'package.json')
  const pathReadme = path.join(process.cwd(), 'README.md')

  // Check files exist
  if (!fs.existsSync(pathPackageJson)) {
    throw new Error(`A "package.json" file was not found in the current directory and is required.`)
  }

  // Load
  const packageJSON = require(pathPackageJson)

  let response = await fetch(
    `${registryAPI}/api/v1/component?componentName=${packageJSON.name}&componentVersion=${packageJSON.version}`,
    {
      method: 'delete',
      headers: { 'Content-Type': 'application/json' }
    }
  )

  if (response.status && response.status !== 200) {
    response = await response.json()
    utils.cli.close(`error`, `Unpublish failed: ${response.message}`)
  }

  response = await response.json()
  utils.cli.close(`done`, `${response.message}`)
}

module.exports = {
  publish,
  unpublish
}
