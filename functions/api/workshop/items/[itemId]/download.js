import { handlePublicWorkshopDownload } from '../../../../_shared/workshop/publicHandlers.js';
import { createWorkshopRequestId, workshopErrorResponse } from '../../../../_shared/workshop/responses.js';

export const onRequestGet = handlePublicWorkshopDownload;

export function onRequest() {
  return workshopErrorResponse(createWorkshopRequestId(), 'method_not_allowed', '该接口只接受 GET 请求。', 405, {
    allow: 'GET'
  });
}
