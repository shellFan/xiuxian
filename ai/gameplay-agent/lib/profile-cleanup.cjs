'use strict';

const RETRYABLE_CODES = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY', 'EACCES']);

async function cleanupIsolatedProfile(profile, { remove, delay, attempts = 5 } = {}) {
  const removeDirectory = remove ?? ((target) => require('node:fs/promises').rm(target, { recursive: true, force: true }));
  const wait = delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await removeDirectory(profile);
      return { status: 'removed', attempts: attempt };
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_CODES.has(error?.code) || attempt === attempts) break;
      await wait(100 * attempt);
    }
  }
  return { status: 'deferred', attempts, error: `${lastError?.code ?? 'ERROR'}: ${lastError?.message ?? 'profile cleanup failed'}` };
}

module.exports = { cleanupIsolatedProfile };
