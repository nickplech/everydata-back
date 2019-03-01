function sanitizeDate(birthDay) {
  const dateParts = birthDay.split('/')
  const ISODate = dateParts[2] + '-' + dateParts[0] + '-' + dateParts[1]
  const birthDate = new Date(ISODate).toISOString()
  birthDay = birthDate
}
exports.sanitizeDate = sanitizeDate
