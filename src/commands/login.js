const { login } = require('@serverless/platform-sdk')

module.exports = async (cli) => {
  process.env.DISPLAY = true

  cli.status('browser login', 'serverless')

  const res = await login()

  const { username } = res.users[res.userId]

  // console.log(JSON.stringify(res, null, 4))

  cli.status('logged in', username)
  cli.close('done', `logged in`)
}
