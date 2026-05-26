import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EbookForm from "@/components/admin/EbookForm";

export default async function EditEbookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("ebooks");

  const ebook = await prisma.ebook.findUnique({ where: { id } });
  if (!ebook) notFound();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">{t("editEbook")}</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <EbookForm initial={{
          id:          ebook.id,
          title:       ebook.title,
          titleKm:     ebook.titleKm     ?? undefined,
          description: ebook.description ?? undefined,
          ebookType:   ebook.ebookType,
          fileUrl:     ebook.fileUrl,
          coverImage:  ebook.coverImage  ?? undefined,
          language:    ebook.language    ?? undefined,
          publishYear: ebook.publishYear ?? undefined,
          categoryId:  ebook.categoryId  ?? undefined,
          authorId:    ebook.authorId    ?? undefined,
          isPublic:    ebook.isPublic,
          bookId:      ebook.bookId      ?? undefined,
        }} />
      </div>
    </div>
  );
}
