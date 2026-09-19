'use strict';

const { eq } = require('./_assert');
const { isBareCopilotProcess } = require('../src/agent-state');

it('isBareCopilotProcess rejects language-server and copilot+', () => {
  eq(isBareCopilotProcess('C:\\Users\\me\\copilot-language-server.exe'), false);
  eq(isBareCopilotProcess('/usr/bin/copilot+ --monitor'), false);
  eq(isBareCopilotProcess('node /usr/lib/copilot-plus/bin/copilot+'), false);
});
