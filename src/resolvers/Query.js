const { forwardTo } = require('prisma-binding')
const { hasPermission } = require('../utils')
const Query = {
  clientsConnection: forwardTo('db'),

  textTemplates: forwardTo('db'),
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
  async clients(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('you must be signed in!')
    }
    return ctx.db.query.clients(
      { where: { user: { id_contains: userId } } },
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
  async reason(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('you must be signed in!')
    }
    const reason = await ctx.db.query.reason(
      {
        where: {
          user: { id: userId },
        },
      },
      info,
    )
    return reason
  },
  async reasons(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('you must be signed in!')
    }
    const reasons = await ctx.db.query.reasons(
      {
        where: {
          user: { id: userId },
        },
      },
      info,
    )
    return reasons
  },
  async textReminders(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('Please Login to query')
    }
    const textReminders = await ctx.db.query.textReminders(
      {
        where: {
          user: { id: userId },
          client: { id: args.client },
        },
      },
      info,
    )
    return textReminders
  },
}

module.exports = Query
