import { getTranslations } from "next-intl/server";
import BookForm from "@/components/admin/BookForm";

export default async function NewBookPage() {
  const t = await getTranslations("books");
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">{t("addBook")}</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <BookForm />
      </div>
    </div>
  );
}
