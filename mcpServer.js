'use strict';

const {McpServer} = require('@modelcontextprotocol/sdk/server/mcp.js');
const {StreamableHTTPServerTransport} =
    require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const log4js = require('ep_etherpad-lite/node_modules/log4js');
const logger = log4js.getLogger('ep_ai_mcp');

const registerAuthorshipTools = require('./tools/authorship');
const registerContentTools = require('./tools/content');
const registerEditingTools = require('./tools/editing');
const registerChatTools = require('./tools/chat');
const registerMetaTools = require('./tools/meta');

// Session limits to prevent DoS
const MAX_SESSIONS = 100;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Rate limiting per IP
const MCP_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MCP_MAX_REQUESTS_PER_WINDOW = 120; // 2 requests/sec average
const ipRequestCounts = {};

const checkRateLimit = (ip) => {
  const now = Date.now();
  if (!ipRequestCounts[ip] || now - ipRequestCounts[ip].windowStart > MCP_RATE_LIMIT_WINDOW_MS) {
    ipRequestCounts[ip] = {windowStart: now, count: 0};
  }
  ipRequestCounts[ip].count++;
  return ipRequestCounts[ip].count > MCP_MAX_REQUESTS_PER_WINDOW;
};

// Clean up stale IP entries periodically
const ipCleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of Object.entries(ipRequestCounts)) {
    if (now - data.windowStart > MCP_RATE_LIMIT_WINDOW_MS * 2) delete ipRequestCounts[ip];
  }
}, 5 * 60 * 1000);
ipCleanup.unref();

/**
 * Wrap an MCP server to log all tool calls for audit purposes.
 */
const wrapWithAuditLog = (server) => {
  const origTool = server.tool.bind(server);
  server.tool = (name, description, schema, handler) => {
    const wrappedHandler = async (args) => {
      const padId = args.padId || args.padID || '(none)';
      logger.info(`MCP tool call: ${name} padId=${padId}`);
      return handler(args);
    };
    return origTool(name, description, schema, wrappedHandler);
  };
  return server;
};

const createMcpServer = () => {
  const server = wrapWithAuditLog(new McpServer({name: 'etherpad', version: '0.0.1'}));
  registerAuthorshipTools(server);
  registerContentTools(server);
  registerEditingTools(server);
  registerChatTools(server);
  registerMetaTools(server);
  logger.info('MCP server created with all tools registered');
  return server;
};

const createMcpHandler = () => {
  const transports = {};
  const sessionTimestamps = {};

  // Periodic cleanup of stale sessions
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [id, ts] of Object.entries(sessionTimestamps)) {
      if (now - ts > SESSION_TTL_MS) {
        logger.info(`Evicting stale MCP session ${id}`);
        if (transports[id]) {
          try { transports[id].close(); } catch { /* ignore */ }
          delete transports[id];
        }
        delete sessionTimestamps[id];
      }
    }
  }, 60000); // Check every minute
  cleanup.unref(); // Don't keep process alive

  return async (req, res) => {
    try {
      // Rate limit by IP
      const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
      if (checkRateLimit(clientIp)) {
        logger.warn(`MCP rate limit exceeded for ${clientIp}`);
        res.status(429).json({error: 'Rate limit exceeded'});
        return;
      }

      if (req.method === 'POST') {
        const sessionId = req.headers['mcp-session-id'];
        let transport;
        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
          sessionTimestamps[sessionId] = Date.now(); // Refresh TTL
        } else {
          // Check session limit
          if (Object.keys(transports).length >= MAX_SESSIONS) {
            res.status(503).json({error: 'Too many active sessions'});
            return;
          }
          transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined});
          const server = createMcpServer();
          await server.connect(transport);
          transport.onclose = () => {
            if (transport.sessionId) {
              delete transports[transport.sessionId];
              delete sessionTimestamps[transport.sessionId];
            }
          };
        }
        await transport.handleRequest(req, res);
        if (transport.sessionId && !transports[transport.sessionId]) {
          transports[transport.sessionId] = transport;
          sessionTimestamps[transport.sessionId] = Date.now();
        }
      } else if (req.method === 'GET') {
        const sessionId = req.headers['mcp-session-id'];
        if (!sessionId || !transports[sessionId]) {
          res.status(400).json({error: 'Invalid or missing session ID'});
          return;
        }
        sessionTimestamps[sessionId] = Date.now();
        await transports[sessionId].handleRequest(req, res);
      } else if (req.method === 'DELETE') {
        const sessionId = req.headers['mcp-session-id'];
        if (sessionId && transports[sessionId]) {
          await transports[sessionId].close();
          delete transports[sessionId];
          delete sessionTimestamps[sessionId];
        }
        res.status(200).end();
      } else {
        res.status(405).json({error: 'Method not allowed'});
      }
    } catch (err) {
      logger.error(`MCP handler error: ${err.message}`);
      if (!res.headersSent) res.status(500).json({error: 'Internal server error'});
    }
  };
};

exports.createMcpServer = createMcpServer;
exports.createMcpHandler = createMcpHandler;
