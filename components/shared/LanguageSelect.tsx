"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Globe } from "lucide-react";

export const LANGUAGES = [
  { code: "af", name: "Afrikaans" },
  { code: "sq", name: "Albanian — Shqip" },
  { code: "am", name: "Amharic — አማርኛ" },
  { code: "ar", name: "Arabic — العربية" },
  { code: "hy", name: "Armenian — Հայերեն" },
  { code: "az", name: "Azerbaijani — Azərbaycan" },
  { code: "eu", name: "Basque — Euskara" },
  { code: "be", name: "Belarusian — Беларуская" },
  { code: "bn", name: "Bengali — বাংলা" },
  { code: "bs", name: "Bosnian — Bosanski" },
  { code: "bg", name: "Bulgarian — Български" },
  { code: "ca", name: "Catalan — Català" },
  { code: "ceb", name: "Cebuano" },
  { code: "zh", name: "Chinese — 中文" },
  { code: "hr", name: "Croatian — Hrvatski" },
  { code: "cs", name: "Czech — Čeština" },
  { code: "da", name: "Danish — Dansk" },
  { code: "nl", name: "Dutch — Nederlands" },
  { code: "en", name: "English" },
  { code: "eo", name: "Esperanto" },
  { code: "et", name: "Estonian — Eesti" },
  { code: "fil", name: "Filipino / Tagalog" },
  { code: "fi", name: "Finnish — Suomi" },
  { code: "fr", name: "French — Français" },
  { code: "gl", name: "Galician — Galego" },
  { code: "ka", name: "Georgian — ქართული" },
  { code: "de", name: "German — Deutsch" },
  { code: "el", name: "Greek — Ελληνικά" },
  { code: "gu", name: "Gujarati — ગુજરાતી" },
  { code: "ht", name: "Haitian Creole" },
  { code: "ha", name: "Hausa — هَوُسَ" },
  { code: "he", name: "Hebrew — עברית" },
  { code: "hi", name: "Hindi — हिन्दी" },
  { code: "hmn", name: "Hmong" },
  { code: "hu", name: "Hungarian — Magyar" },
  { code: "is", name: "Icelandic — Íslenska" },
  { code: "ig", name: "Igbo" },
  { code: "id", name: "Indonesian — Bahasa Indonesia" },
  { code: "ga", name: "Irish — Gaeilge" },
  { code: "it", name: "Italian — Italiano" },
  { code: "ja", name: "Japanese — 日本語" },
  { code: "jv", name: "Javanese — Basa Jawa" },
  { code: "kn", name: "Kannada — ಕನ್ನಡ" },
  { code: "kk", name: "Kazakh — Қазақша" },
  { code: "km", name: "Khmer — ភាសាខ្មែរ" },
  { code: "rw", name: "Kinyarwanda" },
  { code: "ko", name: "Korean — 한국어" },
  { code: "ku", name: "Kurdish — Kurdî" },
  { code: "ky", name: "Kyrgyz — Кыргызча" },
  { code: "lo", name: "Lao — ລາວ" },
  { code: "la", name: "Latin — Latina" },
  { code: "lv", name: "Latvian — Latviešu" },
  { code: "lt", name: "Lithuanian — Lietuvių" },
  { code: "lb", name: "Luxembourgish — Lëtzebuergesch" },
  { code: "mk", name: "Macedonian — Македонски" },
  { code: "mg", name: "Malagasy" },
  { code: "ms", name: "Malay — Bahasa Melayu" },
  { code: "ml", name: "Malayalam — മലയാളം" },
  { code: "mt", name: "Maltese — Malti" },
  { code: "mi", name: "Maori — Te Reo Māori" },
  { code: "mr", name: "Marathi — मराठी" },
  { code: "mn", name: "Mongolian — Монгол" },
  { code: "my", name: "Myanmar / Burmese — မြန်မာ" },
  { code: "ne", name: "Nepali — नेपाली" },
  { code: "no", name: "Norwegian — Norsk" },
  { code: "ny", name: "Nyanja / Chichewa" },
  { code: "or", name: "Odia (Oriya) — ଓଡ଼ିଆ" },
  { code: "ps", name: "Pashto — پښتو" },
  { code: "fa", name: "Persian — فارسی" },
  { code: "pl", name: "Polish — Polski" },
  { code: "pt", name: "Portuguese — Português" },
  { code: "pa", name: "Punjabi — ਪੰਜਾਬੀ" },
  { code: "ro", name: "Romanian — Română" },
  { code: "ru", name: "Russian — Русский" },
  { code: "sm", name: "Samoan" },
  { code: "gd", name: "Scottish Gaelic" },
  { code: "sr", name: "Serbian — Српски" },
  { code: "st", name: "Sesotho" },
  { code: "sn", name: "Shona" },
  { code: "sd", name: "Sindhi — سنڌي" },
  { code: "si", name: "Sinhala — සිංහල" },
  { code: "sk", name: "Slovak — Slovenčina" },
  { code: "sl", name: "Slovenian — Slovenščina" },
  { code: "so", name: "Somali — Soomaali" },
  { code: "es", name: "Spanish — Español" },
  { code: "su", name: "Sundanese — Basa Sunda" },
  { code: "sw", name: "Swahili — Kiswahili" },
  { code: "sv", name: "Swedish — Svenska" },
  { code: "tg", name: "Tajik — Тоҷикӣ" },
  { code: "ta", name: "Tamil — தமிழ்" },
  { code: "tt", name: "Tatar — Татар" },
  { code: "te", name: "Telugu — తెలుగు" },
  { code: "th", name: "Thai — ภาษาไทย" },
  { code: "tr", name: "Turkish — Türkçe" },
  { code: "tk", name: "Turkmen — Türkmen" },
  { code: "uk", name: "Ukrainian — Українська" },
  { code: "ur", name: "Urdu — اردو" },
  { code: "ug", name: "Uyghur — ئۇيغۇرچە" },
  { code: "uz", name: "Uzbek — O'zbek" },
  { code: "vi", name: "Vietnamese — Tiếng Việt" },
  { code: "cy", name: "Welsh — Cymraeg" },
  { code: "xh", name: "Xhosa — isiXhosa" },
  { code: "yi", name: "Yiddish — יידיש" },
  { code: "yo", name: "Yoruba" },
  { code: "zu", name: "Zulu — isiZulu" },
];

interface LanguageSelectProps {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  placeholder?: string;
}

export default function LanguageSelect({ value, onChange, className = "", placeholder = "Select language..." }: LanguageSelectProps) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const ref    = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus search input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const current = LANGUAGES.find((l) => l.code === value);

  const filtered = search.trim()
    ? LANGUAGES.filter((l) =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.code.toLowerCase().includes(search.toLowerCase())
      )
    : LANGUAGES;

  function select(code: string) {
    onChange(code);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Globe className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className={`truncate ${current ? "text-gray-900" : "text-gray-400"}`}>
            {current ? current.name : placeholder}
          </span>
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {value && (
            <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
              {value}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100 bg-gray-50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to search languages..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-52">
            {filtered.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-6">No languages found</p>
            ) : (
              filtered.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => select(lang.code)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-blue-50 transition-colors ${
                    value === lang.code
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-700"
                  }`}
                >
                  <span className="truncate">{lang.name}</span>
                  <span className="text-xs text-gray-400 font-mono ml-2 flex-shrink-0">{lang.code}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
