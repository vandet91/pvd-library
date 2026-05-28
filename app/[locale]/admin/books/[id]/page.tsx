import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import BookForm from "@/components/admin/BookForm";

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("books");

  let book;
  try {
    book = await prisma.book.findUnique({
      where:   { id },
      include: {
        category:  true,
        author:    true,
        coAuthors: true,
        publisher: true,
        ebooks:    { select: { id: true, title: true, ebookType: true, fileUrl: true } },
      },
    });
  } catch (err) {
    console.error("[EditBookPage] Prisma error for id:", id, err);
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-gray-900">{t("editBook")}</h1>
        <div className="bg-red-50 text-red-700 px-5 py-4 rounded-xl border border-red-200 text-sm">
          <strong>Database error</strong> — could not load book <code className="font-mono">{id}</code>.<br />
          Check the server console for details.
        </div>
      </div>
    );
  }

  if (!book) notFound();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">{t("editBook")}</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <BookForm initial={{
          id:          book.id,
          title:       book.title,
          titleKm:     book.titleKm     ?? undefined,
          subtitle:    book.subtitle    ?? undefined,
          edition:     book.edition     ?? undefined,
          isbn:        book.isbn        ?? undefined,
          barcode:     book.barcode,
          description: book.description ?? undefined,
          coverImage:  book.coverImage  ?? undefined,
          publishYear: book.publishYear ?? undefined,
          pages:       book.pages       ?? undefined,
          language:    book.language    ?? undefined,
          locationId:   book.locationId  ?? undefined,
          branchId:     book.branchId    ?? undefined,
          totalCopies:  book.totalCopies,
          price:        book.price ?? undefined,
          referenceOnly: book.referenceOnly,
          materialType: book.materialType ?? undefined,
          categoryId:   book.categoryId  ?? undefined,
          authorId:    book.authorId    ?? undefined,
          coAuthorIds:  book.coAuthors.map((a) => a.id),
          publisherId: book.publisherId ?? undefined,
          ebooks:      book.ebooks,
        }} />
      </div>
    </div>
  );
}
