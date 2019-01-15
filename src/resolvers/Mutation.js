const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { randomBytes } = require('crypto')
const { promisify } = require('util')
const { transport, makeANiceEmail } = require('../mail')
const { hasPermission } = require('../utils')

const Mutations = {
  async createClient(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!')
    }
    args.firstName =
      args.firstName.charAt(0).toUpperCase() + args.firstName.slice(1).trim()
    args.lastName =
      args.lastName.charAt(0).toUpperCase() + args.lastName.slice(1).trim()
    const client = await ctx.db.mutation.createClient(
      {
        data: {
          user: {
            connect: {
              id: ctx.request.userId,
            },
          },
          ...args,
        },
      },
      info,
    )

    return client
  },
  updateClient(parent, args, ctx, info) {
    const updates = { ...args }
    delete updates.id
    return ctx.db.mutation.updateClient(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info,
    )
  },
  async deleteClient(parent, args, ctx, info) {
    const where = { id: args.id }

    const client = await ctx.db.query.client(
      { where },
      `{ id firstName user { id } }`,
    )

    const ownsClient = client.user.id === ctx.request.userId
    const hasPermission = ctx.request.user.permissions.some(permission =>
      ['ADMIN', 'CLIENTDELETE', 'USER'].includes(permission),
    )

    if (!ownsClient && !hasPermission) {
      throw new Error("You don't have permission to do that!")
    }

    // 3. Delete it!
    return ctx.db.mutation.deleteClient({ where }, info)
  },
  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase()

    const password = await bcrypt.hash(args.password, 10)
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,

          permissions: { set: ['USER'] },
        },
      },
      info,
    )
    const token = jwt.sign({ user: user.id }, process.env.APP_SECRET)
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 1,
    })
    return user
  },
  async signin(parent, { email, password }, ctx, info) {
    const user = await ctx.db.query.user({ where: { email } })
    if (!user) {
      throw new Error('Please enter a valid Email Address')
    }
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      throw new Error('Invalid Password')
    }
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET)
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 1,
    })
    return user
  },
  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token')
    return {
      message: 'Goodbye!',
    }
  },
  async requestReset(parent, args, ctx, info) {
    const user = await ctx.db.query.user({ where: { email: args.email } })
    if (!user) {
      throw new Error(`No such user found for email ${args.email}`)
    }
    const randomBytesPromiseified = promisify(randomBytes)
    const resetToken = (await randomBytesPromiseified(20)).toString('hex')
    const resetTokenExpiry = Date.now() + 3600000 //1 hour from now
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry },
    })
    const mailRes = await transport.sendMail({
      from: 'info@perfectdayreminders.com',
      to: user.email,
      subject: 'Your Password Reset Token',
      html: makeANiceEmail(
        `Your Password Reset Token is Here \n\n <a href="${
          process.env.FRONTEND_URL
        }/reset?resetToken=${resetToken}">Click Here to Reset</a>`,
      ),
    })
    return { message: 'Thanks!' }
  },
  async resetPassword(parent, args, ctx, info) {
    if (args.password !== args.confirmPassword) {
      throw new Error("Your Passwords don't match!")
    }
    const [user] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000,
      },
    })
    if (!user) {
      throw 'This reset request is either invalid or expired!'
    }
    const password = await bcrypt.hash(args.password, 10)
    const updateUser = await ctx.db.mutation.updateUser({
      where: { email: user.email },
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null,
      },
    })
    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET)
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 100 * 60 * 60 * 24 * 1,
    })
    return updatedUser
  },
  async updatePermissions(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in!')
    }
    const currentUser = await ctx.db.query.user(
      {
        where: {
          id: ctx.request.userId,
        },
      },
      info,
    )
    hasPermission(currentUser, ['ADMIN', 'PERMISSIONUPDATE'])
    return ctx.db.mutation.updateUser(
      {
        data: {
          permissions: {
            set: args.permissions,
          },
        },
        where: {
          id: args.userId,
        },
      },
      info,
    )
  },
  async addToCart(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('You must be signed in')
    }
    const [existingCartItem] = await ctx.db.query.cartItems({
      where: {
        user: { id: userId },
        client: { id: args.id },
      },
    })
    if (existingCartItem) {
      console.log('This Confirmation Has Already Been Logged')
      return ctx.db.mutation.updateCartItem(
        {
          where: { id: existingCartItem.id },
          data: { quantity: existingCartItem.quantity + 1 },
        },
        info,
      )
    }
    return ctx.db.mutation.createCartItem(
      {
        data: {
          user: {
            connect: { id: userId },
          },
          client: {
            connect: { id: args.id },
          },
        },
      },
      info,
    )
  },
  async removeFromCart(parent, args, ctx, info) {
    const cartItem = await ctx.db.query.cartItem(
      {
        where: {
          id: args.id,
        },
      },
      `{ id, user { id }}`,
    )
    if (!cartItem) throw new Error('No Confirmation Found!')
    if (cartItem.user.id !== ctx.request.userId) {
      throw new Error('Cheater!')
    }
    return ctx.db.mutation.deleteCartItem(
      {
        where: { id: args.id },
      },
      info,
    )
  },
  async createOrder(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) throw new Error('Please Sign In')
    const user = await ctx.db.query.user(
      { where: { id: userId } },
      `{
        id
        name
        email
        subscription {
          id
          quantity
          package {
            title
            price
            id
            description
            image
          }
        }}`,
    )
    const amount = user.subscription.reduce(
      (tally, cartPackage) =>
        tally + cartPackage.package.price * cartPackage.quantity,
      0,
    )
  },
}

module.exports = Mutations