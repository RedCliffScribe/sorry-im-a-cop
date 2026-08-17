import { handlePublicWorkshopList } from '../../../_shared/workshop/publicHandlers.js';
import { handleCreateWorkshopItem } from '../../../_shared/workshop/ownerHandlers.js';
import { createWorkshopRequestId, workshopErrorResponse } from '../../../_shared/workshop/responses.js';

export const onRequestGet = handlePublicWorkshopList;
export const onRequestPost = handleCreateWorkshopItem;

export function onRequest() {
  return workshopErrorResponse(createWorkshopRequestId(), 'method_not_allowed', '该接口不接受此请求方法。', 405, {
    allow: 'GET, POST'
  });
}
