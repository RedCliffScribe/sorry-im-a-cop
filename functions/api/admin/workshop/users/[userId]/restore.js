import { handleRestoreWorkshopAdminUser } from '../../../../../_shared/workshop/adminHandlers.js';
import { createWorkshopRequestId, workshopErrorResponse } from '../../../../../_shared/workshop/responses.js';

export const onRequestPost = handleRestoreWorkshopAdminUser;

export function onRequest() {
  return workshopErrorResponse(createWorkshopRequestId(), 'method_not_allowed', '该接口不接受此请求方法。', 405, {
    allow: 'POST'
  });
}
