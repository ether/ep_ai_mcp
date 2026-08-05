'use strict';
const {z} = require('zod');
const padManager = require('ep_etherpad-lite/node/db/PadManager');
const authorManager = require('ep_etherpad-lite/node/db/AuthorManager');
const epAiCore = require('ep_ai_core/index');

// Etherpad attributes inserts to this reserved id when no real author made
// them: the default pad content written on pad creation, HTTP API
// setText/appendText/setHTML calls without an authorId, server-side imports.
// It has no author record and core keeps it out of listAuthorsOfPad, so
// reporting it here just yielded a phantom author called "Unknown".
// See ether/etherpad#8044.
const SYSTEM_AUTHOR_ID = 'a.etherpad-system';

module.exports = (server) => {
  server.tool('list_pads',
      'List all pad IDs the AI has access to',
      {},
      async () => {
        const allPads = await padManager.listAllPads();
        const settings = epAiCore.getSettings();
        const accessible = allPads.padIDs.filter(
            (id) => epAiCore.accessControl.canRead(id, settings));
        return {
          content: [{type: 'text', text: JSON.stringify({padIds: accessible}, null, 2)}],
        };
      });

  server.tool('get_pad_info',
      'Get metadata about a pad',
      {padId: z.string()},
      async ({padId}) => {
        if (!epAiCore.accessControl.canRead(padId, epAiCore.getSettings())) {
          return {content: [{type: 'text', text: 'Access denied'}]};
        }
        const pad = await padManager.getPad(padId);
        const authorIds = pad.getAllAuthors().filter((id) => id !== SYSTEM_AUTHOR_ID);
        const authors = await Promise.all(authorIds.map(async (id) => ({
          id,
          name: await authorManager.getAuthorName(id) || 'Unknown',
        })));
        const lastEdited = await pad.getLastEdit();
        return {content: [{type: 'text', text: JSON.stringify({
          padId,
          revisionCount: pad.getHeadRevisionNumber() + 1,
          authors,
          lastEdited: lastEdited ? new Date(lastEdited).toISOString() : null,
          publicStatus: pad.publicStatus,
          chatMessages: pad.chatHead + 1,
          textLength: pad.text().length,
        }, null, 2)}]};
      });
};
