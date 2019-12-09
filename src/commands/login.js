const cli = require('../cli')
const { login } = require('@serverless/platform-sdk')

module.exports = async (config) => {
  process.env.DISPLAY = true

  // Disable timer
  config.timer = false

  cli.status('Logging in via browser')

  const res = await login()
  const { username } = res.users[res.userId]

  cli.status('Logged in')
  cli.close('done', `Successfully logged into org "${username}"`)
}
