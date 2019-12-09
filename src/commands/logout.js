const cli = require('../cli')
const { getLoggedInUser, logout } = require('@serverless/platform-sdk')

module.exports = async (config) => {
  // Disable timer
  config.timer = false

  cli.status('Logging out')

  const user = getLoggedInUser()

  if (!user) {
    cli.close('done', `You are already logged out`)
  }

  await logout()

  cli.status('Logged Out')
  cli.close('done', `Successfully logged out of "${user.username}"`)
}
