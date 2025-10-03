const config = require('../config/config');
const { APPLICATION_ENVIRONMENT, RESPONSE_CODE } = require('../config/constants/common');
const CryptoJS = require('crypto-js');
const util = require('../utils/messages');
const ENCRYPTION_KEY = config.API.CSRF_TOKEN_SECRET;
const getHashedKey = (key) => CryptoJS.SHA256(key);

const generateRandomString = (length = 32) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const generateCsrfToken = () => {
  const data = generateRandomString();
  const hashedKey = getHashedKey(ENCRYPTION_KEY);

  const encrypted = CryptoJS.AES.encrypt(data, hashedKey, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    token: encrypted.toString(),
    cookie: data,
  };
};

const verifyCsrfToken = (encryptedToken, expectedRaw) => {
  const hashedKey = getHashedKey(ENCRYPTION_KEY);

  const decrypted = CryptoJS.AES.decrypt(encryptedToken, hashedKey, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });

  const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
  return decryptedText === expectedRaw;
};

// No excluded URLs by default. Add URLs to this array if you want to exclude them from CSRF protection.
const excludedUrls = [];

/**
 * Express middleware to validate CSRF tokens on incoming requests.
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 */
function csrfMiddleware(req, res, next) {
  if (excludedUrls.includes(req.url)) {
    next();
    return;
  }
  const csrfToken = req.headers['x-csrf-token'];
  const cookieToken = req.headers['x-csrf-raw'];
  if (!csrfToken || !cookieToken) {
    return res.status(RESPONSE_CODE.FORBIDDEN).json({ status: RESPONSE_CODE.FORBIDDEN, message: 'CSRF token or cookie missing', code: RESPONSE_CODE.CSRF_TOKEN_MISSING });
  }
  if (!verifyCsrfToken(csrfToken, cookieToken)) {
    return res.status(RESPONSE_CODE.FORBIDDEN).json({ status: RESPONSE_CODE.FORBIDDEN, message: 'Invalid CSRF token', code: RESPONSE_CODE.INVALID_CSRF_TOKEN });
  }
  next();
}

/**
 * Express middleware to assign a new CSRF token and set it as a cookie.
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 */
function assignCsrfToken(req, res, next) {
  const { token, cookie } = generateCsrfToken();
  res.cookie('csrf_token', cookie, {
    httpOnly: true,
    secure: config.SERVER.NODE_ENV === APPLICATION_ENVIRONMENT.PRODUCTION,
    sameSite: 'Strict',
    path: '/',
  });
  return res.json({ csrfToken: token, cookie: cookie });
}

/**
 * Express middleware to check authorization for assigning CSRF tokens.
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 */
function checkAssignTokenAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader) return util.unAuthenticated(res)
    const token = authHeader.split(' ')[1];
    if (token === config.AUTH.CSRF_TOKEN_SECRET) next()
    else return res.status(RESPONSE_CODE.FORBIDDEN).json({ status: RESPONSE_CODE.FORBIDDEN, message: 'Invalid CSRF token', code: RESPONSE_CODE.INVALID_CSRF_TOKEN });
  } catch (error) {
    return util.unAuthenticated(res)
  }
}

module.exports = {
  csrfMiddleware,
  assignCsrfToken,
  checkAssignTokenAuth
}