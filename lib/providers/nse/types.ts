import type { NormalizedFiling } from "@/lib/ingestion/schemas";

import type { FeedValidators } from "../news/conditional-feed";
import type { ConditionalRecords } from "../news/types";

export type NSEOfferDocumentsRSSProviderOptions = {
  feedUrl?: string;
  attempts?: number;
  timeoutMs?: number;
  maxItems?: number;
};

export interface NSEOfferDocumentsProvider {
  getOfferDocuments(validators?: FeedValidators): Promise<ConditionalRecords<NormalizedFiling>>;
}
