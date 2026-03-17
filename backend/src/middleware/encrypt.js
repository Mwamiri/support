import CryptoJS from 'crypto-js'

const key = () => process.env.ENCRYPTION_KEY || 'default_dev_key_32_chars_minimum!'

export const encrypt = (text) => {
  if (!text) return null
  return CryptoJS.AES.encrypt(String(text), key()).toString()
}

export const decrypt = (cipher) => {
  if (!cipher) return null
  try {
    const bytes = CryptoJS.AES.decrypt(cipher, key())
    return bytes.toString(CryptoJS.enc.Utf8)
  } catch {
    return null
  }
}

export const mask = (text) => {
  if (!text) return null
  const len = text.length
  if (len <= 4) return '••••'
  return text.slice(0, 2) + '•'.repeat(Math.max(4, len - 4)) + text.slice(-2)
}
