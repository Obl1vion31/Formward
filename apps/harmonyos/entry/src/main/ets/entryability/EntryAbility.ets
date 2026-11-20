import { Configuration, ConfigurationConstant, UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onCreate(): void {
    AppStorage.setOrCreate('nativeWebAppearance', false);
    AppStorage.setOrCreate('nativeDark',
      this.context.config.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK);
    AppStorage.setOrCreate('nativeForeground', true);
  }
  onConfigurationUpdate(configuration: Configuration): void {
    if (AppStorage.get<boolean>('nativeWebAppearance')) return;
    AppStorage.setOrCreate('nativeDark',
      configuration.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK);
  }
  onWindowStageCreate(stage: window.WindowStage): void {
    try {
      const main = stage.getMainWindowSync();
      void main.setWindowLayoutFullScreen(false).catch(() => {});
      stage.loadContent('pages/Index');
    } catch (_) {}
  }
  onForeground(): void { AppStorage.setOrCreate('nativeForeground', true); }
  onBackground(): void { AppStorage.setOrCreate('nativeForeground', false); }
}
