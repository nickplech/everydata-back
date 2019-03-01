const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { randomBytes } = require('crypto')
const { promisify } = require('util')
const { transport, makeANiceEmail } = require('../mail')
const { sanitizeDate } = require('../dateFunction')
const { hasPermission } = require('../utils')
const stripe = require('../stripe')

const Mutations = {
  async createClient(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!')
    }
    let name = args.firstName
    let surName = args.lastName
    name = name.charAt(0).toUpperCase() + name.slice(1).trim()
    surName = surName.charAt(0).toUpperCase() + surName.slice(1).trim()
    // let birthDay = args.birthDay
    // birthDay = sanitizeDate(birthDay)

    const dateParts = args.birthDay.split('/')
    const ISODate = dateParts[2] + '-' + dateParts[0] + '-' + dateParts[1]
    const birthDate = new Date(ISODate).toISOString()
    args.birthDay = birthDate
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
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!')
    }
    const dateParts = args.birthDay.split('/')
    const ISODate = dateParts[2] + '-' + dateParts[0] + '-' + dateParts[1]
    const birthDate = new Date(ISODate).toISOString()
    args.birthDay = birthDate
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
      ['ADMIN', 'CLIENTDELETE'].includes(permission),
    )

    if (!ownsClient && !hasPermission) {
      throw new Error("You don't have permission to do that!")
    }

    // 3. Delete it!
    return ctx.db.mutation.deleteClient({ where }, info)
  },

  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase()
    const name = args.firstName
    const surName = args.lastName
    name = name.charAt(0).toUpperCase() + name.slice(1).trim()
    surName = surName.charAt(0).toUpperCase() + surName.slice(1).trim()
    if (args.password.length < 5) {
      throw new Error('Your Password must contain at least 6 characters')
    }
    if (args.password !== args.confirmPassword) {
      throw new Error("Your Passwords don't match!")
    }
    const password = await bcrypt.hash(args.password, 10)
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          firstName: args.firstName,
          lastName: args.lastName,
          cellPhone: args.cellPhone,
          businessName: args.businessName,
          email: args.email,
          password,
          plan: args.plan,
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

    const mailRes = await transport.sendMail({
      from: 'info@perfectdayreminders.com',
      to: user.email,
      subject: 'Perfect Day Reminders Free Trial',
      html: makeANiceEmail(
        `Welcome to Perfect Day Reminders ${
          user.firstName
        }! Enjoy your Free Trial for the next two weeks—we are confident you will love our service, finding it easy to use and enjoyable! At the end of your trial, if you still wish to continue using Perfect Day reminders, you will simply be asked to subscribe and then continue as usual. Thank you!`,
      ),
    })
    return user
  },

  async updateUser(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) throw new Error('Please Sign In to Complete this Order')
    const currentUser = await ctx.db.query.user(
      {
        where: {
          id: userId,
        },
      },
      info,
    )
    const updatedUser = await ctx.db.mutation.updateUser({
      where: { id: currentUser.id },
      data: {
        cellPhone: args.cellPhone,
        businessName: args.businessName,
        email: args.email,
      },
    })

    return updatedUser
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
      subject: 'Password Reset Token-Perfect Day Reminders',
      html: makeANiceEmail(
        `Your Password Reset Token is Here \n\n <a href="${
          process.env.FRONTEND_URL
        }/reset?resetToken=${resetToken}">Click to Reset</a>`,
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
    const updatedUser = await ctx.db.mutation.updateUser({
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
          data: { confirmationStatus: args.confirmationStatus },
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
          confirmationStatus: args.confirmationStatus,
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
  async createReason(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('You must be signed in')
    }

    // args.name = args.name.charAt(0).toUpperCase() + args.name.slice(1).trim()

    const reason = await ctx.db.mutation.createReason(
      {
        data: {
          user: {
            connect: {
              id: userId,
            },
          },
          ...args,
        },
      },
      info,
    )
    return reason
  },
  async createAppointment(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) throw new Error('Please Sign In')
    const appointment = await ctx.db.mutation.createAppointment(
      {
        data: {
          user: {
            connect: {
              id: ctx.request.userId,
            },
          },
          client: {
            connect: { id: args.id },
          },
          ...args,
        },
      },
      info,
    )
    return appointment
  },
  async createOrder(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('You must be signed in')
    }
    const currentUser = await ctx.db.query.user(
      {
        where: {
          id: ctx.request.userId,
        },
      },
      `{ id, email, businessName, plan}`,
    )
    const customer = await stripe.customers.create({
      email: currentUser.email,
      description: currentUser.businessName,
      source: args.token,
    })

    const charge = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        {
          plan: currentUser.plan,
        },
      ],
    })

    const order = await ctx.db.mutation.createOrder({
      data: {
        price: args.price,
        charge: charge.customer,
        plan: currentUser.plan,
        user: { connect: { id: userId } },
      },
    })
    return order
  },
}

module.exports = Mutations
