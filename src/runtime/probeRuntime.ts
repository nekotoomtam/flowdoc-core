import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExportResources } from './exportResources.js';
const exec = promisify(execFile);
export async function probeRuntime(resources: ExportResources): Promise<{ python: string; fontTools: string }> {
  const options = { timeout: 10_000, maxBuffer: 1024 * 1024, windowsHide: true };
  const font = resources.fonts[0];
  if (!font) throw Error('No font resource');
  const shape = JSON.parse((await exec(resources.shaperPath, [font.path, 'ก', font.id], options)).stdout);
  if (shape.shaperRevision !== 'rustybuzz-0.20.1' || !shape.glyphs?.length || shape.glyphs.some((g: {glyphId:number}) => !g.glyphId)) throw Error('Incompatible shaper');
  const segmentation = JSON.parse((await exec(resources.segmenterPath, ['ก'], options)).stdout);
  if (segmentation.segmenterRevision !== 'icu_segmenter-2.2.0' || !Array.isArray(segmentation.breakByteOffsets)) throw Error('Incompatible segmenter');
  const result = JSON.parse((await exec(resources.pythonExecutable, ['-c', 'import sys,json,fontTools; print(json.dumps({"python":".".join(map(str,sys.version_info[:3])),"fontTools":fontTools.__version__}))'], options)).stdout);
  return result;
}
