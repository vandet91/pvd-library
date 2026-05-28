"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Package, ShoppingBag, Loader2, ArrowRight } from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { useLibraryName } from "@/context/library-name";

interface Order {
  id: string; orderNumber: string; status: string;
  total: number; currency: string; deliveryType: string;
  createdAt: string;
  items: { book: { title: string } }[];
}

const STATUS_STYLE: Record<string, string> = {
  PENDING_PAYMENT:   "bg-amber-50 text-amber-700",
  PAYMENT_SUBMITTED: "bg-blue-50 text-blue-700",
  PAYMENT_CONFIRMED: "bg-cyan-50 text-cyan-700",
  PREPARING:         "bg-indigo-50 text-indigo-700",
  READY_FOR_PICKUP:  "bg-purple-50 text-purple-700",
  SHIPPED:           "bg-violet-50 text-violet-700",
  DELIVERED:         "bg-teal-50 text-teal-700",
  COMPLETED:         "bg-green-50 text-green-700",
  CANCELLED:         "bg-red-50 text-red-700",
  RETURN_REQUESTED:  "bg-orange-50 text-orange-700",
  RETURNED:          "bg-gray-100 text-gray-600",
  REFUNDED:          "bg-emerald-50 text-emerald-700",
};

export default function ShopOrdersPage() {
  const { data: session, status } = useSession();
  const locale      = useLocale();
  const libraryName = useLibraryName();

  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { setLoading(false); return; }
    fetch("/api/sale/orders").then((r) => r.json()).then((data) => {
      setOrders(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, [session, status]);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href={`/${locale}/shop`} className="font-bold text-gray-900">{libraryName} Shop</Link>
          <MemberHeader theme="light" />
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-6">
          <Package className="w-5 h-5 text-violet-600" /> My Orders
        </h1>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium mb-4">No orders yet</p>
            <Link href={`/${locale}/shop`} className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">Browse Shop</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const currSym = order.currency === "USD" ? "$" : order.currency + " ";
              return (
                <Link key={order.id} href={`/${locale}/shop/orders/${order.id}`}
                  className="flex items-center justify-between bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-900 text-sm">{order.orderNumber}</p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {order.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {order.items.length} book{order.items.length !== 1 ? "s" : ""} ·{" "}
                      {order.deliveryType === "PICKUP" ? "Pickup" : "Delivery"} ·{" "}
                      {new Date(order.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-bold text-gray-900">{currSym}{order.total.toFixed(2)}</p>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
