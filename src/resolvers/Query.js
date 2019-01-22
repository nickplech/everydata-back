const { forwardTo } = require('prisma-binding')
const { hasPermission } = require('../utils')
const Query = {
  clients: forwardTo('db'),
  client: forwardTo('db'),
  clientsConnection: forwardTo('db'),
  day: forwardTo('db'),
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
  // async order(parent, args, ctx, info) {
  //   if (!ctx.request.userId) {
  //     throw new Error('You arent logged in')
  //   }
  //   const order = await ctx.db.query.order(
  //     {
  //       where: { id: args.id },
  //     },
  //     info,
  //   )

  //   const ownsOrder = order.user.id === ctx.request.userId
  //   const hasPermissionToSeeOrder = ctx.request.user.permissions.includes(
  //     'ADMIN',
  //   )
  //   if (!ownsOrder || !hasPermission) {
  //     throw new Error('You cant see this dude')
  //   }
  //   return order
  // },
}

module.exports = Query
