import { getTranslations } from "next-intl/server";
import MemberForm from "@/components/admin/MemberForm";

export default async function NewMemberPage() {
  const t = await getTranslations("members");
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">{t("addMember")}</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <MemberForm />
      </div>
    </div>
  );
}
