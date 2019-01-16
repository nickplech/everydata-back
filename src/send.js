require('dotenv').config({ path: 'variables.env' })

const Nexmo = require('nexmo')

const nexmo = new Nexmo({
  apiKey: process.env.NEXMO_KEY,
  apiSecret: process.env.NEXMO_SECRET,
})

const from = '19252646214'
const to = '17145853857'
const text = 'Hello from Nexmo'

nexmo.message.sendSms(from, to, text)
