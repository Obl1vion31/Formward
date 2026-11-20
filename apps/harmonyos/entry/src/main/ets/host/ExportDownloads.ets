import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { fileIo as fs, picker } from '@kit.CoreFileKit';
import { isTrustedDownload, safeExportName } from './HostPolicy';

interface ExportJob {
  path: string;
  name: string;
}

/** ArkWeb performs the authenticated request; no cookie or token is copied to a second HTTP client. */
export class ExportDownloads {
  private jobs: Map<string, ExportJob> = new Map();
  private context: common.UIAbilityContext;
  private tell: (message: string) => void;
  private busy: (value: boolean) => void;
  private delegate: webview.WebDownloadDelegate = new webview.WebDownloadDelegate();
  private sequence: number = 0;
  constructor(context: common.UIAbilityContext, tell: (message: string) => void,
    busy: (value: boolean) => void) {
    this.context = context;
    this.tell = tell;
    this.busy = busy;
    this.delegate.onBeforeDownload((item: webview.WebDownloadItem) => {
      const name = safeExportName(item.getSuggestedFileName());
      if (!isTrustedDownload(item.getUrl()) || !name || this.jobs.size >= 2 ||
        item.getMimeType().toLowerCase().includes('text/html')) {
        item.cancel();
        this.tell('暂时无法保存这个文件，请从导出入口重试。');
        return;
      }
      this.sequence++;
      const path = this.context.cacheDir + '/formward-export-' + Date.now().toString() + '-' +
        this.sequence.toString() + '.tmp';
      this.jobs.set(item.getGuid(), { path: path, name: name });
      this.busy(true);
      item.start(path);
    });
    this.delegate.onDownloadUpdated((item: webview.WebDownloadItem) => {
      if (item.getReceivedBytes() > 20 * 1024 * 1024) {
        item.cancel();
        this.finishJob(item.getGuid());
        this.tell('文件超过20 MiB，请缩小导出范围后重试。');
      }
    });
    this.delegate.onDownloadFailed((item: webview.WebDownloadItem) => {
      if (!this.jobs.has(item.getGuid())) return;
      this.finishJob(item.getGuid());
      this.tell('导出未完成，请检查网络或重新登录后重试。');
    });
    this.delegate.onDownloadFinish((item: webview.WebDownloadItem) => {
      void this.save(item.getGuid());
    });
  }
  attach(controller: webview.WebviewController): void {
    try { controller.setDownloadDelegate(this.delegate); }
    catch (_) { this.tell('导出保存暂时不可用，请重新打开应用后重试。'); }
  }
  private async save(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    let source: fs.File | undefined;
    let destination: fs.File | undefined;
    try {
      const view = new picker.DocumentViewPicker(this.context);
      const destinations = await view.save({ newFileNames: [job.name] });
      if (destinations.length === 0) return;
      source = fs.openSync(job.path, fs.OpenMode.READ_ONLY);
      destination = fs.openSync(destinations[0], fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
      fs.copyFileSync(source.fd, destination.fd);
      this.tell('文件已保存。');
    } catch (_) {
      this.tell('文件没有保存，可以从原页面重新导出。');
    } finally {
      try { if (source) fs.closeSync(source); } catch (_) {}
      try { if (destination) fs.closeSync(destination); } catch (_) {}
      this.finishJob(id);
    }
  }
  private finishJob(id: string): void {
    const job = this.jobs.get(id);
    this.jobs.delete(id);
    if (job && job.path.startsWith(this.context.cacheDir + '/formward-export-')) {
      try { fs.unlinkSync(job.path); } catch (_) {}
    }
    this.busy(this.jobs.size > 0);
  }
}
