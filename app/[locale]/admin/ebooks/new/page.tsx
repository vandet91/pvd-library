import { getTranslations } from "next-intl/server";
import EbookForm from "@/components/admin/EbookForm";

export default async function NewEbookPage({
  searchParams,
}: {
  searchParams: Promise<{ bookId?: string }>;
}) {
  const t = await getTranslations("ebooks");
  const { bookId } = await searchParams;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">{t("addEbook")}</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <EbookForm prefilledBookId={bookId} />
      </div>
    </div>
  );
}
