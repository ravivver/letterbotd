import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function getFilePaths(importMetaUrl) {
    const __filename = fileURLToPath(importMetaUrl);
    const __dirname = path.dirname(__filename);
    return { __filename, __dirname };
}