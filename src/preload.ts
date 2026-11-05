import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  importFile: (filePath: string) => ipcRenderer.invoke('import-file', filePath),
  runAnalysis: (tableName: string, analysisType: string, filter?: any) =>
    ipcRenderer.invoke('run-analysis', tableName, analysisType, filter),
  checkAiStatus: (customUrl?: string) =>
    ipcRenderer.invoke('check-ai-status', customUrl),
  queryAi: (tableName: string, question: string, customUrl?: string) =>
    ipcRenderer.invoke('query-ai', tableName, question, customUrl),
  getSimulationConfig: (tableName: string) =>
    ipcRenderer.invoke('get-simulation-config', tableName),
  runSimulation: (tableName: string, targetCol: string, adjustments: Record<string, number>, filter?: any) =>
    ipcRenderer.invoke('run-simulation', tableName, targetCol, adjustments, filter),
  scanPii: (tableName: string) =>
    ipcRenderer.invoke('privacy:scan-pii', tableName),
  applyMasking: (tableName: string, columnRules: Record<string, any>) =>
    ipcRenderer.invoke('privacy:apply-masking', tableName, columnRules),
  revertMasking: (tableName: string) =>
    ipcRenderer.invoke('privacy:revert-masking', tableName),
  purgeMemory: () =>
    ipcRenderer.invoke('privacy:purge-memory'),
  getAirGapStatus: () =>
    ipcRenderer.invoke('privacy:get-airgap-status'),
  getDiagnosticTargets: (tableName: string) =>
    ipcRenderer.invoke('diagnostic:get-targets', tableName),
  runDiagnosticInvestigation: (
    tableName: string,
    targetCol?: string,
    dimensionCol?: string,
    question?: string
  ) =>
    ipcRenderer.invoke('diagnostic:investigate', tableName, targetCol, dimensionCol, question),
  generateBriefing: (
    tableName: string,
    fileName?: string,
    quality?: any,
    insights?: any[]
  ) =>
    ipcRenderer.invoke('reporting:generate-briefing', tableName, fileName, quality, insights),
  exportBriefingHtml: (briefing: any, chartImages?: Record<string, string>) =>
    ipcRenderer.invoke('reporting:export-html', briefing, chartImages),
  exportBriefingPdf: (datasetName?: string) =>
    ipcRenderer.invoke('reporting:export-pdf', datasetName),
  selectMultipleFiles: () =>
    ipcRenderer.invoke('lakehouse:select-files'),
  importMultipleFiles: (filePaths: string[]) =>
    ipcRenderer.invoke('lakehouse:import-files', filePaths),
  createJoinView: (plan: any) =>
    ipcRenderer.invoke('lakehouse:create-join-view', plan),
  getTableRows: (tableName: string, limit?: number, offset?: number, search?: string) =>
    ipcRenderer.invoke('editor:get-table-rows', tableName, limit, offset, search),
  updateCell: (tableName: string, rowid: number, column: string, value: any) =>
    ipcRenderer.invoke('editor:update-cell', tableName, rowid, column, value),
  deleteRow: (tableName: string, rowid: number) =>
    ipcRenderer.invoke('editor:delete-row', tableName, rowid),
  cleanData: (tableName: string, action: string) =>
    ipcRenderer.invoke('editor:clean-data', tableName, action),
  exportCleanedCsv: (tableName: string, defaultName?: string) =>
    ipcRenderer.invoke('editor:export-csv', tableName, defaultName),
  saveProject: (activeTable: string, fileName: string | null) =>
    ipcRenderer.invoke('persistence:save-project', activeTable, fileName),
  openProject: () =>
    ipcRenderer.invoke('persistence:open-project'),
  undo: (tableName: string) =>
    ipcRenderer.invoke('editor:undo', tableName),
  getUndoStatus: (tableName: string) =>
    ipcRenderer.invoke('editor:undo-status', tableName),
  detectOutliers: (tableName: string) =>
    ipcRenderer.invoke('editor:detect-outliers', tableName),
});

