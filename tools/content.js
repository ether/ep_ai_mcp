'use strict';
const {z} = require('zod');
const padManager = require('ep_etherpad-lite/node/db/PadManager');
const epAiCore = require('ep_ai_core/index');

module.exports = (server) => {
  server.tool('get_pad_text',
      'Get current plain text of a pad',
      {padId: z.string()},
      async ({padId}) => {
        if (!epAiCore.accessControl.canRead(padId, epAiCore.getSettings())) {
          return {content: [{type: 'text', text: 'Access denied'}]};
        }
        const pad = await padManager.getPad(padId);
        return {content: [{type: 'text', text: pad.text()}]};
      });

  server.tool('get_pad_html',
      'Get current HTML content of a pad',
      {padId: z.string()},
      async ({padId}) => {
        if (!epAiCore.accessControl.canRead(padId, epAiCore.getSettings())) {
          return {content: [{type: 'text', text: 'Access denied'}]};
        }
        const exportHTML = require('ep_etherpad-lite/node/utils/ExportHtml');
        const html = await exportHTML.getPadHTMLDocument(padId, undefined);
        return {content: [{type: 'text', text: html}]};
      });

  server.tool('get_pad_diff',
      'Get difference between two revisions',
      {
        padId: z.string(),
        startRev: z.number().optional(),
        endRev: z.number().optional(),
      },
      async ({padId, startRev, endRev}) => {
        if (!epAiCore.accessControl.canRead(padId, epAiCore.getSettings())) {
          return {content: [{type: 'text', text: 'Access denied'}]};
        }
        const pad = await padManager.getPad(padId);
        const start = startRev ?? 0;
        const end = endRev ?? pad.getHeadRevisionNumber();
        const startAText = await pad.getInternalRevisionAText(start);
        const endAText = await pad.getInternalRevisionAText(end);
        return {content: [{type: 'text', text: JSON.stringify({
          padId, startRev: start, endRev: end,
          startText: startAText.text, endText: endAText.text,
        }, null, 2)}]};
      });

  server.tool('search_pads',
      'Search for pads containing specific text',
      {query: z.string()},
      async ({query}) => {
        const padIds = await padManager.listAllPads();
        const settings = epAiCore.getSettings();
        const results = [];
        const MAX_SCAN = 500; // Limit how many pads we scan to prevent DoS
        let scanned = 0;
        for (const padId of padIds.padIDs) {
          if (++scanned > MAX_SCAN) break;
          if (!epAiCore.accessControl.canRead(padId, settings)) continue;
          try {
            const pad = await padManager.getPad(padId);
            const text = pad.text();
            const idx = text.toLowerCase().indexOf(query.toLowerCase());
            if (idx !== -1) {
              results.push({
                padId,
                snippet: text.substring(
                    Math.max(0, idx - 50), idx + query.length + 50),
              });
            }
          } catch { /* skip */ }
          if (results.length >= 20) break;
        }
        return {content: [{type: 'text', text: JSON.stringify({results}, null, 2)}]};
      });
};
