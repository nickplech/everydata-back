const { forwardTo } = require('prisma-binding')
const { hasPermission } = require('../utils')

const Query = {
  clientsConnection: forwardTo('db'),
  posts: forwardTo('db'),
  postsConnection: forwardTo('db'),
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
    hasPermission(ctx.request.user, ['ADMIN', 'PERMISSIONUPDATE'])
    return ctx.db.query.users({}, info)
  },

  async client(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('You must be signed in')
    }
    const client = await ctx.db.query.client(
      {
        where: { id: args.id },
      },
      info,
    )

    const hasPermission = ctx.request.user.permissions.some(permission =>
      ['ADMIN', 'USER'].includes(permission),
    )

    if (!hasPermission) {
      return null
    }
    return client
  },

  async clients(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('you must be signed in!')
    }
    const clients = await ctx.db.query.clients({}, info)

    return clients
  },
}

module.exports = Query
