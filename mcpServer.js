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

const createMcpServer = () => {
  const server = new McpServer({name: 'etherpad', version: '0.0.1'});
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

  return async (req, res) => {
    try {
      if (req.method === 'POST') {
        const sessionId = req.headers['mcp-session-id'];
        let transport;
        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
        } else {
          transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined});
          const server = createMcpServer();
          await server.connect(transport);
          transport.onclose = () => {
            if (transport.sessionId) delete transports[transport.sessionId];
          };
        }
        await transport.handleRequest(req, res);
        if (transport.sessionId && !transports[transport.sessionId]) {
          transports[transport.sessionId] = transport;
        }
      } else if (req.method === 'GET') {
        const sessionId = req.headers['mcp-session-id'];
        if (!sessionId || !transports[sessionId]) {
          res.status(400).json({error: 'Invalid or missing session ID'});
          return;
        }
        await transports[sessionId].handleRequest(req, res);
      } else if (req.method === 'DELETE') {
        const sessionId = req.headers['mcp-session-id'];
        if (sessionId && transports[sessionId]) {
          await transports[sessionId].close();
          delete transports[sessionId];
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
