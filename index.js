'use strict';

const log4js = require('ep_etherpad-lite/node_modules/log4js');
const logger = log4js.getLogger('ep_ai_mcp');
const {createMcpHandler} = require('./mcpServer');

const authMiddleware = async (req, res, next) => {
  try {
    let apikey;
    try {
      apikey = require('ep_etherpad-lite/node/handler/APIKeyHandler').apikey;
    } catch { apikey = null; }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (apikey && apikey.trim().length > 0) {
      if (token === apikey.trim()) return next();
    }

    // Try JWT
    try {
      const jose = require('ep_etherpad-lite/node_modules/jose');
      const {publicKeyExported} = require('ep_etherpad-lite/node/security/OAuth2Provider');
      if (publicKeyExported) {
        const jwtToCheck = authHeader.replace('Bearer ', '');
        await jose.jwtVerify(jwtToCheck, publicKeyExported, {algorithms: ['RS256']});
        return next();
      }
    } catch { /* JWT failed */ }

    res.status(401).json({error: 'Unauthorized: valid API key or JWT required'});
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
