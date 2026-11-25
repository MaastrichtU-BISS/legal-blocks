import type { AnnotationPage, PageRequest, RichAnnotation } from "vue-iaa-metrics";

// The task's annotation list still arrives whole from the server, so paging
// happens here until the endpoint learns offset and limit.
export function pageOf(all: RichAnnotation[], page: PageRequest): AnnotationPage {
  return {
    annotations: all.slice(page.offset, page.offset + page.limit),
    total: all.length,
  };
}
