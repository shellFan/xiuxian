'use strict';

function snapshotAssetManager(assetManager) {
  if (!assetManager || typeof assetManager !== 'object') return null;

  const uuidKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const maxUuidKeySamples = 5;

  function summarizeUuidKeyMap(value) {
    const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
    const uuidSamples = [];
    for (const [key, entryValue] of entries) {
      if (typeof key === 'string' && uuidKeyPattern.test(key)) uuidSamples.push(key);
      if (!entryValue || typeof entryValue !== 'object') continue;
      const uuidDescriptor = Object.getOwnPropertyDescriptor(entryValue, 'uuid');
      if (uuidDescriptor && Object.prototype.hasOwnProperty.call(uuidDescriptor, 'value')
        && typeof uuidDescriptor.value === 'string' && uuidKeyPattern.test(uuidDescriptor.value)) {
        uuidSamples.push(uuidDescriptor.value);
      }
    }
    return {
      keyCount: entries.length,
      uuidKeySamples: [...new Set(uuidSamples)].slice(0, maxUuidKeySamples),
    };
  }

  function summarizeValue(value) {
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return { type: 'string' };
    if (Array.isArray(value)) return { length: value.length };
    if (value instanceof Map || value instanceof Set) return { size: value.size };
    if (value && typeof value === 'object') return { keyCount: Object.keys(value).length };
    return { type: typeof value };
  }

  function summarizeComponent(component) {
    const result = {};
    if (!component || typeof component !== 'object') return result;
    for (const key of Object.keys(component)) {
      const descriptor = Object.getOwnPropertyDescriptor(component, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
      if (typeof descriptor.value === 'function') continue;
      if ((key === '_downloading' || key === '_parsing')
        && descriptor.value && typeof descriptor.value === 'object'
        && !Array.isArray(descriptor.value)) {
        result[key] = summarizeUuidKeyMap(descriptor.value);
      } else {
        result[key] = summarizeValue(descriptor.value);
      }
    }
    return result;
  }

  const components = {};
  const componentNames = [
    'downloader', 'parser', 'pipeline', 'fetchPipeline', 'transformPipeline',
    'loadPipeline', 'postProcessPipeline', 'factory', 'bundles',
    '_downloader', '_parser', '_pipeline', '_fetchPipeline', '_transformPipeline',
    '_loadPipeline', '_postProcessPipeline',
  ];
  for (const name of componentNames) {
    const descriptor = Object.getOwnPropertyDescriptor(assetManager, name);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (!descriptor.value || typeof descriptor.value !== 'object') continue;
    components[name] = summarizeComponent(descriptor.value);
  }

  return {
    initialized: typeof assetManager._initialized === 'boolean' ? assetManager._initialized : null,
    components,
  };
}

function createAssetManagerDiagnosticsExpression() {
  return `(${snapshotAssetManager.toString()})(window.cc?.assetManager)`;
}

module.exports = { createAssetManagerDiagnosticsExpression, snapshotAssetManager };
