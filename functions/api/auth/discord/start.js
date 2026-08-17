import { handleDiscordLoginStart } from '../../../_shared/workshop/authHandlers.js';
import { createWorkshopRequestId, workshopErrorResponse } from '../../../_shared/workshop/responses.js';

export const onRequestPost = handleDiscordLoginStart;
export function onRequestGet() {
  return workshopErrorResponse(
    createWorkshopRequestId(),
    'method_not_allowed',
    '登录需要先在页面完成人机验证。',
    405,
    { allow: 'POST' }
  );
}
