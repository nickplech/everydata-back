const { forwardTo } = require('prisma-binding')
const { hasPermission } = require('../utils')
const Query = {
  reason: forwardTo('db'),
  reasons: forwardTo('db'),
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
    const ownsClient = client.user.id === userId
    const hasPermission = ctx.request.user.permissions.some(permission =>
      ['ADMIN', 'USER'].includes(permission),
    )

    if (!ownsClient && hasPermission) {
      return null
    }
    return client
  },
  clients(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('you must be signed in!')
    }
    const clients = ctx.db.query.clients(
      {
        where: {
          user: { id: userId },
        },
      },
      info,
    )
    // const ownsClient = clients.user.id === userId
    const hasPermission = ctx.request.user.permissions.some(permission =>
      ['ADMIN', 'USER'].includes(permission),
    )

    if (!hasPermission) {
      return null
    }
    return clients
  },
  async users(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do this!')
    }
    console.log(ctx.request.userId)
    hasPermission(ctx.request.user, ['ADMIN', 'PERMISSIONUPDATE'])
    return ctx.db.query.users({}, info)
  },

  async order(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You arent logged in')
    }
    const order = await ctx.db.query.order(
      {
        where: { id: args.id },
      },
      info,
    )

    const ownsOrder = order.user.id === ctx.request.userId
    const hasPermissionToSeeOrder = ctx.request.user.permissions.includes(
      'ADMIN',
    )
    if (!ownsOrder) {
      throw new Error('You cant see this, cmon now...')
    }
    if (ownsOrder || hasPermissionToSeeOrder) {
      return order
    }
  },
  async orders(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('you must be signed in!')
    }
    return ctx.db.query.orders(
      {
        where: {
          user: { id: userId },
        },
      },
      info,
    )
  },
  // async reason(parent, args, ctx, info) {
  //   const { userId } = ctx.request
  //   if (!ctx.request.userId) {
  //     throw new Error('You arent logged in')
  //   }
  //   const reason = await ctx.db.query.reason(
  //     {
  //       where: { id: args.id },
  //     },
  //     info,
  //   )
  //   const ownsReason = reason.user.id === userId
  //   if (!ownsReason) {
  //     null
  //   }
  //   return reason
  // },
  // async reasons(parent, args, ctx, info) {
  //   const reasons = await ctx.db.query.reasons(info)
  //   return reasons
  // },
}

module.exports = Query
