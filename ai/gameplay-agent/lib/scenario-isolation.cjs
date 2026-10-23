'use strict';

async function runScenariosIsolated(scenarios, executeScenario, onScenarioStart = () => {}) {
  if (!Array.isArray(scenarios)) throw new TypeError('scenarios must be an array');
  if (typeof executeScenario !== 'function') throw new TypeError('executeScenario must be a function');

  const results = [];
  for (const scenario of scenarios) {
    const runVariables = Object.create(null);
    try {
      onScenarioStart(scenario);
      results.push(await executeScenario(scenario, runVariables));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: scenario.id,
        title: scenario.title,
        status: 'failed',
        startedAt: null,
        finishedAt: new Date().toISOString(),
        error: `AUTOMATION: scenario runner failed before a result was produced: ${message}`,
        defects: [{
          id: `${scenario.id}-runner`,
          severity: 'HIGH',
          category: 'AUTOMATION_DEFECT',
          title: message,
          reproduction: [`Run scenario ${scenario.id} independently with GamePlay Agent.`],
        }],
        steps: [],
      });
    }
  }
  return results;
}

module.exports = { runScenariosIsolated };
