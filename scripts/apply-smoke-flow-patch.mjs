import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readGit(relPath) {
  return execSync(`git show HEAD:${relPath}`, { cwd: root, encoding: 'utf8' });
}

const helper = `
/** Admin PIN tam ekran kapisini kapatir — profil navigasyonu icin */
async function dismissAdminPinGateIfVisible(browser) {
  if (!(await isDisplayed(browser, SELECTORS.adminPinInput, 3_000))) {
    return;
  }
  if (await isDisplayed(browser, SELECTORS.adminPinSkip, 2_000)) {
    await browser.$(SELECTORS.adminPinSkip).click();
    return;
  }
  const { adminPin } = getMobileTestCredentials();
  if (!adminPin) return;
  const pinInput = await waitForTestId(browser, SELECTORS.adminPinInput);
  await pinInput.setValue(adminPin);
  await browser.$(SELECTORS.adminPinSubmit).click();
}
`;

let flows = readGit('e2e/mobile/helpers/flows.js');
flows = flows.replace('/** Profilden', `${helper}\n/** Profilden`);
flows = flows.replace(
  '  await waitForTestId(browser, SELECTORS.navHome, LOGIN_TIMEOUT_MS);\n\n  const errorVisible',
  '  await waitForTestId(browser, SELECTORS.navHome, LOGIN_TIMEOUT_MS);\n  await dismissAdminPinGateIfVisible(browser);\n\n  const errorVisible'
);
flows = flows.replace(
  'export async function logoutFromProfile(browser, meta) {\n  await switchToAppWebView(browser);',
  'export async function logoutFromProfile(browser, meta) {\n  await switchToAppWebView(browser);\n  await dismissAdminPinGateIfVisible(browser);'
);
flows = flows.replace(
  `await browser.execute('mobile: shell', {
      command: 'am',
      args: ['force-stop', appPackage]
    });`,
  'await browser.pressKeyCode(3);'
);
flows = flows.replace(
  'export async function verifyAdminMembers(browser, meta) {\n  const { adminPin } = getMobileTestCredentials();',
  'export async function verifyAdminMembers(browser, meta) {\n  await dismissAdminPinGateIfVisible(browser);\n  const { adminPin } = getMobileTestCredentials();'
);
writeFileSync(join(root, 'e2e/mobile/helpers/flows.js'), flows, 'utf8');

let selectors = readGit('e2e/mobile/helpers/selectors.js');
if (!selectors.includes('adminPinSkip')) {
  selectors = selectors.replace(
    "adminPinSubmit: '[data-testid=\"admin-pin-submit\"]'",
    "adminPinSubmit: '[data-testid=\"admin-pin-submit\"]',\n  adminPinSkip: '[data-testid=\"admin-pin-skip\"]'"
  );
}
writeFileSync(join(root, 'e2e/mobile/helpers/selectors.js'), selectors, 'utf8');

let run = readFileSync(join(root, 'scripts/run-browserstack-mobile-tests.mjs'), 'utf8');
if (run.includes('cwd: ROOT,')) {
  run = run.replace('cwd: ROOT,', "cwd: path.join(ROOT, 'e2e/mobile'),");
  writeFileSync(join(root, 'scripts/run-browserstack-mobile-tests.mjs'), run, 'utf8');
}

console.log('smoke-flow-patch ok');