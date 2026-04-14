'use strict';
const {z} = require('zod');
const padManager = require('ep_etherpad-lite/node/db/PadManager');
const authorManager = require('ep_etherpad-lite/node/db/AuthorManager');
const Changeset = require('ep_etherpad-lite/static/js/Changeset');
const padMessageHandler = require('ep_etherpad-lite/node/handler/PadMessageHandler');
const epAiCore = require('ep_ai_core/index');
const log4js = require('ep_etherpad-lite/node_modules/log4js');
const logger = log4js.getLogger('ep_ai_mcp:editing');

const getAiAuthor = async (authorName) => {
  const result = await authorManager.createAuthor(authorName || 'AI (MCP)');
  return result.authorID;
};

module.exports = (server) => {
  server.tool('edit_pad',
      'Edit pad content. Actions: insert (at position), replace (find and replace), ' +
      'append (add to end)',
      {
        padId: z.string(),
        action: z.enum(['insert', 'replace', 'append']),
        text: z.string().describe('Text to insert/append or replacement text'),
        position: z.number().optional().describe('Position for insert'),
        findText: z.string().optional().describe('Text to find for replace'),
        authorName: z.string().optional(),
      },
      async ({padId, action, text, position, findText, authorName}) => {
        if (!epAiCore.accessControl.canWrite(padId, epAiCore.getSettings())) {
          return {
            content: [{type: 'text', text: 'Access denied: AI cannot edit this pad'}],
          };
        }
        const pad = await padManager.getPad(padId);
        const authorId = await getAiAuthor(authorName);
        const currentText = pad.text();
        try {
          let changeset;
          if (action === 'append') {
            changeset =
                Changeset.makeSplice(currentText, currentText.length - 1, 0, text);
          } else if (action === 'insert') {
            const pos = position ?? 0;
            if (pos < 0 || pos > currentText.length - 1) {
              return {content: [{type: 'text', text: `Invalid position: ${pos}`}]};
            }
            changeset = Changeset.makeSplice(currentText, pos, 0, text);
          } else if (action === 'replace') {
            if (!findText) {
              return {
                content: [{type: 'text', text: 'findText required for replace'}],
              };
            }
            const idx = currentText.indexOf(findText);
            if (idx === -1) {
              return {content: [{type: 'text',
                text: `Text not found: "${findText.substring(0, 100)}"`}]};
            }
            changeset =
                Changeset.makeSplice(currentText, idx, findText.length, text);
          }
          await pad.appendRevision(changeset, authorId);
          await padMessageHandler.updatePadClients(pad);
          return {
            content: [{type: 'text', text: `Edit applied: ${action} (${text.length} chars)`}],
          };
        } catch (err) {
          logger.error(`Edit error: ${err.message}`);
          return {content: [{type: 'text', text: `Edit failed: ${err.message}`}]};
        }
      });

  server.tool('create_pad',
      'Create a new pad with optional initial content',
      {
        padId: z.string().optional(),
        text: z.string().optional(),
      },
      async ({padId, text}) => {
        const id = padId ||
            `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const exists = await padManager.doesPadExist(id);
        if (exists) {
          return {content: [{type: 'text', text: `Pad already exists: ${id}`}]};
        }
        await padManager.getPad(id, text || '');
        return {
          content: [{type: 'text', text: JSON.stringify({padId: id, created: true}, null, 2)}],
        };
      });
};
