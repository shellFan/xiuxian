'use strict';

require('tsx/cjs');
const content = require('../assets/configs/v2/fate-events.json');
const { validateFateEventContent } = require('../assets/scripts/v59j/fate-event-schema.ts');

const result = validateFateEventContent(content.events);
if (result.errors.length > 0) {
  console.error('Fate event content is invalid:');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const options = content.events.reduce((total, event) => total + event.options.length, 0);
  const branches = content.events.reduce((total, event) => total + event.options.filter((option) => option.successChance !== undefined).length, 0);
  console.log(`Fate content valid: ${content.events.length} events, ${options} choices, ${branches} probability branches, ${result.chainIds.length} chains, ${result.endingIds.length} endings.`);
}
