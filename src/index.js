const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const jwt = require('jsonwebtoken')
require('dotenv').config({ path: 'variables.env' })
const createServer = require('./createServer')
const db = require('./db')

const server = createServer()

server.express.use(cookieParser())
server.express.use(bodyParser.json())
server.express.use(bodyParser.urlencoded({ extended: true }))

//decode jwt to get user id on each request
server.express.use((req, res, next) => {
  const { token } = req.cookies
  if (token) {
    const { userId } = jwt.verify(token, process.env.APP_SECRET)
    req.userId = userId
  }
  next()
})

server.express.use(async (req, res, next) => {
  if (!req.userId) return next()
  const user = await db.query.user(
    { where: { id: req.userId } },
    '{ id, permissions, email, firstName }',
  )
  req.user = user
  next()
})

// server.express.post('/inbound', (req, res) => {
//   handleParams(req.body, res)
// })

// function handleParams(params, res) {
//   if (!params.to || !params.msisdn) {
//     console.log('This is not a valid inbound SMS message!')
//   } else {
//     console.log('Success')
//     let incomingData = {
//       messageId: params.messageId,
//       from: params.msisdn,
//       text: params.text,
//       type: params.type,
//       timestamp: params['message-timestamp'],
//     }
//     res.send(incomingData)
//   }
//   res.status(200).end()
// }

server.start(
  {
    cors: {
      credentials: true,
      origin: process.env.FRONTEND_URL,
    },
  },
  deets => {
    console.log(`Server is now running on port http:/localhost:${deets.port}`)
  },
)
