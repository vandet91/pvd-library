"use client";

import { ExternalLink, Music, Download } from "lucide-react";

interface EbookViewerProps {
  type:  string;
  url:   string;
  title: string;
}

export default function EbookViewer({ type, url, title }: EbookViewerProps) {

  // ── PDF ────────────────────────────────────────────────────────
  if (type === "PDF") {
    // Local/uploaded files (relative paths) → use native browser PDF renderer.
    // Google Docs Viewer cannot reach localhost or private servers.
    // External URLs → Google Docs Viewer (handles Drive/Dropbox links nicely).
    const isLocal = url.startsWith("/") || url.startsWith("blob:");
    const viewerUrl = isLocal
      ? url
      : url.startsWith("https://drive.google.com")
        ? url.replace("/view", "/preview")
        : `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

    return (
      <div className="h-[calc(100vh-52px)] flex flex-col">
        <iframe
          src={viewerUrl}
          title={title}
          className="flex-1 w-full border-0"
          allowFullScreen
        />
        <div className="bg-gray-800 py-2 px-4 text-center">
          <a href={url} download target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors">
            <Download className="w-3.5 h-3.5" />
            Download PDF
          </a>
        </div>
      </div>
    );
  }

  // ── EPUB ───────────────────────────────────────────────────────
  if (type === "EPUB") {
    return (
      <div className="h-[calc(100vh-52px)] flex items-center justify-center bg-gray-800">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-blue-900/40 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.966 8.966 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <h2 className="text-white font-semibold mb-2">{title}</h2>
          <p className="text-white/50 text-sm mb-6">
            EPUB files open best in a dedicated reader app.
          </p>
          <div className="flex flex-col gap-3">
            <a href={url} download
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
              <Download className="w-4 h-4" />
              Download EPUB
            </a>
            <a href={`https://www.kindle.com/send-to-kindle`} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-lg text-sm transition-colors">
              <ExternalLink className="w-4 h-4" />
              Open in Kindle / reader
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── VIDEO ──────────────────────────────────────────────────────
  if (type === "VIDEO") {
    // Detect YouTube / Vimeo and convert to embed URL
    let embedUrl = url;
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`;
    }
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }

    const isDirectVideo = /\.(mp4|webm|ogg)(\?.*)?$/i.test(url);

    return (
      <div className="h-[calc(100vh-52px)] flex items-center justify-center bg-black">
        {isDirectVideo ? (
          <video controls autoPlay className="max-h-full max-w-full">
            <source src={url} />
            Your browser does not support video.
          </video>
        ) : (
          <iframe
            src={embedUrl}
            title={title}
            className="w-full h-full max-w-5xl mx-auto"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}
      </div>
    );
  }

  // ── AUDIO ──────────────────────────────────────────────────────
  if (type === "AUDIO") {
    return (
      <div className="h-[calc(100vh-52px)] flex items-center justify-center bg-gray-800">
        <div className="text-center max-w-md w-full px-6">
          <div className="w-24 h-24 bg-emerald-900/40 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
            <Music className="w-12 h-12 text-emerald-400" />
          </div>
          <h2 className="text-white font-semibold text-lg mb-6">{title}</h2>
          <audio controls autoPlay className="w-full accent-emerald-500">
            <source src={url} />
            Your browser does not support audio.
          </audio>
          <a href={url} download
            className="inline-flex items-center gap-2 mt-5 text-xs text-white/40 hover:text-white transition-colors">
            <Download className="w-3.5 h-3.5" />
            Download audio
          </a>
        </div>
      </div>
    );
  }

  // ── EXTERNAL LINK ──────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-52px)] flex items-center justify-center bg-gray-800">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <ExternalLink className="w-10 h-10 text-gray-400" />
        </div>
        <h2 className="text-white font-semibold mb-2">{title}</h2>
        <p className="text-white/50 text-sm mb-6">
          This resource is hosted on an external site.
        </p>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
          <ExternalLink className="w-4 h-4" />
          Open External Link
        </a>
      </div>
    </div>
  );
}
