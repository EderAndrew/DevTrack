import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { MyFeedbacks } from "@/features/feedback/components/my-feedbacks";
import { MY_FEEDBACKS_TITLE } from "@/features/feedback/schemas/feedback-form";
import { MY_FEEDBACKS_PATH } from "@/lib/navigation";

export const metadata: Metadata = { title: MY_FEEDBACKS_TITLE };

/** "Meus feedbacks" (020 US3): the feedbacks the student sent and the status of each. */
export default async function MyFeedbacksPage() {
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(MY_FEEDBACKS_PATH)}`);
  if (!me.permissions.includes("feedbacks.proprios.listar")) return <NoAccess title={MY_FEEDBACKS_TITLE} />;
  return (
    <section>
      <PageHeader title={MY_FEEDBACKS_TITLE} />
      <MyFeedbacks />
    </section>
  );
}
