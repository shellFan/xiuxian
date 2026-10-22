'use strict';

async function withLaunchResourceCleanup({ stage, session, child, execute, closeResources }) {
  try {
    return await execute();
  } catch (error) {
    const metrics = session?.snapshotMetrics?.() ?? null;
    const diagnostics = {
      ...(error.diagnostics ?? {}),
      launchStage: typeof stage === 'function' ? stage() : stage,
      cdpMetrics: metrics,
      pendingRequestIds: session?.pending instanceof Map ? [...session.pending.keys()] : [],
      ownedProcessId: Number.isInteger(child?.pid) ? child.pid : null,
    };
    error.diagnostics = diagnostics;
    try {
      await closeResources(session, child);
    } catch (cleanupError) {
      diagnostics.cleanupError = cleanupError?.message ?? String(cleanupError);
    }
    throw error;
  }
}

module.exports = { withLaunchResourceCleanup };
