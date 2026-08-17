import type {
  CustomContentProcessingTask,
  CustomLocalExtractionResult,
  CustomSourceAggregationResult,
  CustomSourceCarryLedgerEntry,
  CustomSourceDocument,
  CustomSourceStructure
} from '../../domain/customContent/assetTypes';
import type { IndexedDbCustomContentRepository } from '../../domain/customContent/IndexedDbCustomContentRepository';
import type { CustomSourceProjectDraftResult } from '../../domain/customContent/sourceProjectBuildSchemas';

export interface LongTextSourceLibraryEntry {
  document: CustomSourceDocument;
  tasks: CustomContentProcessingTask[];
  structure?: CustomSourceStructure;
  extractionResults: CustomLocalExtractionResult[];
  carryLedgerEntries: CustomSourceCarryLedgerEntry[];
  aggregationResults: CustomSourceAggregationResult[];
  projectDraftResults: CustomSourceProjectDraftResult[];
}

function newestFirst(
  left: { updatedAt: string },
  right: { updatedAt: string }
): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

export async function loadLongTextSourceLibrary(
  repository: IndexedDbCustomContentRepository
): Promise<LongTextSourceLibraryEntry[]> {
  const [documents, allTasks] = await Promise.all([
    repository.listSourceDocuments(),
    repository.listProcessingTasks()
  ]);
  const entries = await Promise.all(
    documents.map(async (document): Promise<LongTextSourceLibraryEntry> => {
      const [
        structures,
        extractionResults,
        carryLedgerEntries,
        aggregationResults,
        projectDraftResults
      ] = await Promise.all([
        repository.listSourceStructures(document.sourceDocumentId),
        repository.listExtractionResultsForSource(document.sourceDocumentId),
        repository.listCarryLedgerEntriesForSource(document.sourceDocumentId),
        repository.listAggregationResultsForSource(document.sourceDocumentId),
        repository.listProjectDraftResultsForSource(document.sourceDocumentId)
      ]);
      return {
        document,
        tasks: allTasks
          .filter(
            (task) =>
              task.sourceDocumentId === document.sourceDocumentId &&
              (task.taskKind === 'parse_source' ||
                task.taskKind === 'chunk_source' ||
                task.taskKind === 'extract_local' ||
                task.taskKind === 'aggregate_chapter' ||
                task.taskKind === 'aggregate_stage' ||
                task.taskKind === 'aggregate_arc' ||
                task.taskKind === 'build_project')
          )
          .sort(newestFirst),
        structure: structures.sort(newestFirst)[0],
        extractionResults,
        carryLedgerEntries,
        aggregationResults,
        projectDraftResults
      };
    })
  );
  return entries.sort((left, right) =>
    newestFirst(left.document, right.document)
  );
}
