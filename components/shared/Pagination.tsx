"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page:    number;
  pages:   number;
  total?:  number;
  limit?:  number;
  onPage:  (p: number) => void;
}

export default function Pagination({ page, pages, total, limit, onPage }: PaginationProps) {
  if (pages <= 1) return null;

  // Build the window of page numbers to show (always 5 buttons)
  const windowSize = 5;
  const start = Math.max(1, Math.min(page - Math.floor(windowSize / 2), pages - windowSize + 1));
  const pageNumbers = Array.from({ length: Math.min(windowSize, pages) }, (_, i) => start + i);

  const btn = (content: React.ReactNode, targetPage: number, disabled: boolean, active = false, k?: React.Key) => (
    <button
      key={k}
      onClick={() => !disabled && onPage(targetPage)}
      disabled={disabled}
      className={`
        min-w-[36px] h-9 px-2 rounded-lg border text-sm font-medium
        flex items-center justify-center transition-all duration-150
        ${active
          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
          : disabled
            ? "border-gray-200 text-gray-300 cursor-default"
            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 active:scale-95"
        }
      `}
    >
      {content}
    </button>
  );

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
      {/* Record count */}
      {total != null && limit != null && (
        <p className="text-sm text-gray-500 order-2 sm:order-1">
          Showing{" "}
          <span className="font-semibold text-gray-700">
            {((page - 1) * limit) + 1}–{Math.min(page * limit, total)}
          </span>{" "}
          of{" "}
          <span className="font-semibold text-gray-700">{total.toLocaleString()}</span>
        </p>
      )}

      {/* Page buttons */}
      <div className="flex items-center gap-1 order-1 sm:order-2">
        {/* « first */}
        {btn("«", 1, page <= 1, false, "first")}
        {/* < prev */}
        {btn(<ChevronLeft className="w-4 h-4" />, page - 1, page <= 1, false, "prev")}

        {/* Numbered pages */}
        {pageNumbers.map((p) => btn(p, p, false, p === page, p))}

        {/* > next */}
        {btn(<ChevronRight className="w-4 h-4" />, page + 1, page >= pages, false, "next")}
        {/* » last */}
        {btn("»", pages, page >= pages, false, "last")}
      </div>
    </div>
  );
}
