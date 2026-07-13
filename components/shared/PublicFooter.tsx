"use client";

import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";
import { BookOpen, Phone, Mail, MapPin, Clock, Globe } from "lucide-react";

export interface PublicFooterProps {
  enabled:      boolean;
  show:         string[];
  navCss:       string;
  accentHex:    string;
  phone:        string;
  email:        string;
  address:      string;
  telegram:     string;
  hours:        string;
  whatsapp?:    string;
  facebook?:    string;
  website:      string;
  description?: string;
  fullWidth?:   boolean;
}

function TelegramIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>;
}
function WhatsappIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>;
}

export default function PublicFooter({
  enabled, show, navCss, accentHex,
  phone, email, address, telegram, hours, whatsapp = "", website,
  description = "",
  fullWidth = false,
}: PublicFooterProps) {
  const fcx         = fullWidth ? "w-full px-6" : "max-w-6xl mx-auto px-4";
  const libraryName = useLibraryName();
  const libraryLogo = useLibraryLogo();

  if (!enabled) return null;

  const vis = new Set(show);

  const items = [
    ...(vis.has("phone")    && phone    ? [{ key:"phone",    value: phone,    href:`tel:${phone}`,                                 icon:<Phone className="w-4 h-4 text-white"/>,    bg:"bg-emerald-500" }] : []),
    ...(vis.has("address")  && address  ? [{ key:"address",  value: address,                                                        icon:<MapPin className="w-4 h-4 text-white"/>,   bg:"bg-rose-500"    }] : []),
    ...(vis.has("email")    && email    ? [{ key:"email",    value: email,    href:`mailto:${email}`,                              icon:<Mail className="w-4 h-4 text-white"/>,     bg:"bg-blue-500"    }] : []),
    ...(vis.has("hours")    && hours    ? [{ key:"hours",    value: hours,                                                          icon:<Clock className="w-4 h-4 text-white"/>,    bg:"bg-amber-500"   }] : []),
    ...(vis.has("whatsapp") && whatsapp ? [{ key:"whatsapp", value: whatsapp, href:`https://wa.me/${whatsapp.replace(/\D/g,"")}`, icon:<WhatsappIcon className="w-4 h-4 text-white"/>, bg:"bg-green-500" }] : []),
    ...(vis.has("telegram") && telegram ? [{ key:"telegram", value: telegram, href:`https://t.me/${telegram.replace("@","")}`,   icon:<TelegramIcon className="w-4 h-4 text-white"/>, bg:"bg-sky-500"   }] : []),
    ...(vis.has("website")  && website  ? [{ key:"website",  value: website,  href: website,                                       icon:<Globe className="w-4 h-4 text-white"/>,    bg:"bg-violet-500"  }] : []),
  ];

  if (items.length === 0) return null;

  return (
    <footer style={{ background: navCss }} className="border-t border-white/5">
      <div className={`${fcx} py-8`}>

        {/* Branding */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center"
            style={{ background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.15)" }}>
            {libraryLogo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={libraryLogo} alt={libraryName} className="w-full h-full object-contain p-1.5" />
              : <BookOpen className="w-7 h-7 text-white/60" />}
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">{libraryName}</p>
            {description && <p className="text-white/40 text-xs mt-0.5">{description}</p>}
          </div>
        </div>

        {/* Contact pills */}
        <div className="flex flex-wrap gap-2 mb-8">
          {items.map((item) => {
            const pill = (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{ background:"rgba(255,255,255,0.07)" }}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${item.bg}`}>
                  {item.icon}
                </div>
                <span className="text-white/65 text-xs font-medium">{item.value}</span>
              </div>
            );
            return item.href ? (
              <a key={item.key} href={item.href}
                target={item.key==="website" ? "_blank" : undefined}
                rel={item.key==="website" ? "noreferrer" : undefined}
                className="hover:opacity-80 transition-opacity">
                {pill}
              </a>
            ) : <div key={item.key}>{pill}</div>;
          })}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 pt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-white/20 text-xs">
            © {new Date().getFullYear()} {libraryName}. All rights reserved.
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: accentHex, opacity: 0.5 }} />
            <span className="text-white/15 text-[10px]">Powered by PVD Library</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
