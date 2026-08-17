import type {
  CustomLocalExtractionResult,
  CustomSourceCarryLedgerEntry
} from './assetTypes';
import { parseCustomSourceCarryLedgerEntry } from './sourceAggregationSchemas';

export function createCustomSourceCarryLedgerEntry(
  result: CustomLocalExtractionResult
): CustomSourceCarryLedgerEntry {
  return parseCustomSourceCarryLedgerEntry({
    carryLedgerEntryId: `source-carry-${result.extractionResultId}`,
    extractionTaskId: result.taskId,
    extractionResultId: result.extractionResultId,
    unitId: result.unitId,
    sourceDocumentId: result.sourceDocumentId,
    sourceStructureId: result.sourceStructureId,
    chunkId: result.chunkId,
    sequence: result.sourceSpan.sequence,
    sourceSpan: result.sourceSpan,
    continuation: result.continuation,
    characterObservationIds: result.characterObservations.map(
      (item) => item.observationId
    ),
    eventObservationIds: result.eventObservations.map(
      (item) => item.observationId
    ),
    unresolvedContradictionObservationIds:
      result.unresolvedContradictions.map((item) => item.observationId),
    createdAt: result.createdAt,
    updatedAt: result.updatedAt
  });
}
