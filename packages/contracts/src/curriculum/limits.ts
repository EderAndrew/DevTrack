// Fixed limits of syllabus processing and class planning (004 research E20). The
// configurable ones (file size, intervals, rate limits) live in the API config instead.

/** Pages read from a syllabus PDF; more → FILE_TOO_COMPLEX. */
export const MAX_PDF_PAGES = 50;
/** Sum of the uncompressed sizes of a DOCX's entries (zip bomb guard). */
export const MAX_DOCX_UNZIPPED_BYTES = 50 * 1024 * 1024;
/** Entries in a DOCX's zip container. */
export const MAX_DOCX_ENTRIES = 1000;
/** Width × height of a PNG or JPEG syllabus. */
export const MAX_IMAGE_PIXELS = 40_000_000;
/** Dates in a class's calendar. */
export const MAX_MEETINGS_PER_CLASS = 200;
/** Topics in a class plan, archived ones included. */
export const MAX_TOPICS_PER_PLAN = 300;
/** Learning-object items in one syllabus revision, across all its groups. */
export const MAX_ITEMS_PER_REVISION = 500;
/** Characters of a revision's title. */
export const MAX_REVISION_TITLE_LENGTH = 200;
/** Characters of a revision's syllabus text and of its competency text. */
export const MAX_REVISION_TEXT_LENGTH = 10_000;
/** Characters of a learning-object group's title. */
export const MAX_GROUP_TITLE_LENGTH = 300;
/** Characters of a learning-object item. */
export const MAX_ITEM_TEXT_LENGTH = 1000;
/** Syllabus items linked to one topic. */
export const MAX_ITEMS_PER_TOPIC = 100;
/** Processing attempts of a syllabus document before it becomes FAILED (1 min, then 5 min apart). */
export const MAX_PROCESSING_ATTEMPTS = 3;
