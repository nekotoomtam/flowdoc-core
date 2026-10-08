export interface ResourceOptions { pythonExecutable: string; tempRoot: string }
export interface FontResource { id: string; path: string; sha256: string }
export interface ExportResources extends ResourceOptions {
  shaperPath: string;
  segmenterPath: string;
  subsetHelperPath: string;
  fonts: FontResource[];
}
