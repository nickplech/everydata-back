const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { randomBytes } = require('crypto')
const { promisify } = require('util')
const { transport, makeANiceEmail } = require('../mail')
const { hasPermission } = require('../utils')

const Mutations = {
  async createClient(parent, args, ctx, info) {
    let name = args.firstName
    let surName = args.lastName
    name = name.charAt(0).toUpperCase() + name.slice(1).trim()
    surName = surName.charAt(0).toUpperCase() + surName.slice(1).trim()

    let cellPhone = args.cellPhone
    if (cellPhone.includes('_')) {
      throw new Error('Phone number must be a complete US phone number')
    }
    const client = await ctx.db.mutation.createClient(
      {
        data: {
          fullName: name + ' ' + surName,
          email: args.email,
          ...args,
        },
      },
      info,
    )
    const mailRes = await transport.sendMail({
      from: 'info@everydata.com',
      to: client.email,
      subject: 'Everydata Submission',
      html: makeANiceEmail(
        `Thank you for your submission to Every Data ${client.firstName}!
<br/><br/>
        A representative will contact you during business hours.`,
      ),
    })
    const mailRes2 = await transport.sendMail({
      from: 'info@everydata.com',
      to: 'phil@everydata.com',
      subject: 'New Everydata Submission',
      html: makeANiceEmail(
        `A new submission has been received for everydata.com!
<br/><br/>
        \n\n  Click the following link for Admin login page: <a href="${
          process.env.FRONTEND_URL
        }/login">Admin Login</a>`,
      ),
    })
    return client
  },
  updateClient(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!')
    }

    const updates = { ...args }
    const hasPermission = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission),
    )
    if (!hasPermission) {
      throw new Error("You don't have permission to do that!")
    }
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
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!')
    }
    const where = { id: args.id }
    const hasPermission = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission),
    )
    if (!hasPermission) {
      throw new Error("You don't have permission to do that!")
    }
    return ctx.db.mutation.deleteClient({ where }, info)
  },
  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase()
    let name = args.firstName
    let surName = args.lastName
    name = name.charAt(0).toUpperCase() + name.slice(1).trim()
    surName = surName.charAt(0).toUpperCase() + surName.slice(1).trim()
    if (!args.email.includes('@')) {
      throw new Error('Please enter a valid email address')
    }
    if (!args.email.includes('.')) {
      throw new Error('Please enter a valid email address')
    }
    if (args.password.length < 5) {
      throw new Error('Your Password must contain at least 6 characters')
    }
    if (args.firstName < 1) {
      throw new Error('Please enter your First Name')
    }
    if (args.lastName < 1) {
      throw new Error('Please enter your Last Name')
    }
    if (args.cellPhone < 1) {
      throw new Error('Please enter a complete cell phone number')
    }
    if (args.businessName < 1) {
      throw new Error('Please enter a Business Name')
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
          permissions: { set: ['USER'] },
        },
      },
      info,
    )
    const token = jwt.sign({ user: user.id }, process.env.APP_SECRET)
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365,
    })

    const mailRes = await transport.sendMail({
      from: 'info@everydata.com',
      to: user.email,
      subject: 'Everydata Submission',
      html: makeANiceEmail(
        `Thank you for your submission to Every Data ${user.firstName}!
<br/><br/>
        A representative will contact you during business hours.`,
      ),
    })

    return user
  },
  async updateUser(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) throw new Error('Please Sign In to Complete this Update')
    const currentUser = await ctx.db.query.user(
      {
        where: {
          id: userId,
        },
      },
      info,
    )
    const hasPermissionToSee = ctx.request.user.permissions.includes('ADMIN')
    let cellPhone = args.cellPhone

    const updatedUser = await ctx.db.mutation.updateUser({
      where: { id: currentUser.id },
      data: {
        cellPhone: cellPhone,
        businessName: args.businessName,
        email: args.email,
      },
    })
    if (!hasPermissionToSee) {
      throw new Error('Nope! Dont have permission to do this')
    }
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
      maxAge: 1000 * 60 * 60 * 24 * 365,
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
    const hasPermissionToSee = ctx.request.user.permissions.includes('ADMIN')
    if (!hasPermissionToSee) {
      throw new Error('Nope! Dont have permission to do this')
    }

    const randomBytesPromiseified = promisify(randomBytes)
    const resetToken = (await randomBytesPromiseified(20)).toString('hex')
    const resetTokenExpiry = Date.now() + 3600000 //1 hour from now
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry },
    })
    const mailRes = await transport.sendMail({
      from: 'info@everydata.com',
      to: user.email,
      subject: 'Password Reset-EveryData',
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
  async createPost(parent, args, ctx, info) {
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('You must be signed in')
    }
    const hasPermissionToSee = ctx.request.user.permissions.includes('ADMIN')
    const post = await ctx.db.mutation.createPost(
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
    if (!hasPermissionToSee) {
      throw new Error('You are not allowed to do this!')
    }
    return post
  },
  async deletePost(parent, args, ctx, info) {
    const where = { id: args.id }
    const hasPermission = ctx.request.user.permissions.some(permission =>
      ['ADMIN'].includes(permission),
    )
    if (!hasPermission) {
      throw new Error("You don't have permission to do that!")
    }
    return ctx.db.mutation.deletePost({ where }, info)
  },
}

module.exports = Mutations
