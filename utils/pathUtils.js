// utils/pathUtils.js

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Returns __filename and __dirname for ES Modules.
 * Replaces the need to manually define them in each file.
 * @param {string} importMetaUrl The value of import.meta.url from the calling file.
 * @returns {{__filename: string, __dirname: string}} Object with __filename and __dirname.
 */
export function getFilePaths(importMetaUrl) {
    const __filename = fileURLToPath(importMetaUrl);
    const __dirname = path.dirname(__filename);
    return { __filename, __dirname };
}