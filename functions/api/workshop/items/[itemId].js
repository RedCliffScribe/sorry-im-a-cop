import { handlePublicWorkshopDetail } from '../../../_shared/workshop/publicHandlers.js';
import {
  handleDeleteWorkshopItem,
  handleUpdateWorkshopItem
} from '../../../_shared/workshop/ownerHandlers.js';
import { createWorkshopRequestId, workshopErrorResponse } from '../../../_shared/workshop/responses.js';

export const onRequestGet = handlePublicWorkshopDetail;
export const onRequestPatch = handleUpdateWorkshopItem;
export const onRequestDelete = handleDeleteWorkshopItem;

export function onRequest() {
  return workshopErrorResponse(createWorkshopRequestId(), 'method_not_allowed', '该接口不接受此请求方法。', 405, {
    allow: 'GET, PATCH, DELETE'
  });
}
