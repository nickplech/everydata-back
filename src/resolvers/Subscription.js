const REMINDER_UPDATED = 'reminder_updated'

const Subscription = {
  textReminder: {
    subscribe: (parent, args, { pubsub }) => {
      const channel = Math.random()
        .toString(36)
        .substring(2, 15) // random channel name
      let count = 0
      setInterval(() =>
        pubsub.asyncIterator(REMINDER_UPDATED, {
          somethingChanged: { id: '123' },
        }),
      )
      return pubsub.asyncIterator(channel)
    },
  },
}

module.exports = Subscription
