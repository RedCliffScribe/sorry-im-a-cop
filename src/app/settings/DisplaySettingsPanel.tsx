import type { AiSettings, DisplayFontFamilyId, UiThemeId } from '../../domain/settings/types';
import { displayFontOptions, getDisplayFontOption } from '../displayFonts';

const minFontSize = 12;
const maxFontSize = 28;

function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return 16;
  return Math.max(minFontSize, Math.min(maxFontSize, Math.trunc(value)));
}

export function DisplaySettingsPanel({
  settings,
  onChange
}: {
  settings: AiSettings;
  onChange: (settings: AiSettings) => void;
}) {
  function updateUiTheme(value: UiThemeId) {
    onChange({
      ...settings,
      display: {
        ...settings.display,
        uiTheme: value
      }
    });
  }

  function updateInterfaceFontFamily(value: DisplayFontFamilyId) {
    onChange({
      ...settings,
      display: {
        ...settings.display,
        interfaceFontFamily: value
      }
    });
  }

  function updateNarrationFontFamily(value: DisplayFontFamilyId) {
    onChange({
      ...settings,
      display: {
        ...settings.display,
        narrationFontFamily: value
      }
    });
  }

  function updateDialogueFontFamily(value: DisplayFontFamilyId) {
    onChange({
      ...settings,
      display: {
        ...settings.display,
        dialogueFontFamily: value
      }
    });
  }

  function updateNarrationFontSize(value: string) {
    onChange({
      ...settings,
      display: {
        ...settings.display,
        narrationFontSize: clampFontSize(Number(value))
      }
    });
  }

  function updateDialogueFontSize(value: string) {
    onChange({
      ...settings,
      display: {
        ...settings.display,
        dialogueFontSize: clampFontSize(Number(value))
      }
    });
  }

  return (
    <section className="settings-panel">
      <div className="settings-topline">
        <div>
          <h2>显示设置</h2>
          <p className="muted">调整界面与剧情正文的阅读样式，不改变存档文本。</p>
        </div>
      </div>

      <section className="settings-section" aria-label="界面显示">
        <h3>界面显示</h3>
        <div className="compact-form-grid">
          <label>
            界面主题
            <select
              aria-label="界面主题"
              value={settings.display.uiTheme}
              onChange={(event) => updateUiTheme(event.target.value as UiThemeId)}
            >
              <option value="dark">深色 · 夜港档案</option>
              <option value="light">明快 · 日间档案</option>
            </select>
          </label>
          <p className="muted">
            {settings.display.uiTheme === 'light'
              ? '米白纸张、浅蓝灰框架与深色文字，适合明亮环境和长时间阅读。'
              : '深夜蓝黑、黄铜线条与浅色文字，保留当前夜港氛围。'}
          </p>
          <label>
            界面字体
            <select
              aria-label="界面字体"
              value={settings.display.interfaceFontFamily}
              onChange={(event) => updateInterfaceFontFamily(event.target.value as DisplayFontFamilyId)}
            >
              {displayFontOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted span-2">{getDisplayFontOption(settings.display.interfaceFontFamily).description}</p>
          <p className="muted span-2">影响设置、开局、游戏主界面和功能面板；大标题、报纸与特殊印章仍保留时代字体。</p>
        </div>
      </section>

      <section className="settings-section" aria-label="正文显示">
        <h3>正文显示</h3>
        <div className="compact-form-grid">
          <label>
            旁白字体
            <select
              aria-label="旁白字体"
              value={settings.display.narrationFontFamily}
              onChange={(event) => updateNarrationFontFamily(event.target.value as DisplayFontFamilyId)}
            >
              {displayFontOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            旁白字号
            <input
              aria-label="旁白字号"
              type="number"
              min={minFontSize}
              max={maxFontSize}
              value={settings.display.narrationFontSize}
              onChange={(event) => updateNarrationFontSize(event.target.value)}
            />
          </label>
          <label>
            对白字体
            <select
              aria-label="对白字体"
              value={settings.display.dialogueFontFamily}
              onChange={(event) => updateDialogueFontFamily(event.target.value as DisplayFontFamilyId)}
            >
              {displayFontOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            对白字号
            <input
              aria-label="对白字号"
              type="number"
              min={minFontSize}
              max={maxFontSize}
              value={settings.display.dialogueFontSize}
              onChange={(event) => updateDialogueFontSize(event.target.value)}
            />
          </label>
          <p className="muted span-2">
            旁白：{getDisplayFontOption(settings.display.narrationFontFamily).description}
            {' · '}对白：{getDisplayFontOption(settings.display.dialogueFontFamily).description}
          </p>
          <p className="muted span-2">
            旁白包括【旁白】和未标注叙述段；对白只影响角色对白气泡里的正文，不改变回合标题、指标和按钮。
          </p>
        </div>
      </section>
    </section>
  );
}
