'use strict';
const {z} = require('zod');
const padManager = require('ep_etherpad-lite/node/db/PadManager');
const authorManager = require('ep_etherpad-lite/node/db/AuthorManager');
const padMessageHandler = require('ep_etherpad-lite/node/handler/PadMessageHandler');
const {ChatMessage} = require('ep_etherpad-lite/static/js/ChatMessage');
const epAiCore = require('ep_ai_core/index');

module.exports = (server) => {
  server.tool('get_chat_history',
      'Get chat messages from a pad',
      {
        padId: z.string(),
        limit: z.number().optional().describe('Max messages (default 100)'),
      },
      async ({padId, limit}) => {
        if (!epAiCore.accessControl.canRead(padId, epAiCore.getSettings())) {
          return {content: [{type: 'text', text: 'Access denied'}]};
        }
        const pad = await padManager.getPad(padId);
        if (pad.chatHead < 0) {
          return {
            content: [{type: 'text', text: JSON.stringify({messages: []}, null, 2)}],
          };
        }
        const max = limit || 100;
        const start = Math.max(0, pad.chatHead - max + 1);
        const messages = await pad.getChatMessages(start, pad.chatHead);
        const enriched = await Promise.all(messages.map(async (msg) => ({
          text: msg.text,
          authorId: msg.authorId,
          authorName: msg.authorId
            ? await authorManager.getAuthorName(msg.authorId) || 'Unknown'
            : 'Unknown',
          time: msg.time,
        })));
        return {
          content: [{type: 'text', text: JSON.stringify({messages: enriched}, null, 2)}],
        };
      });

  server.tool('send_chat_message',
      'Send a chat message to a pad',
      {
        padId: z.string(),
        message: z.string(),
        authorName: z.string().optional(),
      },
      async ({padId, message, authorName}) => {
        if (!epAiCore.accessControl.canRead(padId, epAiCore.getSettings())) {
          return {content: [{type: 'text', text: 'Access denied'}]};
        }
        const author =
            await authorManager.createAuthor(authorName || 'AI (MCP)');
        const chatMsg = new ChatMessage(message, author.authorID, Date.now());
        await padMessageHandler.sendChatMessageToPadClients(chatMsg, padId);
        return {content: [{type: 'text', text: 'Message sent'}]};
      });
};
