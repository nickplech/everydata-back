const { forwardTo } = require('prisma-binding')
const { hasPermission } = require('../utils')
const Query = {
  clients: forwardTo('db'),
  client: forwardTo('db'),
  clientsConnection: forwardTo('db'),
  me(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      return null
    }
    return ctx.db.query.user(
      {
        where: { id: ctx.request.userId },
      },
      info,
    )
  },
  async users(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do this!')
    }
    console.log(ctx.request.userId)
    hasPermission(ctx.request.user, ['ADMIN', 'USER', 'PERMISSIONUPDATE'])
    return ctx.db.query.users({}, info)
  },
}

module.exports = Query
