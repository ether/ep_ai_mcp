'use strict';
const {z} = require('zod');
const padManager = require('ep_etherpad-lite/node/db/PadManager');
const authorManager = require('ep_etherpad-lite/node/db/AuthorManager');
const epAiCore = require('ep_ai_core/index');

module.exports = (server) => {
  server.tool('get_pad_authorship',
      'Get per-paragraph author attribution for current text',
      {padId: z.string().describe('The pad ID')},
      async ({padId}) => {
        if (!epAiCore.accessControl.canRead(padId, epAiCore.getSettings())) {
          return {content: [{type: 'text', text: 'Access denied: AI cannot access this pad'}]};
        }
        const pad = await padManager.getPad(padId);
        const result = epAiCore.authorship.getCurrentAttribution(pad);
        for (const para of result.paragraphs) {
          for (const author of para.authors) {
            if (author.authorId) {
              author.name =
                  await authorManager.getAuthorName(author.authorId) || 'Unknown';
            }
          }
        }
        return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
      });

  server.tool('get_text_provenance',
      'Get full edit history for specific text in a pad',
      {
        padId: z.string(),
        text: z.string().describe('Text to trace'),
      },
      async ({padId, text}) => {
        if (!epAiCore.accessControl.canRead(padId, epAiCore.getSettings())) {
          return {content: [{type: 'text', text: 'Access denied'}]};
        }
        const pad = await padManager.getPad(padId);
        const result = await epAiCore.authorship.getRevisionProvenance(pad, text);
        for (const entry of result.history) {
          if (entry.authorId) {
            entry.authorName =
                await authorManager.getAuthorName(entry.authorId) || 'Unknown';
          }
        }
        return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
      });

  server.tool('get_pad_contributors',
      'Get contribution statistics for all authors',
      {padId: z.string()},
      async ({padId}) => {
        if (!epAiCore.accessControl.canRead(padId, epAiCore.getSettings())) {
          return {content: [{type: 'text', text: 'Access denied'}]};
        }
        const pad = await padManager.getPad(padId);
        const result = epAiCore.authorship.getPadContributors(pad);
        for (const c of result.contributors) {
          if (c.authorId) {
            c.name = await authorManager.getAuthorName(c.authorId) || 'Unknown';
          }
        }
        return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
      });

  server.tool('get_pad_activity',
      'Get timeline of changes to a pad',
      {
        padId: z.string(),
        since: z.string().optional()
            .describe('ISO date — only include activity after this'),
      },
      async ({padId, since}) => {
        if (!epAiCore.accessControl.canRead(padId, epAiCore.getSettings())) {
          return {content: [{type: 'text', text: 'Access denied'}]};
        }
        const pad = await padManager.getPad(padId);
        const sinceMs = since ? new Date(since).getTime() : undefined;
        const result = await epAiCore.authorship.getPadActivity(pad, sinceMs);
        for (const e of result.activity) {
          if (e.authorId) {
            e.authorName =
                await authorManager.getAuthorName(e.authorId) || 'Unknown';
          }
        }
        return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
      });
};
