'use strict';

const crypto = require('node:crypto');
const log4js = require('ep_etherpad-lite/node_modules/log4js');
const logger = log4js.getLogger('ep_ai_mcp');
const {createMcpHandler} = require('./mcpServer');

// Mirrors core's isApiTokenAuthorized() (OidcProviderSecurity.ts, 3.3.8+) for
// cores that don't export it. A client_credentials token is identified by a
// grant marker the provider signs into it; any other token needs admin: true.
const GRANT_CLAIM = 'etherpad_grant';
const CLIENT_CREDENTIALS_GRANT = 'client_credentials';
const fallbackIsApiTokenAuthorized = (payload, clientIds) => {
  if (payload == null) return false;
  if (payload[GRANT_CLAIM] === CLIENT_CREDENTIALS_GRANT) {
    return typeof payload.sub === 'string' && clientIds.includes(payload.sub);
  }
  return payload.admin === true;
};

const getIsApiTokenAuthorized = () => {
  try {
    const sec = require('ep_etherpad-lite/node/security/OidcProviderSecurity');
    if (typeof sec.isApiTokenAuthorized === 'function') return sec.isApiTokenAuthorized;
  } catch { /* older core */ }
  return fallbackIsApiTokenAuthorized;
};

const getSsoClientIds = () => {
  try {
    const mod = require('ep_etherpad-lite/node/utils/Settings');
    const settings = mod.sso ? mod : (mod.default || mod);
    const clients = settings.sso && Array.isArray(settings.sso.clients) ? settings.sso.clients : [];
    return clients.map((c) => c && c.client_id).filter((id) => typeof id === 'string');
  } catch {
    return [];
  }
};

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// /mcp gives full read/write access to every pad, so it applies the same
// rules as Etherpad's HTTP API (APIHandler.ts): in apikey mode only the API
// key is accepted; otherwise a JWT must be signed by Etherpad's OAuth2
// provider AND be an admin or client_credentials token. A signed token for an
// ordinary user is not enough.
const authMiddleware = async (req, res, next) => {
  try {
    let apikey;
    try {
      apikey = require('ep_etherpad-lite/node/handler/APIKeyHandler').apikey;
    } catch { apikey = null; }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (apikey && apikey.trim().length > 0) {
      if (token && safeEqual(token, apikey.trim())) return next();
    } else if (token) {
      try {
        const jose = require('ep_etherpad-lite/node_modules/jose');
        const {publicKeyExported} = require('ep_etherpad-lite/node/security/OAuth2Provider');
        if (publicKeyExported) {
          const {payload} =
              await jose.jwtVerify(token, publicKeyExported, {algorithms: ['RS256']});
          if (getIsApiTokenAuthorized()(payload, getSsoClientIds())) return next();
        }
      } catch { /* JWT failed */ }
    }

    res.status(401).json({error: 'Unauthorized: valid API key or admin JWT required'});
  } catch (err) {
    logger.error(`Auth error: ${err.message}`);
    res.status(500).json({error: 'Authentication error'});
  }
};

exports.expressCreateServer = (hookName, {app}) => {
  const mcpHandler = createMcpHandler();
  app.all('/mcp', authMiddleware, mcpHandler);
  logger.info('MCP server mounted at /mcp');
};

exports.authMiddleware = authMiddleware;
exports.fallbackIsApiTokenAuthorized = fallbackIsApiTokenAuthorized;
