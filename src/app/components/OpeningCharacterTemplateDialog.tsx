import { useEffect, useState } from 'react';
import {
  OPENING_CHARACTER_TEMPLATE_LIMIT,
  type OpeningCharacterTemplate
} from '../../domain/opening/openingCharacterTemplateStore';

export type OpeningCharacterTemplateDialogMode = 'save' | 'load';

interface OpeningCharacterTemplateDialogProps {
  mode: OpeningCharacterTemplateDialogMode;
  templates: OpeningCharacterTemplate[];
  activeTemplateId?: string;
  templateName: string;
  status?: string;
  onTemplateNameChange: (value: string) => void;
  onSaveCopy: () => void;
  onUpdate: () => void;
  onLoad: (template: OpeningCharacterTemplate) => void;
  onDelete: (templateId: string) => void;
  onClose: () => void;
}

const identityLabels: Record<
  OpeningCharacterTemplate['profile']['currentIdentity'],
  string
> = {
  police: '警务人员',
  civilian: '普通市民',
  gang_member: '社团分子'
};

function playerSummary(template: OpeningCharacterTemplate): string {
  const { profile } = template;
  const name = profile.playerName || '姓名待生成';
  const englishName = profile.englishName
    ? ` · ${profile.englishName}`
    : '';
  return `${name}${englishName} · ${
    profile.gender === 'female' ? '女' : '男'
  } · ${profile.age}岁`;
}

export function OpeningCharacterTemplateDialog({
  mode,
  templates,
  activeTemplateId,
  templateName,
  status,
  onTemplateNameChange,
  onSaveCopy,
  onUpdate,
  onLoad,
  onDelete,
  onClose
}: OpeningCharacterTemplateDialogProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string>();
  const isSaveMode = mode === 'save';
  const canUpdate = Boolean(
    activeTemplateId &&
      templates.some((template) => template.id === activeTemplateId)
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="opening-template-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`opening-template-dialog opening-template-dialog--${mode}`}
        role="dialog"
        aria-modal="true"
        aria-label={isSaveMode ? '保存开局人物' : '读取开局人物'}
      >
        <header className="opening-template-dialog__header">
          <div>
            <p>
              {isSaveMode ? 'CHARACTER ARCHIVE' : 'CHARACTER LIBRARY'}
            </p>
            <h2>{isSaveMode ? '保存开局人物' : '读取开局人物'}</h2>
            <span>
              只保存人物档案；世界、剧本、戏剧化开局和剧情要求不会被覆盖。
            </span>
          </div>
          <button
            type="button"
            aria-label="关闭人物模板"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {isSaveMode ? (
          <div className="opening-template-dialog__save">
            <label>
              <span>人物模板名称</span>
              <input
                autoFocus
                maxLength={80}
                value={templateName}
                placeholder="例如：港岛女警、旺角街坊"
                onChange={(event) =>
                  onTemplateNameChange(event.target.value)
                }
              />
            </label>
            <div>
              {canUpdate ? (
                <button type="button" onClick={onUpdate}>
                  更新当前模板
                </button>
              ) : null}
              <button
                type="button"
                disabled={!templateName.trim()}
                onClick={onSaveCopy}
              >
                另存为新模板
              </button>
            </div>
          </div>
        ) : null}

        <div className="opening-template-dialog__body">
          <div className="opening-template-dialog__list-header">
            <strong>
              {isSaveMode ? '已有的人物模板' : '选择要读取的人物'}
            </strong>
            <span>
              {templates.length} / {OPENING_CHARACTER_TEMPLATE_LIMIT}
            </span>
          </div>
          <div className="opening-template-list">
            {templates.length === 0 ? (
              <div className="opening-template-empty">
                <strong>还没有人物模板</strong>
                <span>
                  填写人物档案后点击左侧“保存人物”，以后可以直接读取并继续修改。
                </span>
              </div>
            ) : (
              templates.map((template) => {
                const isActive = template.id === activeTemplateId;
                const isConfirmingDelete =
                  template.id === pendingDeleteId;
                return (
                  <article
                    key={template.id}
                    className={isActive ? 'active' : undefined}
                  >
                    <button
                      type="button"
                      className="opening-template-list__main"
                      aria-label={`读取人物模板 ${template.label}`}
                      onClick={() => onLoad(template)}
                    >
                      <span>
                        <strong>{template.label}</strong>
                        <em>
                          {identityLabels[template.profile.currentIdentity]}
                        </em>
                      </span>
                      <span>{playerSummary(template)}</span>
                      <small>
                        {template.profile.originBackground?.name ??
                          '出身待定'}
                        {template.profile.traitIds.length > 0
                          ? ` · ${template.profile.traitIds.length} 项特质`
                          : ' · 未选特质'}
                      </small>
                    </button>
                    <div className="opening-template-list__actions">
                      {isConfirmingDelete ? (
                        <>
                          <button
                            type="button"
                            className="danger"
                            aria-label={`确认删除人物模板 ${template.label}`}
                            onClick={() => {
                              onDelete(template.id);
                              setPendingDeleteId(undefined);
                            }}
                          >
                            确认删除
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(undefined)}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          aria-label={`删除人物模板 ${template.label}`}
                          onClick={() => setPendingDeleteId(template.id)}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        {status ? (
          <p className="opening-template-dialog__status" role="status">
            {status}
          </p>
        ) : null}
      </section>
    </div>
  );
}
