/**
 * Single source of truth for IPC channel names, imported by preload, main and
 * (indirectly) renderer. Request/response channels pair with ipcMain.handle /
 * ipcRenderer.invoke; `taskEvent` is a main → renderer push (webContents.send).
 */
export const IPC = {
  // request / response
  projectGet: "aurelius:project:get",
  projectSelect: "aurelius:project:select",
  dialogDirectory: "aurelius:dialog:directory",
  dialogFile: "aurelius:dialog:file",
  prereqRun: "aurelius:prereq:run",
  prereqResult: "aurelius:prereq:result",
  initRun: "aurelius:init:run",
  initResult: "aurelius:init:result",
  stepRun: "aurelius:step:run",
  pipelineRun: "aurelius:pipeline:run",
  pipelineResult: "aurelius:pipeline:result",
  qaArtifacts: "aurelius:qa:artifacts",
  qaImage: "aurelius:qa:image",
  qaText: "aurelius:qa:text",
  openExternal: "aurelius:shell:open-external",
  openPath: "aurelius:shell:open-path",
  taskSnapshot: "aurelius:task:snapshot",
  taskCancel: "aurelius:task:cancel",
  // main → renderer push
  taskEvent: "aurelius:task:event",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
