const axios = require('axios')
const querystring = require('querystring')

const serverlessAccessKey = 'AKNoY5HXyLZeNqhkOUXzcufzdBLobZZ1daRBhCFofrvcX'
const tenantName = 'eahefnawy'
const componentName = 'eslam-test-5'
const version = '0.0.2'

const getComponentUploadUrl = async () => {
  const queryString = querystring.stringify({
    tenantName,
    componentName,
    version
  })

  // console.log(queryString)

  try {
    const res = await axios({
      method: 'get',
      url: `https://zs5vv2gdw6.execute-api.us-east-1.amazonaws.com/dev/preparePublish?${queryString}`,
      headers: {
        Authorization: `bearer ${serverlessAccessKey}`
        // 'Content-type': 'application/json'
      }
    })
    console.log(res.data)
  } catch (e) {
    console.log(e.response.data)
  }
}

module.exports = async () => {
  await getComponentUploadUrl()
}
