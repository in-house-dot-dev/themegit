#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs-extra');
const jsondiffpatch = require('jsondiffpatch');
const jsonfile = require('jsonfile');
const merge = require('deepmerge');
const retry = require('retry');

const actionArgs = process.argv.slice(2);
const BUILT_THEME_DIR = actionArgs[0];
const STORE_DOMAIN = actionArgs[1];
const PASSWORD = actionArgs[2];
const CONFIG_CONFLICT_STRATEGY = actionArgs[3];
const LOCALE_CONFLICT_STRATEGY = actionArgs[4];
const PINNED_BRANCHES = actionArgs[5];

const LIVE_THEME_PATTERN=/\[(\d+)\]\[live\]\s(.+)/gm;
const ANY_THEME_PATTERN=/\[(\d+)\](?:\[live\])?\s(.+)/gm;

const ConflictStrategies = {
  RAISE: 'raise',
  TAKE_LIVE: 'take-live-version',
  TAKE_BRANCH: 'take-branch-version',
  MERGE_INTO_LIVE: 'merge-into-live-version',
  MERGE_INTO_BRANCH: 'merge-into-branch-version',
};

function findLiveThemeID() {
  const stdout = execSync(`theme get --list --password=${PASSWORD} --store=${STORE_DOMAIN}`);
  return stdout.toString().split("\n").reduce((acc, line) => {
    const splat = LIVE_THEME_PATTERN.exec(line);
    LIVE_THEME_PATTERN.lastIndex = 0;
    if (splat) return splat[1];
    return acc;
  }, null);
}

function findThemeIDByThemeName(name) {
  const stdout = execSync(`theme get --list --password=${PASSWORD} --store=${STORE_DOMAIN}`);
  return stdout.toString().split("\n").reduce((acc, line) => {
    const splat = ANY_THEME_PATTERN.exec(line);
    ANY_THEME_PATTERN.lastIndex = 0;
    if (splat && name === splat[2]) {
      return splat[1];
    }
    return acc;
  }, null);
}

function downloadThemeByID(themeId) {
  const tmpDir = `./themegit_theme_cache/${themeId}`;
  if (fs.existsSync(tmpDir)) {
    return tmpDir;
  } else {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const operation = retry.operation({
    retries: 5,
    factor: 3,
    minTimeout: 1 * 1000,
    maxTimeout: 5* 1000,
    randomize: true,
  });

  operation.attempt(function(currentAttempt) {
    console.log(`Theme Download Attempt: ${currentAttempt}`);
    try {
      execSync(`theme download --password=${PASSWORD} --store=${STORE_DOMAIN} --themeid=${themeId} --dir=${tmpDir}`);
    } catch(e) {
      if (operation.retry(e)) return;
      throw operation.mainError();
    }
  });

  return tmpDir;
}

function forceDuplicateLiveThemeToExistingThemeID(themeId) {
  const liveThemeID = findLiveThemeID();
  downloadThemeByID(liveThemeID);
  execSync(`theme deploy --password=${PASSWORD} --store=${STORE_DOMAIN} --themeid=${themeId} --dir=./themegit_theme_cache/${liveThemeID}`)
  return true;
}

function makeOrGetThemeIDForThemeName(themeName) {
  const existingThemeID = findThemeIDByThemeName(themeName);
  if (existingThemeID) return existingThemeID;

  execSync(`theme new --password=${PASSWORD} --store=${STORE_DOMAIN} --name="${themeName}"`);
  const newThemeID = findThemeIDByThemeName(themeName);
  forceDuplicateLiveThemeToExistingThemeID(newThemeID);
  return newThemeID;
}

function _buildAndLogConflicts(liveThemeDir, existingThemeDir, relativeDir) {
  const conflicts = fs.readdirSync(`${liveThemeDir}/${relativeDir}`).reduce((acc, fileName) => {
    const liveThemeFileContents = jsonfile.readFileSync(`${liveThemeDir}/${relativeDir}/${fileName}`);
    const branchThemeFileContents = jsonfile.readFileSync(`${existingThemeDir}/${relativeDir}/${fileName}`);
    const delta = jsondiffpatch.diff(liveThemeFileContents, branchThemeFileContents);
    if (delta) acc[fileName] = { delta, liveThemeFileContents, branchThemeFileContents };
    return acc;
  }, {});

  Object.keys(conflicts).forEach(fileName => {
    console.log(`\n⚠️  Conflicts found in: config/${fileName}:`);
    console.log(
      jsondiffpatch.formatters.console.format(conflicts[fileName].delta)
    );
  });

  return conflicts;
};

function _handleConflictsWithStrategy(liveThemeDir, localThemeDir, relativeDir, conflicts, strategy) {
  const hasConflicts = Object.keys(conflicts).length > 0;
  if (!hasConflicts) {
    fs.copySync(`${liveThemeDir}/${relativeDir}`, `${localThemeDir}/${relativeDir}`, { overwrite: true });
    return true;
  }

  switch(strategy) {
    case ConflictStrategies.RAISE:
      throw new Error("raise_on_file_conflict");
      break;
    case ConflictStrategies.TAKE_LIVE:
      fs.copySync(`${liveThemeDir}/${relativeDir}`, `${localThemeDir}/${relativeDir}`, { overwrite: true });
      break;
    case ConflictStrategies.TAKE_BRANCH:
      fs.copySync(`${existingThemeDir}/${relativeDir}`, `${localThemeDir}/${relativeDir}`, { overwrite: true });
      break;
    case ConflictStrategies.MERGE_INTO_LIVE:
      fs.readdirSync(`${liveThemeDir}/${relativeDir}`).forEach((fileName) => {
        const targetPath = `${localThemeDir}/${relativeDir}/${fileName}`;
        if (conflicts[fileName]) {
          const merged = merge(
            conflicts[fileName].liveThemeFileContents,
            conflicts[fileName].branchThemeFileContents
          );
          fs.mkdirSync(`${localThemeDir}/${relativeDir}`, { recursive: true });
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
          jsonfile.writeFileSync(targetPath, merged, { spaces: 2 });
        } else {
          fs.copySync(`${liveThemeDir}/${relativeDir}/${fileName}`, targetPath, { overwrite: true });
        }
      });
      break;
    case ConflictStrategies.MERGE_INTO_BRANCH:
      fs.readdirSync(`${liveThemeDir}/${relativeDir}`).forEach((fileName) => {
        const targetPath = `${localThemeDir}/${relativeDir}/${fileName}`;
        if (conflicts[fileName]) {
          const merged = merge(
            conflicts[fileName].branchThemeFileContents,
            conflicts[fileName].liveThemeFileContents
          );
          fs.mkdirSync(`${localThemeDir}/${relativeDir}`, { recursive: true });
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
          jsonfile.writeFileSync(targetPath, merged, { spaces: 2 });
        } else {
          fs.copySync(`${liveThemeDir}/${relativeDir}/${fileName}`, targetPath, { overwrite: true });
        }
      });
      break;
    default:
      throw new Error("unknown_conflict_strategy");
  }
};

function prepareLocalThemeForDeployment(localThemeDir, themeName, configConflictStrategy, localeConflictStrategy) {
  if (!fs.existsSync(localThemeDir)) {
    throw new Error("missing_local_theme_dir");
  }

  const liveThemeID = findLiveThemeID();
  const liveThemeDir = downloadThemeByID(liveThemeID);

  const existingThemeID = makeOrGetThemeIDForThemeName(themeName);
  const existingThemeDir = downloadThemeByID(existingThemeID);

  const configConflicts = _buildAndLogConflicts(liveThemeDir, existingThemeDir, 'config');
  const localeConflicts = _buildAndLogConflicts(liveThemeDir, existingThemeDir, 'locales');

  _handleConflictsWithStrategy(liveThemeDir, localThemeDir, 'config', configConflicts, configConflictStrategy);
  _handleConflictsWithStrategy(liveThemeDir, localThemeDir, 'locales', localeConflicts, localeConflictStrategy);

  const stdout = execSync(`theme deploy --password=${PASSWORD} --store=${STORE_DOMAIN} --themeid=${existingThemeID} --dir=${localThemeDir}`);

  const shopifyThemePreviewURL = `https://${STORE_DOMAIN}/?preview_theme_id=${existingThemeID}`;
  console.log(`::set-output name=SHOPIFY_THEME_PREVIEW_URL::${shopifyThemePreviewURL}`);
  return shopifyThemePreviewURL;
}

// Do Work
const workflowEvent = jsonfile.readFileSync(process.env.GITHUB_EVENT_PATH);
console.log(workflowEvent);

if (!workflowEvent) {
  throw new Error("themegit: no_workflow_metadata_found");
}

if (workflowEvent.pull_request) {
  if (workflowEvent.action === 'closed') {
    // Test for a merged PR
    if (workflowEvent.pull_request.merged) {
      const pinnedBranches = (PINNED_BRANCHES || "").split(",").map(s => s.trim());
      const pullRequestBase = workflowEvent.pull_request.base.ref;
      if (pinnedBranches.includes(pullRequestBase)) {
        const mergeCommitSHA = workflowEvent.pull_request.merge_commit_sha;
        const shortSHAstdout = execSync(`git rev-parse --short ${mergeCommitSHA}`);
        const shortSHA = shortSHAstdout.toString().trim();
        const shopifyThemePreviewURL = prepareLocalThemeForDeployment(
          BUILT_THEME_DIR,
          `📌 ${pullRequestBase}:${shortSHA} (${new Date().toISOString().substring(0, 10)})`.substring(0, 50),
          CONFIG_CONFLICT_STRATEGY,
          LOCALE_CONFLICT_STRATEGY
        );
      }
    } else {
      console.log("themegit: pull request closed, no-op");
    }
  } else {
    // Either opened, reopened, or synchronize
    const shopifyThemePreviewURL = prepareLocalThemeForDeployment(
      BUILT_THEME_DIR,
      `🚧 ${process.env.GITHUB_HEAD_REF}`.substring(0, 50),
      CONFIG_CONFLICT_STRATEGY,
      LOCALE_CONFLICT_STRATEGY
    );
  }
} else {
  // Did the developer push to a pinned branch?
  const branchName = workflowEvent.ref.split("refs/heads/")[1];
  const pinnedBranches = (PINNED_BRANCHES || "").split(",").map(s => s.trim());
  if (pinnedBranches.includes(branchName)) {
    const commitSHA = workflowEvent.head_commit.id;
    const shortSHAstdout = execSync(`git rev-parse --short ${commitSHA}`);
    const shortSHA = shortSHAstdout.toString().trim();
    const shopifyThemePreviewURL = prepareLocalThemeForDeployment(
      BUILT_THEME_DIR,
      `📌 ${branchName}:${shortSHA} (${new Date().toISOString().substring(0, 10)})`.substring(0, 50),
      CONFIG_CONFLICT_STRATEGY,
      LOCALE_CONFLICT_STRATEGY
    );
  }
}
