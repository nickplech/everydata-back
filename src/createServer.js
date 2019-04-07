const { GraphQLServer, PubSub } = require('graphql-yoga')
const Mutation = require('./resolvers/Mutation')
const Query = require('./resolvers/Query')
const Subscription = require('./resolvers/Subscription')
const db = require('./db')

function createServer() {
  const pubsub = new PubSub()
  return new GraphQLServer({
    typeDefs: 'src/schema.graphql',
    resolvers: {
      Mutation,
      Query,
      Subscription,
    },
    resolverValidationOptions: {
      requireResolversForResolveType: false,
    },
    context: req => ({ ...req, db, pubsub }),
  })
}

module.exports = createServer
