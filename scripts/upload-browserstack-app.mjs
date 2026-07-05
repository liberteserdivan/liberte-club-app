#!/usr/bin/env node
/** BrowserStack App Automate upload — credential yalnizca env'den */
import fs from 'node:fs';
import path from 'node:path';
import { getBrowserStackAuth } from '../e2e/mobile/helpers/credentials.js';

export async function uploadBrowserStackApp(appPath, customId = '') {
  if (!appPath || !fs.existsSync(appPath)) {
    throw new Error(`Uygulama dosyasi bulunamadi: ${appPath || '(bos)'}`);
  }

  const { username, accessKey } = getBrowserStackAuth();
  const form = new FormData();
  const bytes = fs.readFileSync(appPath);
  form.append('file', new Blob([bytes]), path.basename(appPath));
  if (customId) form.append('custom_id', customId);

  const token = Buffer.from(`${username}:${accessKey}`).toString('base64');
  const response = await fetch('https://api-cloud.browserstack.com/app-automate/upload', {
    method: 'POST',
    headers: { Authorization: `Basic ${token}` },
    body: form
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.app_url) {
    throw new Error(`BrowserStack upload basarisiz (${response.status})`);
  }

  return {
    appUrl: payload.app_url,
    customId: payload.custom_id || customId || path.basename(appPath),
    fileName: path.basename(appPath)
  };
}

