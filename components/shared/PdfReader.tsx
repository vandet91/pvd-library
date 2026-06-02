"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  BookOpen, AlignJustify, Columns2,
  Sun, Moon, Maximize2, Minimize2,
  RotateCw, Download, Loader2, Bookmark,
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/* ── Types ─────────────────────────────────────────────────────────────────── */
type ReadMode = "kindle" | "single" | "double" | "scroll";
type Theme    = "dark" | "light" | "sepia";

interface TK {
  bg: string; toolbar: string; btn: string;
  btnActive: string; text: string; subtext: string;
  progress: string; divider: string;
}
const THEMES: Record<Theme, TK> = {
  dark:  { bg:"bg-gray-950", toolbar:"bg-gray-900 border-gray-800",
    btn:"text-white/60 hover:text-white hover:bg-white/10",
    btnActive:"bg-indigo-600 text-white", text:"text-white",
    subtext:"text-white/40", progress:"bg-white/10", divider:"bg-white/10" },
  light: { bg:"bg-gray-100", toolbar:"bg-white border-gray-200",
    btn:"text-gray-500 hover:text-gray-900 hover:bg-gray-100",
    btnActive:"bg-indigo-600 text-white", text:"text-gray-900",
    subtext:"text-gray-400", progress:"bg-gray-200", divider:"bg-gray-200" },
  sepia: { bg:"bg-[#2c1a08]", toolbar:"bg-[#1e1105] border-[#3d2510]",
    btn:"text-amber-300/60 hover:text-amber-100 hover:bg-white/10",
    btnActive:"bg-amber-700 text-amber-100", text:"text-amber-100",
    subtext:"text-amber-300/40", progress:"bg-amber-900/50", divider:"bg-amber-900/50" },
};

/* ── Button ── */
function Btn({ onClick, disabled, active, title, tk, children, wide }:{
  onClick?:()=>void; disabled?:boolean; active?:boolean;
  title?:string; tk:TK; children:React.ReactNode; wide?:boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={`flex items-center gap-1.5 h-8 rounded-lg text-xs font-medium transition-colors
        disabled:opacity-30 disabled:cursor-not-allowed
        ${wide?"px-3":"w-8 justify-center"}
        ${active?tk.btnActive:tk.btn}`}>
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOOK SPREAD with real page-flip
═══════════════════════════════════════════════════════════════════════════ */
type FlipDir = "fwd" | "bwd" | null;

function BookSpread({ page: parentPage, numPages, pageEl, pageW, zoom, theme, tk, onPageChange }: {
  page: number; numPages: number; theme: Theme; tk: TK; zoom: number; pageW: number;
  pageEl: (n:number, w:number) => React.ReactNode;
  onPageChange: (n:number) => void;
}) {
  // ── Own visual page — never updated mid-animation to prevent flash ──────
  const [vPage,       setVPage]       = useState(parentPage);
  const [flipDir,     setFlipDir]     = useState<FlipDir>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const dirRef = useRef<FlipDir>(null); // stable closure ref

  // Sync from parent only when idle
  useEffect(() => { if (!isAnimating) setVPage(parentPage); }, [parentPage, isAnimating]);

  const W = Math.floor(Math.max(60, pageW) * zoom);
  const H = Math.floor(W * 1.414);

  const canFwd = vPage + 1 < numPages;
  const canBwd = vPage > 1;

  function startFlip(dir: "fwd" | "bwd") {
    if (isAnimating) return;
    if (dir === "fwd" && !canFwd) return;
    if (dir === "bwd" && !canBwd) return;
    dirRef.current = dir;
    setFlipDir(dir);
    setIsAnimating(true);
  }

  function onTransitionEnd() {
    const dir = dirRef.current;
    if (!dir) return;
    const newPage = dir === "fwd" ? vPage + 2 : vPage - 2;

    // Batch BOTH in the same React render (React 18 auto-batches sync setState).
    // Single render = single paint — no transient state where slots show wrong pages.
    // e.g. fwd flip: rightSlot = vPage+3 during animation, vPage+1 after.
    // If we split the updates, there's one render with vPage=newPage but flipDir still "fwd",
    // making rightSlot jump to (newPage+3) then back to (newPage+1). That jump is the flash.
    setVPage(newPage);
    setFlipDir(null);
    dirRef.current = null;

    // Unlock in next frame after the batched paint completes
    requestAnimationFrame(() => {
      setIsAnimating(false);
      onPageChange(newPage);
    });
  }

  // Slot / face page numbers
  const leftSlot  = flipDir === "bwd" ? vPage - 2 : vPage;
  const rightSlot = flipDir === "fwd" ? vPage + 3 : vPage + 1;
  const frontFace = flipDir === "bwd" ? vPage      : vPage + 1;
  const backFace  = flipDir === "bwd" ? vPage - 1  : vPage + 2;

  const pg = (n: number) =>
    n >= 1 && n <= numPages ? pageEl(n, W) : <BlankPage W={W} H={H} theme={theme} />;

  const flipAngle = flipDir === "fwd" ? -180 : flipDir === "bwd" ? 180 : 0;
  const totalW    = W * 2 + 12;

  // Pages to pre-render (populates pdf.js canvas cache before animation)
  const preRender = [-3,-2,-1,0,1,2,3,4]
    .map(d => vPage + d).filter(n => n >= 1 && n <= numPages);

  return (
    <div className="flex-1 flex items-center justify-center overflow-hidden p-4 relative">

      {/* ── Silent pre-render: keeps surrounding pages in pdf.js cache ── */}
      <div style={{ position:"absolute", left:-99999, top:0, width:W,
        visibility:"hidden", pointerEvents:"none", overflow:"hidden", height:0 }}>
        {preRender.map(n => <div key={n}>{pageEl(n, W)}</div>)}
      </div>

      {/* Prev arrow */}
      <button type="button" onClick={() => startFlip("bwd")} disabled={!canBwd || isAnimating}
        className={`w-10 flex-shrink-0 flex items-center justify-center h-full transition-colors
          disabled:opacity-0 ${tk.btn}`}>
        <ChevronLeft className="w-6 h-6" />
      </button>

      {/* Book */}
      <div style={{ position:"relative", width:totalW, height:H,
        perspective:"3000px", flexShrink:0 }}>

        {/* Left slot */}
        <div style={{ position:"absolute", left:0, top:0, width:W, height:H,
          borderRadius:"6px 0 0 6px", overflow:"hidden",
          boxShadow:"inset -4px 0 16px rgba(0,0,0,0.25)", zIndex:1 }}>
          {pg(leftSlot)}
        </div>

        {/* Spine */}
        <div style={{ position:"absolute", left:W, top:0, width:12, height:H, zIndex:5,
          background:"linear-gradient(to right,rgba(0,0,0,0.4),rgba(0,0,0,0.04),rgba(0,0,0,0.4))" }}/>

        {/* Right slot */}
        <div style={{ position:"absolute", left:W+12, top:0, width:W, height:H,
          borderRadius:"0 6px 6px 0", overflow:"hidden",
          boxShadow:"inset 4px 0 16px rgba(0,0,0,0.1)", zIndex:1 }}>
          {pg(rightSlot)}
        </div>

        {/* ── Flipper ── */}
        <div style={{
          position:       "absolute",
          left:           flipDir === "bwd" ? 0 : W + 12,
          top:            0, width:W, height:H,
          transformStyle: "preserve-3d",
          transformOrigin:flipDir === "bwd" ? "right center" : "left center",
          transform:      `rotateY(${flipAngle}deg)`,
          transition:     isAnimating
            ? "transform 0.65s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
            : "none",
          willChange:     "transform",
          zIndex:         20,
        }}
          onTransitionEnd={onTransitionEnd}
        >
          {/* Front face
              IMPORTANT: no overflow/filter/opacity on this div — they break preserve-3d
              and cause backfaceVisibility to stop working (= the flash). Clip via inner. */}
          <div style={{
            position:"absolute", inset:0,
            backfaceVisibility:"hidden",
            WebkitBackfaceVisibility:"hidden",
          }}>
            {/* Inner clip — safe, doesn't break 3D context */}
            <div style={{
              position:"absolute", inset:0, overflow:"hidden",
              borderRadius: flipDir==="bwd" ? "6px 0 0 6px" : "0 6px 6px 0",
            }}>
              {pg(frontFace)}
              {/* Curl shadow — only during animation */}
              {isAnimating && (
                <div style={{ position:"absolute", inset:0, pointerEvents:"none",
                  background: flipDir==="fwd"
                    ? "linear-gradient(to right, transparent 55%, rgba(0,0,0,0.05) 78%, rgba(0,0,0,0.22) 93%, rgba(0,0,0,0.32) 100%)"
                    : "linear-gradient(to left,  transparent 55%, rgba(0,0,0,0.05) 78%, rgba(0,0,0,0.22) 93%, rgba(0,0,0,0.32) 100%)"
                }}/>
              )}
            </div>
          </div>

          {/* Back face
              rotateY(180deg) only — no scaleX(-1).
              Parent rotates -180 → net = 0 → content reads normally (no mirror).
              overflow on inner wrapper only, NOT on the backfaceVisibility element. */}
          <div style={{
            position:"absolute", inset:0,
            backfaceVisibility:"hidden",
            WebkitBackfaceVisibility:"hidden",
            transform:"rotateY(180deg)",
          }}>
            <div style={{
              position:"absolute", inset:0, overflow:"hidden",
              borderRadius: flipDir==="bwd" ? "0 6px 6px 0" : "6px 0 0 6px",
            }}>
              {pg(backFace)}
              {/* Back-face light sheen */}
              <div style={{ position:"absolute", inset:0, pointerEvents:"none",
                background:"linear-gradient(to right, rgba(255,255,255,0.08) 0%, transparent 35%)"
              }}/>
            </div>
          </div>
        </div>

        {/* Cast shadow from flipper onto static page */}
        {isAnimating && (
          <div style={{
            position:"absolute",
            left: flipDir==="fwd" ? 0 : W+12, top:0, width:W, height:H,
            pointerEvents:"none", zIndex:15,
            borderRadius: flipDir==="fwd" ? "6px 0 0 6px" : "0 6px 6px 0",
            background: flipDir==="fwd"
              ? "linear-gradient(to right, rgba(0,0,0,0.18) 0%, transparent 50%)"
              : "linear-gradient(to left,  rgba(0,0,0,0.18) 0%, transparent 50%)",
          }}/>
        )}
      </div>

      {/* Next arrow */}
      <button type="button" onClick={() => startFlip("fwd")} disabled={!canFwd || isAnimating}
        className={`w-10 flex-shrink-0 flex items-center justify-center h-full transition-colors
          disabled:opacity-0 ${tk.btn}`}>
        <ChevronRight className="w-6 h-6" />
      </button>
    </div>
  );
}

/* ── Blank page placeholder ─────────────────────────────────────────────── */
function BlankPage({ W, H, theme }: { W:number; H:number; theme:Theme }) {
  const bg = theme==="sepia" ? "#f5e6c8" : theme==="light" ? "#f3f4f6" : "#1f2937";
  return (
    <div style={{ width:W, height:H, background:bg,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <BookOpen style={{ width:40, height:40, opacity:0.1 }} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PDF READER
══════════════════════════════════════════════════════════════════════════════ */
interface PdfReaderProps { url:string; title:string; downloadUrl?:string; }

export default function PdfReader({ url, title, downloadUrl }: PdfReaderProps) {
  const [numPages,   setNumPages]   = useState(0);
  const [page,       setPage]       = useState(1);
  const [zoom,       setZoom]       = useState(1.0);
  const [mode,       setMode]       = useState<ReadMode>("kindle");
  const [theme,      setTheme]      = useState<Theme>("dark");
  const [fullscreen, setFullscreen] = useState(false);
  const [rotate,     setRotate]     = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [pageInput,  setPageInput]  = useState("1");
  const [anim,       setAnim]       = useState<"left"|"right"|null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef   = useRef<HTMLDivElement>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const [contentH,   setContentH]   = useState(0);
  const [containerW, setContainerW] = useState(900);

  const tk = THEMES[theme];

  /* Measure content area */
  useEffect(() => {
    function measure() {
      const total  = containerRef.current?.clientHeight ?? 0;
      const tbar   = toolbarRef.current?.offsetHeight   ?? 0;
      const bbar   = bottomRef.current?.offsetHeight    ?? 0;
      setContentH(Math.max(200, total - tbar - bbar));
      setContainerW(containerRef.current?.clientWidth ?? 900);
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [mode]);

  useEffect(() => { setPageInput(String(page)); }, [page]);

  /* Keyboard */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key==="ArrowRight"||e.key==="PageDown") handleNext();
      if (e.key==="ArrowLeft" ||e.key==="PageUp")   handlePrev();
      if (e.key==="+"||e.key==="=") setZoom(z=>Math.min(3, +(z+0.15).toFixed(2)));
      if (e.key==="-")              setZoom(z=>Math.max(0.4,+(z-0.15).toFixed(2)));
      if (e.key==="f"||e.key==="F") toggleFS();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line

  /* Fullscreen */
  function toggleFS() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen().catch(()=>{});
    else document.exitFullscreen();
  }
  useEffect(() => {
    const fn = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fn);
    return () => document.removeEventListener("fullscreenchange", fn);
  }, []);

  const onLoadSuccess = useCallback(({ numPages }:{numPages:number}) => {
    setNumPages(numPages); setLoading(false);
  }, []);

  /* Navigation */
  const step  = mode==="double" ? 2 : 1;
  const atEnd = mode==="double" ? page >= numPages - 1 : page >= numPages;

  function turn(dir:"left"|"right", np:number) {
    if (mode==="scroll"||mode==="double") return;
    setAnim(dir);
    setTimeout(() => { setPage(np); setAnim(null); }, 150);
  }
  function handleNext() { if(!atEnd) turn("right", Math.min(numPages, page+step)); }
  function handlePrev() { if(page>1) turn("left",  Math.max(1,        page-step)); }

  /* Page widths */
  const kindleW  = Math.min(containerW - 120, 680);
  const singleW  = containerW - 120;
  const doubleW  = Math.floor((containerW - 80) / 2) - 6;
  const scrollW  = Math.min(containerW - 48, 860);

  const animCls = anim==="right"
    ? "opacity-0 translate-x-6 scale-[0.98]"
    : anim==="left"
      ? "opacity-0 -translate-x-6 scale-[0.98]"
      : "opacity-100 translate-x-0 scale-100";

  /* Page element factory */
  const pageEl = (n: number, w: number) => (
    <Page key={`${n}-${w}-${rotate}`} pageNumber={n}
      width={Math.floor(Math.max(60, w))}
      rotate={rotate} renderAnnotationLayer renderTextLayer loading="" />
  );

  /* ── TOOLBAR ── */
  const toolbar = (
    <div ref={toolbarRef}
      className={`flex items-center gap-1 px-3 py-2 border-b flex-shrink-0 flex-wrap ${tk.toolbar}`}>
      <Btn onClick={()=>setMode("kindle")} active={mode==="kindle"} tk={tk} title="Kindle mode" wide>
        <Bookmark className="w-3.5 h-3.5"/><span className="hidden sm:inline">Kindle</span>
      </Btn>
      <Btn onClick={()=>setMode("single")} active={mode==="single"} tk={tk} title="Single page" wide>
        <BookOpen className="w-3.5 h-3.5"/><span className="hidden sm:inline">Single</span>
      </Btn>
      <Btn onClick={()=>setMode("double")} active={mode==="double"} tk={tk} title="Book spread" wide>
        <Columns2 className="w-3.5 h-3.5"/><span className="hidden sm:inline">Spread</span>
      </Btn>
      <Btn onClick={()=>setMode("scroll")} active={mode==="scroll"} tk={tk} title="Scroll" wide>
        <AlignJustify className="w-3.5 h-3.5"/><span className="hidden sm:inline">Scroll</span>
      </Btn>

      <div className={`w-px h-5 mx-1 flex-shrink-0 ${tk.divider}`}/>

      {mode!=="scroll"&&mode!=="double"&&<>
        <Btn onClick={handlePrev} disabled={page<=1} tk={tk} title="Prev (←)">
          <ChevronLeft className="w-4 h-4"/>
        </Btn>
        <div className="flex items-center gap-1">
          <input type="number" min={1} max={numPages} value={pageInput}
            onChange={e=>setPageInput(e.target.value)}
            onBlur={()=>setPage(Math.max(1,Math.min(numPages,+pageInput||1)))}
            onKeyDown={e=>e.key==="Enter"&&setPage(Math.max(1,Math.min(numPages,+pageInput||1)))}
            className={`w-11 text-center text-xs rounded-lg border px-1 py-1 bg-transparent
              focus:outline-none focus:ring-1 focus:ring-indigo-400
              ${theme==="light"?"border-gray-300 text-gray-800":"border-white/20 text-white"}`}/>
          <span className={`text-xs ${tk.subtext}`}>/{numPages||"—"}</span>
        </div>
        <Btn onClick={handleNext} disabled={atEnd} tk={tk} title="Next (→)">
          <ChevronRight className="w-4 h-4"/>
        </Btn>
        <div className={`w-px h-5 mx-1 flex-shrink-0 ${tk.divider}`}/>
      </>}

      <Btn onClick={()=>setZoom(z=>Math.max(0.4,+(z-0.15).toFixed(2)))} tk={tk} title="Zoom out">
        <ZoomOut className="w-4 h-4"/>
      </Btn>
      <button type="button" onClick={()=>setZoom(1.0)}
        className={`text-xs px-2 py-1 rounded-lg transition-colors ${tk.btn}`}>
        {Math.round(zoom*100)}%
      </button>
      <Btn onClick={()=>setZoom(z=>Math.min(3,+(z+0.15).toFixed(2)))} tk={tk} title="Zoom in">
        <ZoomIn className="w-4 h-4"/>
      </Btn>

      <div className={`w-px h-5 mx-1 flex-shrink-0 ${tk.divider}`}/>
      <Btn onClick={()=>setRotate(r=>(r+90)%360)} tk={tk} title="Rotate">
        <RotateCw className="w-3.5 h-3.5"/>
      </Btn>
      <div className={`w-px h-5 mx-1 flex-shrink-0 ${tk.divider}`}/>

      <Btn onClick={()=>setTheme("dark")}  active={theme==="dark"}  tk={tk} title="Dark">
        <Moon className="w-3.5 h-3.5"/>
      </Btn>
      <Btn onClick={()=>setTheme("sepia")} active={theme==="sepia"} tk={tk} title="Sepia">
        <span className="text-[11px] font-bold">S</span>
      </Btn>
      <Btn onClick={()=>setTheme("light")} active={theme==="light"} tk={tk} title="Light">
        <Sun className="w-3.5 h-3.5"/>
      </Btn>

      <div className={`w-px h-5 mx-1 flex-shrink-0 ${tk.divider}`}/>
      <Btn onClick={toggleFS} tk={tk} title={fullscreen?"Exit (F)":"Fullscreen (F)"}>
        {fullscreen?<Minimize2 className="w-4 h-4"/>:<Maximize2 className="w-4 h-4"/>}
      </Btn>
      {downloadUrl&&(
        <a href={downloadUrl} download title="Download"
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${tk.btn}`}>
          <Download className="w-4 h-4"/>
        </a>
      )}
    </div>
  );

  /* ── BOTTOM BARS ── */
  const kindleBar = mode==="kindle"&&!loading&&numPages>0&&(
    <div ref={bottomRef}
      className={`flex items-center gap-4 px-6 py-3 border-t flex-shrink-0 ${tk.toolbar}`}>
      <button type="button" onClick={handlePrev} disabled={page<=1}
        className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-colors
          disabled:opacity-30 disabled:cursor-not-allowed ${tk.btn}`}>
        <ChevronLeft className="w-4 h-4"/> Prev
      </button>
      <div className="flex-1 flex flex-col items-center gap-1.5">
        <div className={`w-full h-1 rounded-full overflow-hidden ${tk.progress}`}>
          <div className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{width:`${(page/numPages)*100}%`}}/>
        </div>
        <span className={`text-[11px] ${tk.subtext}`}>
          Page {page} of {numPages} · {Math.round((page/numPages)*100)}% complete
        </span>
      </div>
      <button type="button" onClick={handleNext} disabled={atEnd}
        className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-colors
          disabled:opacity-30 disabled:cursor-not-allowed ${tk.btn}`}>
        Next <ChevronRight className="w-4 h-4"/>
      </button>
    </div>
  );

  const progressBar = (mode==="single")&&!loading&&numPages>0&&(
    <div ref={mode==="single"?bottomRef:undefined}
      className={`flex items-center gap-3 px-6 py-2 border-t flex-shrink-0 ${tk.toolbar}`}>
      <div className={`h-1 rounded-full flex-1 max-w-sm overflow-hidden ${tk.progress}`}>
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300"
          style={{width:`${(page/numPages)*100}%`}}/>
      </div>
      <span className={`text-xs flex-shrink-0 ${tk.subtext}`}>{page} / {numPages}</span>
    </div>
  );

  /* ── RENDER ── */
  return (
    <div ref={containerRef}
      className={`flex flex-col h-[calc(100vh-52px)] ${tk.bg} ${tk.text} overflow-hidden`}>

      {toolbar}

      {/* Content area — exact measured height */}
      <div style={{ height: contentH>0?contentH:"auto",
        flex: contentH>0?"none":"1 1 0" }}
        className="overflow-hidden">

        <Document file={url} onLoadSuccess={onLoadSuccess}
          onLoadError={()=>setLoading(false)} loading=""
          className="w-full h-full">

          {loading&&(
            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400"/>
              <p className={`text-sm ${tk.subtext}`}>Loading {title}…</p>
            </div>
          )}

          {/* ── KINDLE ── */}
          {!loading&&mode==="kindle"&&(
            <div className="w-full h-full flex items-center justify-center overflow-auto p-6">
              <div className={`transition-all duration-150 ease-in-out ${animCls}`}
                style={{boxShadow:"0 8px 48px rgba(0,0,0,0.6)",borderRadius:6,overflow:"hidden",flexShrink:0}}>
                {pageEl(page, kindleW)}
              </div>
            </div>
          )}

          {/* ── SINGLE ── */}
          {!loading&&mode==="single"&&(
            <div className="w-full h-full flex items-stretch">
              <button type="button" onClick={handlePrev} disabled={page<=1}
                className={`w-14 flex-shrink-0 flex items-center justify-center transition-colors disabled:opacity-0 ${tk.btn}`}>
                <ChevronLeft className="w-6 h-6"/>
              </button>
              <div className="flex-1 flex items-center justify-center overflow-auto p-4">
                <div className={`transition-all duration-150 ease-in-out ${animCls}`}
                  style={{boxShadow:"0 4px 32px rgba(0,0,0,0.5)",borderRadius:4,overflow:"hidden",flexShrink:0}}>
                  {pageEl(page, singleW)}
                </div>
              </div>
              <button type="button" onClick={handleNext} disabled={atEnd}
                className={`w-14 flex-shrink-0 flex items-center justify-center transition-colors disabled:opacity-0 ${tk.btn}`}>
                <ChevronRight className="w-6 h-6"/>
              </button>
            </div>
          )}

          {/* ── SPREAD with flip ── */}
          {!loading&&mode==="double"&&numPages>0&&(
            <BookSpread
              page={page} numPages={numPages}
              pageEl={pageEl} pageW={doubleW} zoom={zoom}
              theme={theme} tk={tk}
              onPageChange={p=>{setPage(p); setPageInput(String(p));}}
            />
          )}

          {/* ── SCROLL ── */}
          {!loading&&mode==="scroll"&&(
            <div className="w-full h-full overflow-y-auto overflow-x-auto">
              <div className="flex flex-col items-center gap-6 py-8 px-4">
                {Array.from({length:numPages},(_,i)=>(
                  <div key={i+1}
                    style={{boxShadow:"0 4px 24px rgba(0,0,0,0.4)",borderRadius:4,overflow:"hidden",flexShrink:0}}>
                    {pageEl(i+1, scrollW)}
                  </div>
                ))}
              </div>
            </div>
          )}

        </Document>
      </div>

      {kindleBar}
      {progressBar}
    </div>
  );
}
