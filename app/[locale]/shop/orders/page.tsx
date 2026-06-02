"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useLocale } from "next-intl";
import {
  Package, ShoppingBag, Loader2, ArrowRight, ArrowLeft,
  Clock, CheckCircle2, Truck, MapPin,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";
import { formatPrice, formatSecondary } from "@/lib/price-format";

interface Order {
  id: string; orderNumber: string; status: string;
  total: number; currency: string; deliveryType: string;
  deliveryAddress: string | null;
  branch: { name: string; address: string | null } | null;
  createdAt: string;
  items: { book: { title: string } }[];
}

const STATUS_STYLE: Record<string, string> = {
  PENDING_PAYMENT:   "bg-amber-50 text-amber-700 border border-amber-200",
  PAYMENT_SUBMITTED: "bg-blue-50 text-blue-700 border border-blue-200",
  PAYMENT_CONFIRMED: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  PREPARING:         "bg-indigo-50 text-indigo-700 border border-indigo-200",
  READY_FOR_PICKUP:  "bg-purple-50 text-purple-700 border border-purple-200",
  SHIPPED:           "bg-violet-50 text-violet-700 border border-violet-200",
  DELIVERED:         "bg-teal-50 text-teal-700 border border-teal-200",
  COMPLETED:         "bg-green-50 text-green-700 border border-green-200",
  CANCELLED:         "bg-red-50 text-red-700 border border-red-200",
  RETURN_REQUESTED:  "bg-orange-50 text-orange-700 border border-orange-200",
  RETURNED:          "bg-gray-100 text-gray-600 border border-gray-200",
  REFUNDED:          "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT:   "Pending Payment",
  PAYMENT_SUBMITTED: "Payment Submitted",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  PREPARING:         "Preparing",
  READY_FOR_PICKUP:  "Ready for Pickup",
  SHIPPED:           "Shipped",
  DELIVERED:         "Delivered",
  COMPLETED:         "Completed",
  CANCELLED:         "Cancelled",
  RETURN_REQUESTED:  "Return Requested",
  RETURNED:          "Returned",
  REFUNDED:          "Refunded",
};

function statusIcon(status: string) {
  if (["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED", "PREPARING"].includes(status))
    return <Clock className="w-3 h-3" />;
  if (["SHIPPED", "DELIVERED", "READY_FOR_PICKUP"].includes(status))
    return <Truck className="w-3 h-3" />;
  if (status === "COMPLETED")
    return <CheckCircle2 className="w-3 h-3" />;
  return null;
}

export default function ShopOrdersPage() {
  const { data: session, status } = useSession();
  const locale      = useLocale();
  const libraryName = useLibraryName();
  const libraryLogo = useLibraryLogo();

  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [secCur,  setSecCur]  = useState("");
  const [secRate, setSecRate] = useState(0);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { setLoading(false); return; }
    Promise.all([
      fetch("/api/sale/orders").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.ok ? r.json() : {}) as Promise<Record<string, string>>,
    ]).then(([data, settings]) => {
      setOrders(Array.isArray(data) ? data : []);
      setSecCur(settings.STOCK_SECONDARY_CURRENCY ?? "");
      setSecRate(parseFloat(settings.STOCK_SECONDARY_RATE ?? "0") || 0);
      setLoading(false);
    });
  }, [session, status]);

  return (
    <div className="min-h-screen bg-[#faf7f0]">

      {/* ── Dark nav ────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 bg-[#1e1208] shadow-lg">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href={`/${locale}/shop`} className="flex items-center gap-2 min-w-0">
            {libraryLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={libraryLogo} alt={libraryName}
                className="w-7 h-7 rounded object-contain flex-shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded bg-amber-500 flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-4 h-4 text-white" />
              </div>
            )}
            <span className="font-semibold text-white text-sm truncate hidden sm:block">{libraryName}</span>
          </Link>

          <Link href={`/${locale}/shop`}
            className="flex items-center gap-1.5 text-amber-300 hover:text-amber-200 text-sm font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Bookstore</span>
          </Link>

          <MemberHeader theme="dark" />
        </div>
      </nav>

      {/* ── Dark hero strip ─────────────────────────────────────── */}
      <div className="bg-[#1e1208] border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">My Orders</h1>
            <p className="text-xs text-white/50">Track and manage your bookstore orders</p>
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 py-6">

        {!session && !loading && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-amber-500" />
            </div>
            <p className="text-stone-700 font-semibold mb-1">Sign in to view your orders</p>
            <p className="text-stone-500 text-sm mb-5">You need to be signed in to see your order history.</p>
            <Link href={`/${locale}/login`}
              className="inline-flex px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors">
              Sign In
            </Link>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
            </div>
            <p className="text-stone-500 text-sm">Loading your orders…</p>
          </div>
        )}

        {!loading && session && orders.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8 text-amber-500" />
            </div>
            <p className="text-stone-700 font-semibold mb-1">No orders yet</p>
            <p className="text-stone-500 text-sm mb-5">When you place an order it will appear here.</p>
            <Link href={`/${locale}/shop`}
              className="inline-flex px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors">
              Browse Bookstore
            </Link>
          </div>
        )}

        {!loading && session && orders.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-stone-500 mb-1">
              {orders.length} order{orders.length !== 1 ? "s" : ""} total
            </p>

            {orders.map((order) => {
              const label    = STATUS_LABEL[order.status] ?? order.status.replace(/_/g, " ");
              const style    = STATUS_STYLE[order.status] ?? "bg-gray-100 text-gray-600 border border-gray-200";
              const isAction = order.status === "PENDING_PAYMENT" || order.status === "PAYMENT_SUBMITTED";

              return (
                <Link key={order.id} href={`/${locale}/shop/orders/${order.id}`}
                  className={`flex items-center justify-between bg-white rounded-2xl border p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group ${
                    isAction ? "border-amber-200" : "border-stone-100"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <p className="font-bold text-stone-900 text-sm">{order.orderNumber}</p>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${style}`}>
                        {statusIcon(order.status)}
                        {label}
                      </span>
                      {isAction && (
                        <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse">
                          Action needed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 flex items-center gap-1.5 flex-wrap">
                      {order.items.length} book{order.items.length !== 1 ? "s" : ""}
                      <span className="text-stone-300">·</span>
                      {order.deliveryType === "PICKUP" ? (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          {order.branch?.name ?? "Pickup"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 max-w-[160px]">
                          <Truck className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">
                            {order.deliveryAddress
                              ? order.deliveryAddress.split("\n")[0]
                              : "Delivery"}
                          </span>
                        </span>
                      )}
                      <span className="text-stone-300">·</span>
                      {new Date(order.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    <div className="text-right">
                      <p className="font-bold text-amber-600 text-base leading-tight">
                        {formatPrice(order.total, order.currency)}
                      </p>
                      {formatSecondary(order.total, secCur, secRate) && (
                        <p className="text-[10px] text-stone-400 leading-tight">≈ {formatSecondary(order.total, secCur, secRate)}</p>
                      )}
                    </div>
                    <div className="w-7 h-7 rounded-full bg-stone-100 group-hover:bg-amber-100 flex items-center justify-center transition-colors">
                      <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-600 transition-colors" />
                    </div>
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
