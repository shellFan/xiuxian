'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createPreview, PREVIEW_DESTINATION, writePreviewFiles } = require('./preview.cjs');

const ROOT = path.resolve(__dirname, '../..');

function readJson(root, relativePath, inputErrors) {
  const source = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(source, 'utf8'));
  } catch (error) {
    inputErrors.push({ source: relativePath, message: `${relativePath}: ${error.message}` });
    return null;
  }
}

function loadPackFromRoot(root = ROOT) {
  const inputErrors = [];
  const pack = {
    events: readJson(root, 'assets/configs/phase4/office-events.json', inputErrors),
    achievements: readJson(root, 'assets/configs/phase4/achievements.json', inputErrors),
    daily: readJson(root, 'assets/configs/phase4/daily-tasks.json', inputErrors),
    audio: readJson(root, 'assets/configs/audio-plan.json', inputErrors),
    theme: readJson(root, 'assets/configs/ui-theme.json', inputErrors),
    sourceEvents: readJson(root, 'assets/configs/career-events.json', inputErrors),
    sourceAchievements: readJson(root, 'assets/configs/achievements.json', inputErrors),
    sourceDaily: readJson(root, 'assets/configs/daily-tasks.json', inputErrors),
  };
  pack.sourceEvents = pack.sourceEvents && pack.sourceEvents.events;
  pack.sourceAchievements = pack.sourceAchievements && pack.sourceAchievements.achievements;
  pack.sourceDaily = pack.sourceDaily && pack.sourceDaily.tasks;
  pack.inputErrors = inputErrors;
  return pack;
}

function usage() {
  return 'Usage: node tools/phase4-content-migration/index.cjs';
}

function run(argv = process.argv.slice(2), root = ROOT) {
  if (argv.length > 0) {
    if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
      console.log(usage());
      return 0;
    }
    console.error(`${usage()}\nNo arbitrary output path or runtime option is supported.`);
    return 2;
  }

  const pack = loadPackFromRoot(root);
  const preview = createPreview(pack);
  const destination = path.resolve(root, PREVIEW_DESTINATION);
  try {
    const files = writePreviewFiles(preview, destination, root);
    const hasBlockingInput = preview.report.findings.some((issue) => issue.severity === 'ERROR');
    console.log(JSON.stringify({
      status: hasBlockingInput ? 'FAIL' : 'PASS',
      previewGenerated: true,
      validation: hasBlockingInput ? 'FAIL' : 'PASS',
      activationReady: false,
      runtimeEnabled: false,
      files,
    }, null, 2));
    return hasBlockingInput ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    return 2;
  }
}

if (require.main === module) process.exitCode = run();

module.exports = { loadPackFromRoot, run, usage };
