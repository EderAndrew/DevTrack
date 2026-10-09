import { activityHref } from "@/features/student-activities/schemas/student-activity";

/** The focus page of a CONTROLLED attempt (015 research F14), under the activity's URL. */
export const controlledAnswerHref = (activityId: string) => `${activityHref(activityId)}/responder`;

export { activityHref };
