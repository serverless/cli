/**
 * Login
 * - Logins to the Serverless Dashboard
 */

const utils = require('../utils')
const platformSdk = require('@serverless/platform-sdk')

const login = async () => {
  try {
    utils.cli.log('')
    utils.cli.log('  Logging you in the Serverless Dashboard via your default browser...')
    await platformSdk.login()
    utils.cli.log('  Successfully logged into the Serverless Dashboard.', 'green')
    utils.cli.log('')
    process.exit(0)
  } catch (err) {
    if (err === 'Complete sign-up before logging in.') {
      utils.cli.log('  Please complete sign-up at dashboard.serverless.com.', 'red')
      utils.cli.log('')
      process.exit(1)
    }
  }
}

/**
 * Logout
 */

const logout = async () => {
  await platformSdk.logout()
  utils.cli.log('')
  utils.cli.log('  Successfully logged out of the Serverless Dashboard.', 'green')
  utils.cli.log('')
  process.exit(0)
}

module.exports = {
  login,
  logout
}
