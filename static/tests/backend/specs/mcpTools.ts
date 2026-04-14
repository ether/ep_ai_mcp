'use strict';

import {strict as assert} from 'assert';

const common = require('ep_etherpad-lite/tests/backend/common');
const {generateJWTToken} = common;
const randomString = require('ep_etherpad-lite/static/js/pad_utils').randomString;
const padManager = require('ep_etherpad-lite/node/db/PadManager');

let agent: any;
const apiVersion = 1;

describe('ep_ai_mcp - MCP endpoint', function () {
  before(async function () {
    agent = await common.init();
  });

  describe('authentication', function () {
    it('returns 401 without auth header', async function () {
      await agent.post('/mcp')
          .send({jsonrpc: '2.0', method: 'initialize', id: 1})
          .expect(401);
    });

    it('returns 401 with invalid token', async function () {
      await agent.post('/mcp')
          .set('Authorization', 'Bearer invalid-token')
          .send({jsonrpc: '2.0', method: 'initialize', id: 1})
          .expect(401);
    });

    it('accepts valid JWT token', async function () {
      const res = await agent.post('/mcp')
          .set('Authorization', await generateJWTToken())
          .set('Content-Type', 'application/json')
          .send({jsonrpc: '2.0', method: 'initialize', id: 1, params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: {name: 'test', version: '1.0'},
          }});
      assert.notEqual(res.status, 401);
    });
  });

  describe('pad operations via API', function () {
    let padId: string;

    beforeEach(async function () {
      padId = `test-mcp-${randomString(10)}`;
      await agent.get(`/api/${apiVersion}/createPad?padID=${padId}&text=Hello from test`)
          .set('Authorization', await generateJWTToken());
    });

    it('pad is created and readable', async function () {
      const pad = await padManager.getPad(padId);
      assert.ok(pad.text().includes('Hello from test'));
    });

    it('list_pads includes created pad', async function () {
      const allPads = await padManager.listAllPads();
      assert.ok(allPads.padIDs.includes(padId));
    });
  });
});
