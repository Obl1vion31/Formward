import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { window } from '@kit.ArkUI';
import { ORIGIN, IS_FIXTURE, PRIVACY_VERSION, HostBridge, HostEvent, isTrustedPage, isExternalLink } from '../host/HostPolicy';
import { ExportDownloads } from '../host/ExportDownloads';

@Entry
@Component
struct Index {
  @StorageLink('nativeDark') dark: boolean = false;
  @StorageLink('nativeForeground') @Watch('syncForeground') isForeground: boolean = true;
  @State ready: boolean = false;
  @State consent: boolean = false;
  @State savingConsent: boolean = false;
  @State failed: boolean = false;
  @State loading: boolean = true;
  @State slow: boolean = false;
  @State opened: boolean = false;
  @State localPage: string = '';
  @State localStatus: string = '';
  @State notice: string = '';
  private controller: webview.WebviewController = new webview.WebviewController();
  private localController: webview.WebviewController = new webview.WebviewController();
  private bridge: HostBridge = new HostBridge((event: HostEvent) => this.receive(event));
  private downloads: ExportDownloads | undefined;
  private exporting: boolean = false;
  private backId: string = '';
  private backTimer: number = -1;
  private sequence: number = 0;
  private noticeTimer: number = -1;
  private loadingTimer: number = -1;
  private localTimer: number = -1;
  private attached: boolean = false;
  private exitPrompt: boolean = false;

  aboutToAppear(): void {
    try {
      const store = preferences.getPreferencesSync(this.context(), { name: 'formward-privacy' });
      this.consent = store.getSync('version', '') === PRIVACY_VERSION;
    } catch (_) {
      this.notice = '暂时无法读取隐私选择，请重新确认后继续。';
    }
    this.downloads = new ExportDownloads(this.context(), (value: string) => this.tell(value),
      (value: boolean) => { this.exporting = value; });
    this.ready = true;
  }
  aboutToDisappear(): void {
    clearTimeout(this.backTimer);
    clearTimeout(this.noticeTimer);
    clearTimeout(this.loadingTimer);
    clearTimeout(this.localTimer);
  }
  private syncForeground(): void {
    if (!this.attached) return;
    try {
      if (this.isForeground) this.controller.onActive();
      else this.controller.onInactive();
    } catch (_) {}
  }
  private context(): common.UIAbilityContext {
    return this.getUIContext().getHostContext() as common.UIAbilityContext;
  }
  private surfaceColor(): ResourceColor { return this.dark ? '#22231f' : '#f3f0e9'; }
  private foreground(): ResourceColor { return this.dark ? '#f3ede3' : '#292a25'; }
  private muted(): ResourceColor { return this.dark ? '#c8c0b1' : '#59574e'; }
  private tell(message: string): void {
    this.notice = message;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { this.notice = ''; }, 6500);
  }
  private async accept(): Promise<void> {
    if (this.savingConsent) return;
    this.savingConsent = true;
    try {
      const store = preferences.getPreferencesSync(this.context(), { name: 'formward-privacy' });
      store.putSync('version', PRIVACY_VERSION);
      await store.flush();
      this.consent = true;
      this.failed = false;
    } catch (_) {
      this.tell('隐私选择未能保存，请重试。');
    } finally {
      this.savingConsent = false;
    }
  }
  private async external(value: string): Promise<void> {
    if (!isExternalLink(value)) return;
    try {
      await this.context().openLink(value, { appLinkingOnly: false });
    } catch (_) {
      this.tell('暂时无法打开链接，请稍后重试。');
    }
  }
  private receive(event: HostEvent): void {
    try { if (!isTrustedPage(this.controller.getUrl())) return; } catch (_) { return; }
    if (event.type === 'appearance' && (event.theme === 'dark' || event.theme === 'light')) {
      AppStorage.setOrCreate('nativeWebAppearance', true);
      this.dark = event.theme === 'dark';
      void window.getLastWindow(this.context()).then((main: window.Window) => {
        try { void main.setWindowSystemBarProperties({
          statusBarColor: this.dark ? '#22231f' : '#f3f0e9',
          navigationBarColor: this.dark ? '#22231f' : '#f3f0e9',
          isStatusBarLightIcon: this.dark,
          isNavigationBarLightIcon: this.dark
        }).catch(() => {}); } catch (_) {}
      }).catch(() => {});
    } else if (event.type === 'ready') {
      this.opened = true;
      this.loading = false;
      this.slow = false;
      clearTimeout(this.loadingTimer);
    } else if (event.type === 'back-pending' && event.id === this.backId) {
      clearTimeout(this.backTimer);
    } else if (event.type === 'back-result' && event.id === this.backId &&
      typeof event.handled === 'boolean') {
      clearTimeout(this.backTimer);
      this.backId = '';
      if (!event.handled) {
        try {
          if (this.controller.accessBackward()) this.controller.backward();
          else this.confirmExit();
        } catch (_) { this.tell('请使用页面内的返回按钮。'); }
      }
    }
  }
  onBackPress(): boolean {
    if (this.localPage) { this.localPage = ''; return true; }
    if (this.exporting) { this.tell('文件正在保存，完成或取消后再退出。'); return true; }
    if (!this.consent || this.failed || this.loading) { this.confirmExit(); return true; }
    if (this.backId !== '') return true;
    this.sequence++;
    if (!this.backId) this.backId = Date.now().toString() + '-' + this.sequence.toString();
    const id = this.backId;
    clearTimeout(this.backTimer);
    this.backTimer = setTimeout(() => {
      if (this.backId !== id) return;
      this.backId = '';
      this.tell('请使用页面内的返回按钮，未保存的输入会继续保留。');
    }, 1600);
    void this.controller.runJavaScript(
      'window.dispatchEvent(new CustomEvent("formward-native-back",{detail:{id:' +
      JSON.stringify(id) + '}}))'
    ).catch(() => {
      clearTimeout(this.backTimer);
      this.backId = '';
      this.tell('请使用页面内的返回按钮。');
    });
    return true;
  }
  private confirmExit(): void {
    if (this.exitPrompt) return;
    this.exitPrompt = true;
    this.getUIContext().showAlertDialog({
      title: '退出 Formward？',
      message: '请确认填写已保存。已保存记录仍在你的账号中。',
      autoCancel: false,
      primaryButton: { value: '继续使用', action: () => { this.exitPrompt = false; } },
      secondaryButton: { value: '退出应用', action: () => {
        this.exitPrompt = false;
        void this.context().terminateSelf().catch(() => this.tell('暂时无法退出，请稍后重试。'));
      } }
    });
  }
  private retry(): void {
    this.failed = false;
    this.beginLoading();
    try { this.controller.refresh(); } catch (_) { this.failed = true; this.loading = false; }
  }
  private beginLoading(): void {
    this.loading = true;
    this.slow = false;
    clearTimeout(this.loadingTimer);
    this.loadingTimer = setTimeout(() => { this.slow = this.loading; }, 350);
  }
  private endLoading(): void {
    this.loading = false;
    this.slow = false;
    this.opened = true;
    clearTimeout(this.loadingTimer);
  }
  private loadFailed(): void {
    this.failed = true;
    this.loading = false;
    this.slow = false;
    clearTimeout(this.loadingTimer);
  }
  @Builder
  private brand() {
    Row({ space: 10 }) {
      Image(this.dark ? $r('app.media.formward_mark') : $r('app.media.formward_mark_light')).width(30).height(30)
        .accessibilityText('Formward');
      Text() {
        Span('formward').fontColor(this.foreground());
        Span('.').fontColor('#bfa574');
      }.fontSize(28).fontWeight(FontWeight.Bold);
    }.width('100%').height(48).alignItems(VerticalAlign.Center)
  }
  @Builder
  private button(label: string, primary: boolean, action: () => void) {
    Button(label, { type: ButtonType.Normal })
      .width('100%').height(52).fontSize(16).fontWeight(FontWeight.Medium)
      .fontColor(primary ? '#292719' : this.foreground())
      .backgroundColor(primary ? '#bfa574' : Color.Transparent)
      .border({ width: primary ? 0 : 1, color: this.dark ? '#b4a88e' : '#867b67', radius: 14 })
      .stateEffect(true).onClick(action)
  }
  @Builder
  private startup() {
    Column({ space: 0 }) {
      Scroll() {
        Column({ space: 0 }) {
          this.brand();
          Text(this.failed ? '暂时无法打开 Formward' : '开始使用 Formward')
            .fontSize(26).fontWeight(FontWeight.Bold).fontColor(this.foreground())
            .width('100%').margin({ top: 36, bottom: 24 });
          if (this.failed) {
            Text('检查网络连接后重试，已保存记录不受影响。')
              .fontSize(16).lineHeight(25).fontColor(this.muted()).width('100%');
          } else {
            Column({ space: 16 }) {
              Text('你的记录由本人账号管理。').fontSize(16).fontColor(this.foreground());
              Text('登录后，饮食、训练与身体记录保存到上海服务器。').fontSize(16).lineHeight(25).fontColor(this.foreground());
              Text('拍照、选图和保存文件仅在你主动操作时使用。').fontSize(16).lineHeight(25).fontColor(this.foreground());
              Text('AI 处理及境外服务请阅读隐私政策。').fontSize(16).lineHeight(25).fontColor(this.foreground());
            }.alignItems(HorizontalAlign.Start).width('100%');
            Row({ space: 12 }) {
              Button('隐私政策').fontSize(16).height(48).fontColor(this.dark ? '#bfa574' : '#765b2e')
                .backgroundColor(Color.Transparent).stateEffect(false)
                .onClick(() => { this.localPage = 'privacy'; });
              Button('服务条款').fontSize(16).height(48).fontColor(this.dark ? '#bfa574' : '#765b2e')
                .backgroundColor(Color.Transparent).stateEffect(false)
                .onClick(() => { this.localPage = 'terms'; });
            }.margin({ top: 16 }).width('100%');
          }
        }.width('100%').alignItems(HorizontalAlign.Start);
      }.layoutWeight(1).width('100%').align(Alignment.TopStart).scrollBar(BarState.Auto);
      Column({ space: 12 }) {
        if (this.failed) {
          this.button('重新连接', true, () => this.retry());
          this.button('应用信息', false, () => { this.localPage = 'about'; });
        } else {
          this.button(this.savingConsent ? '正在保存选择…' : '同意并继续', true, () => { void this.accept(); });
          this.button('暂不使用', false, () => this.confirmExit());
        }
      }.width('100%').padding({ top: 20, bottom: 16 });
    }.padding({ left: 24, right: 24, top: 20 }).width('100%').height('100%')
      .backgroundColor(this.surfaceColor());
  }
  @Builder
  private information() {
    Column({ space: 16 }) {
      Row() {
        Button('返回').height(48).fontSize(16).fontColor(this.foreground())
          .backgroundColor(Color.Transparent).onClick(() => { this.localPage = ''; });
        Text(this.localPage === 'privacy' ? '隐私政策' : this.localPage === 'terms' ? '服务条款' : '应用信息')
          .fontSize(20).fontWeight(FontWeight.Medium).fontColor(this.foreground()).layoutWeight(1);
      }.width('100%');
      if (this.localPage === 'privacy' || this.localPage === 'terms') {
        Text(this.localStatus).height(22).width('100%').fontSize(14).fontColor(this.muted());
        Web({ src: this.localPage === 'privacy' ? $rawfile('privacy.html') : $rawfile('terms.html'),
          controller: this.localController })
          .javaScriptAccess(false).fileAccess(true).layoutWeight(1).width('100%')
          .onPageBegin(() => {
            this.localStatus = '';
            clearTimeout(this.localTimer);
            this.localTimer = setTimeout(() => { this.localStatus = '正在打开…'; }, 350);
          })
          .onPageEnd(() => { clearTimeout(this.localTimer); this.localStatus = ''; })
          .onErrorReceive((event: OnErrorReceiveEvent) => {
            if (event.request.isMainFrame()) {
              clearTimeout(this.localTimer);
              this.localStatus = '协议未能打开，请返回后重试。';
            }
          })
          .onLoadIntercept((event: OnLoadInterceptEvent) => {
            const target = event.data.getRequestUrl();
            if (/^https?:/i.test(target)) { void this.external(target); return true; }
            return false;
          });
      } else {
        this.brand();
        Text('版本 1.0.0').fontSize(16).fontColor(this.foreground()).width('100%');
        Text('记录饮食、训练、身体与能量变化。受邀账号登录后可使用已有记录。')
          .fontSize(16).fontColor(this.foreground()).width('100%');
        this.button('隐私政策', false, () => { this.localPage = 'privacy'; });
        this.button('服务条款', false, () => { this.localPage = 'terms'; });
        Text('联系邮箱：opg.obl1v@gmail.com').fontSize(16).fontColor(this.muted()).width('100%');
        Blank();
      }
    }.padding({ left: 20, right: 20, bottom: 16 }).width('100%').height('100%')
      .backgroundColor(this.surfaceColor());
  }
  build() {
    Column({ space: 0 }) {
      if (IS_FIXTURE) {
        Text('隔离测试 · 虚构数据').height(26).width('100%').fontSize(13)
          .fontColor('#ffffff').backgroundColor('#305a6a');
      }
    Stack({ alignContent: Alignment.Top }) {
      if (this.ready && this.consent) {
        Web({ src: ORIGIN + '/dashboard', controller: this.controller })
          .width('100%').height('100%').backgroundColor(this.surfaceColor())
          .javaScriptAccess(true).domStorageAccess(true).fileAccess(false)
          .mixedMode(MixedMode.None).multiWindowAccess(false)
          .javaScriptProxy({ object: this.bridge, name: 'FormwardNative', methodList: ['postEvent'],
            controller: this.controller })
          .onControllerAttached(() => {
            this.attached = true;
            this.downloads?.attach(this.controller);
            this.syncForeground();
          })
          // System ArkWeb picker provides photo selection and CameraPicker; avoid two pickers for one gesture.
          .onShowFileSelector(() => false)
          .onPermissionRequest((event: OnPermissionRequestEvent) => { event.request.deny(); })
          .onLoadIntercept((event: OnLoadInterceptEvent) => {
            if (!event.data.isMainFrame()) return false;
            const target = event.data.getRequestUrl();
            if (isTrustedPage(target)) return false;
            if (isExternalLink(target)) void this.external(target);
            return true;
          })
          .onPageBegin(() => this.beginLoading())
          .onPageEnd(() => this.endLoading())
          .onErrorReceive((event: OnErrorReceiveEvent) => {
            if (event.request.isMainFrame()) this.loadFailed();
          })
          .onHttpErrorReceive((event: OnHttpErrorReceiveEvent) => {
            if (event.request.isMainFrame() && event.response.getResponseCode() >= 500) this.loadFailed();
          })
          .onRenderExited(() => this.loadFailed())
          .onBeforeUnload((event: OnBeforeUnloadEvent) => {
            this.getUIContext().showAlertDialog({
              title: '放弃尚未保存的输入？',
              message: '继续离开会放弃未保存的输入，已保存记录保持。',
              autoCancel: false,
              primaryButton: { value: '继续编辑', action: () => event.result.handleCancel() },
              secondaryButton: { value: '放弃修改', action: () => event.result.handleConfirm() }
            });
            return true;
          });
      }
      if (this.ready && this.consent && !this.opened && !this.failed) {
        Column({ space: 24 }) {
          this.brand();
          if (this.slow) Text('正在连接…').fontSize(16).fontColor(this.muted()).width('100%');
        }.padding(24).height('100%').width('100%').backgroundColor(this.surfaceColor());
      }
      if (this.ready && (!this.consent || this.failed)) this.startup();
      if (this.localPage !== '') this.information();
      if (this.notice !== '') {
        Text(this.notice).fontSize(14).fontColor(this.foreground()).padding(16)
          .backgroundColor(this.surfaceColor()).borderRadius(12)
          .align(Alignment.Bottom).margin({ bottom: 12, left: 16, right: 16 }).accessibilityLevel('yes');
      }
    }.width('100%').layoutWeight(1).backgroundColor(this.surfaceColor());
    }.width('100%').height('100%').backgroundColor(this.surfaceColor())
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM]);
  }
}
