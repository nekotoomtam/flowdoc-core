import { fileURLToPath } from 'node:url';
import { loadResources } from './loadResources.js';
import { probeRuntime } from './probeRuntime.js';
import type { ResourceOptions, ExportResources } from './exportResources.js';
import type { Result } from '../result.js';
export function loadBundledResources(options: ResourceOptions): Promise<Result<ExportResources>> {
  return loadResources(fileURLToPath(new URL('../../',import.meta.url)),options,{platform:process.platform,arch:process.arch,probe:probeRuntime});
}
