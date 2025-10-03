"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TranslateSchema, UploadSchema, YouTubeSchema } from "./_lib/schemas";
import { splitAudioFile, transcribeChunks, AudioChunk } from "./_lib/audio-utils";
import ThemeToggle from "./_components/ThemeToggle";

export type Segment = {
  id: string;
  start: number; // 秒
  end: number; // 秒
  text: string;
};

const VOICES = [
  { id: "alloy", label: "Alloy" },
  { id: "ash", label: "Ash" },
  { id: "coral", label: "Coral" },
  { id: "echo", label: "Echo" },
  { id: "fable", label: "Fable" },
  { id: "onyx", label: "Onyx" },
  { id: "nova", label: "Nova" },
  { id: "sage", label: "Sage" },
  { id: "shimmer", label: "Shimmer" },
];

function StepBar({ step }: { step: number }) {
  const items = [
    { id: 1, label: "上傳/匯入" },
    { id: 2, label: "轉譯" },
    { id: 3, label: "英文口語化" },
    { id: 4, label: "生成語音" },
    { id: 5, label: "播放/同步" },
  ];
  return (
    <div className="flex items-center justify-between p-4 sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur">
      <div className="flex items-center gap-3">
        {items.map((it, i) => (
          <div
            key={it.id}
            className={`step-badge ${step > i ? "step-badge-completed" : ""}`}
          >
            <span className="size-5 inline-flex items-center justify-center rounded-full border border-gray-300 dark:border-gray-600">
              {step > i ? (
                <div className="size-3 bg-green-500 rounded-full" />
              ) : (
                it.id
              )}
            </span>
            <span className="hidden sm:block">{it.label}</span>
          </div>
        ))}
      </div>
      <ThemeToggle />
    </div>
  );
}

export default function Page() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState(VOICES[0].id);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [english, setEnglish] = useState<Segment[]>([]);
  const [step, setStep] = useState(1);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [youtubeInfo, setYoutubeInfo] = useState<any>(null);
  const [downloadProgress, setDownloadProgress] = useState<string>("");

  const uploadForm = useForm<{ file: FileList }>({
    resolver: zodResolver(UploadSchema),
  });

  const translateForm = useForm<{ segments: Segment[] }>({
    resolver: zodResolver(TranslateSchema),
    defaultValues: { segments: [] },
  });

  const youtubeForm = useForm<{ url: string }>({
    resolver: zodResolver(YouTubeSchema),
  });

  useEffect(() => {
    if (segments.length) translateForm.reset({ segments });
  }, [segments]);

  async function onUpload(data: { file: FileList }) {
    try {
      setError(null);
      setUploadProgress("");
      setProcessingProgress(null);
      const file = data.file[0];
      if (!file) {
        setError('請選擇檔案');
        return;
      }

      // 檢查檔案大小並顯示相應訊息
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > 25) {
        setUploadProgress(`檔案較大 (${fileSizeMB.toFixed(1)}MB)，正在客戶端分割...`);
      } else {
        setUploadProgress("正在處理音訊轉譯...");
      }

      // 客戶端分割音訊
      const chunks = await splitAudioFile(file);
      
      if (chunks.length > 1) {
        setUploadProgress("");
        // 批次處理片段
        const segments = await transcribeChunks(chunks, (current, total, message) => {
          setProcessingProgress({ current, total, message });
        });
        
        setSegments(segments);
        setProcessingProgress(null);
      } else {
        // 單一檔案直接處理
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        setSegments(json.segments);
      }
      
      setStep(2);
      setUploadProgress("");
    } catch (e: any) {
      setError(e?.message || "轉譯失敗");
      setUploadProgress("");
      setProcessingProgress(null);
      console.error("Upload error:", e);
    }
  }

  async function onTranslate(data: { segments: Segment[] }) {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments: data.segments }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    // 對齊 id，時間用原本的
    const map = new Map(
      json.items.map((it: any) => [String(it.id), String(it.text)])
    );
    const merged = data.segments.map((s) => ({
      ...s,
      text: (map.get(String(s.id)) as string) || s.text,
    }));
    setEnglish(merged);
    setStep(3);
  }

  async function fetchYouTubeInfo(data: { url: string }) {
    try {
      setError(null);
      setDownloadProgress("正在獲取視頻信息...");
      
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: data.url }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "獲取視頻信息失敗");
      }
      
      const info = await res.json();
      setYoutubeInfo(info);
      setDownloadProgress("");
    } catch (e: any) {
      setError(e?.message || "獲取視頻信息失敗");
      setDownloadProgress("");
      console.error("YouTube info error:", e);
    }
  }

  async function downloadYouTubeAudio() {
    try {
      setError(null);
      setDownloadProgress("正在下載並轉換音訊...");
      
      const url = youtubeForm.getValues("url");
      const res = await fetch(`/api/youtube?url=${encodeURIComponent(url)}&quality=highestaudio`);
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "下載失敗");
      }
      
      // 獲取檔案
      const blob = await res.blob();
      const audioFile = new File([blob], `${youtubeInfo.title}.mp3`, { type: 'audio/mpeg' });
      
      setDownloadProgress("音訊下載完成，開始轉譯...");
      
      // 使用現有的音訊處理流程
      const chunks = await splitAudioFile(audioFile);
      
      if (chunks.length > 1) {
        setDownloadProgress("");
        const segments = await transcribeChunks(chunks, (current, total, message) => {
          setProcessingProgress({ current, total, message });
        });
        setSegments(segments);
        setProcessingProgress(null);
      } else {
        const fd = new FormData();
        fd.append("file", audioFile);
        const transcribeRes = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!transcribeRes.ok) throw new Error(await transcribeRes.text());
        const json = await transcribeRes.json();
        setSegments(json.segments);
      }
      
      setStep(2);
      setDownloadProgress("");
      setYoutubeInfo(null);
    } catch (e: any) {
      setError(e?.message || "下載或轉譯失敗");
      setDownloadProgress("");
      setProcessingProgress(null);
      console.error("YouTube download error:", e);
    }
  }

  async function speak() {
    if (!text.trim()) {
      setError("請先輸入文字");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "語音產生失敗");
      }
      const arrayBuffer = await res.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
      }
    } catch (e: any) {
      setError(e?.message || "發生錯誤");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSpeak() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void speak();
    }, 400);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <StepBar step={step} />

      <main className="mx-auto max-w-3xl p-4 space-y-6">
        {/* Step 1 */}
        <section className="card">
          <h2 className="text-lg font-semibold">1) 上傳音訊/影片或 YouTube 連結</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
            支援 mp3/mp4 檔案上傳，或直接輸入 YouTube 連結下載。
          </p>
          
          {/* YouTube 下載區塊 */}
          <div className="mt-4 p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-900/20">
            <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-3">🎥 YouTube 轉譯</h3>
            <form
              className="space-y-3"
              onSubmit={youtubeForm.handleSubmit(fetchYouTubeInfo)}
            >
              <div>
                <input
                  type="text"
                  placeholder="貼上 YouTube 連結..."
                  className="input w-full"
                  {...youtubeForm.register("url")}
                />
                {youtubeForm.formState.errors.url && (
                  <p className="text-red-600 text-sm mt-1">
                    {youtubeForm.formState.errors.url.message}
                  </p>
                )}
              </div>
              
              <div className="flex gap-2">
                <button 
                  className="btn-primary flex-1"
                  type="submit"
                  disabled={youtubeForm.formState.isSubmitting || !!downloadProgress}
                >
                  {youtubeForm.formState.isSubmitting ? (
                    <div className="mr-2 size-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
                  ) : null}
                  獲取視頻信息
                </button>
                
                {youtubeInfo && (
                  <button
                    type="button"
                    className="btn-primary bg-green-600 hover:bg-green-700"
                    onClick={downloadYouTubeAudio}
                    disabled={!!downloadProgress || !!processingProgress}
                  >
                    下載並轉譯
                  </button>
                )}
              </div>
            </form>
            
            {youtubeInfo && (
              <div className="mt-4 p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                <div className="flex gap-3">
                  {youtubeInfo.thumbnail && (
                    <img 
                      src={youtubeInfo.thumbnail} 
                      alt="thumbnail"
                      className="w-20 h-15 object-cover rounded"
                    />
                  )}
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{youtubeInfo.title}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {youtubeInfo.author} • {Math.floor(youtubeInfo.duration / 60)}:{(youtubeInfo.duration % 60).toString().padStart(2, '0')}
                    </p>
                    {youtubeInfo.isLive && (
                      <span className="inline-block mt-1 px-2 py-1 bg-red-100 text-red-600 text-xs rounded">
                        🔴 直播中
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {downloadProgress && (
              <p className="text-blue-600 text-sm mt-2 flex items-center">
                <div className="mr-2 size-4 animate-spin border-2 border-blue-600 border-t-transparent rounded-full" />
                {downloadProgress}
              </p>
            )}
          </div>
          
          <div className="mt-4 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">或</span>
            </div>
          </div>
          <form
            className="mt-4 grid gap-3"
            onSubmit={uploadForm.handleSubmit(onUpload)}
          >
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">📁 本地檔案上傳</label>
            <input
              type="file"
              accept="audio/*,video/*"
              className="input"
              {...uploadForm.register("file")}
            />
            {uploadForm.formState.errors.file && (
              <p className="text-red-600 text-sm">
                {uploadForm.formState.errors.file.message}
              </p>
            )}
            <button
              className="btn-primary w-fit"
              type="submit"
              disabled={uploadForm.formState.isSubmitting}
            >
              {uploadForm.formState.isSubmitting ? (
                <div className="mr-2 size-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
              ) : null}{" "}
              送出轉譯
            </button>
            {uploadProgress && (
              <p className="text-blue-600 text-sm mt-2 flex items-center">
                <div className="mr-2 size-4 animate-spin border-2 border-blue-600 border-t-transparent rounded-full" />
                {uploadProgress}
              </p>
            )}
            {processingProgress && (
              <div className="mt-2 space-y-2">
                <p className="text-blue-600 text-sm flex items-center">
                  <div className="mr-2 size-4 animate-spin border-2 border-blue-600 border-t-transparent rounded-full" />
                  {processingProgress.message}
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${(processingProgress.current / processingProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {processingProgress.current} / {processingProgress.total} 完成
                </p>
              </div>
            )}
            {error && (
              <p className="text-red-600 text-sm mt-2">{error}</p>
            )}
          </form>
        </section>

        {segments.length > 0 && (
          <section className="card">
            <h2 className="text-lg font-semibold">2) 檢視並微調原文逐句</h2>
            <form
              className="mt-3 space-y-3"
              onSubmit={translateForm.handleSubmit(onTranslate)}
            >
              <div className="grid gap-2 max-h-64 overflow-auto pr-2">
                {translateForm.watch("segments").map((s, idx) => (
                  <div
                    key={s.id}
                    className={`rounded-lg border border-gray-200 dark:border-gray-700 p-3 ${
                      idx % 2 ? "bg-gray-50 dark:bg-gray-800/40" : ""
                    }`}
                  >
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      [{s.start.toFixed(2)}s - {s.end.toFixed(2)}s]
                    </div>
                    <textarea
                      className="input mt-1"
                      defaultValue={s.text}
                      {...translateForm.register(
                        `segments.${idx}.text` as const
                      )}
                    />
                    <input
                      type="hidden"
                      value={s.id}
                      {...translateForm.register(`segments.${idx}.id` as const)}
                    />
                    <input
                      type="hidden"
                      value={s.start}
                      {...translateForm.register(
                        `segments.${idx}.start` as const,
                        { valueAsNumber: true }
                      )}
                    />
                    <input
                      type="hidden"
                      value={s.end}
                      {...translateForm.register(
                        `segments.${idx}.end` as const,
                        { valueAsNumber: true }
                      )}
                    />
                  </div>
                ))}
              </div>
              <button className="btn-primary" type="submit">
                {translateForm.formState.isSubmitting ? (
                  <div className="mr-2 size-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
                ) : null}{" "}
                送出英文口語化
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );

  // return (
  //   <div className="bg-[var(--background-color)] text-[var(--text-primary)]">
  //     <div className="flex flex-col min-h-screen justify-between mx-auto max-w-md bg-white">
  //       <header className="flex items-center justify-between p-6">
  //         <div className="w-8" />
  //         <h1 className="text-xl font-semibold text-[var(--text-primary)] flex-grow text-center">
  //           Voice Assistant
  //         </h1>
  //         <button
  //           className="text-gray-400 hover:text-black"
  //           type="button"
  //           aria-label="Alert"
  //         >
  //           <svg
  //             className="h-6 w-6"
  //             fill="none"
  //             stroke="currentColor"
  //             viewBox="0 0 24 24"
  //             xmlns="http://www.w3.org/2000/svg"
  //           >
  //             <path
  //               d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
  //               strokeLinecap="round"
  //               strokeLinejoin="round"
  //               strokeWidth="2"
  //             />
  //           </svg>
  //         </button>
  //       </header>

  //       <main className="flex-grow flex flex-col justify-center items-center px-6 w-full">
  //         <div className="w-full text-center">
  //           <label
  //             htmlFor="voice-input"
  //             className="text-base text-[var(--text-secondary)] transition-all duration-300"
  //           >
  //             Say something...
  //           </label>
  //           <div className="relative mt-2">
  //             <textarea
  //               id="voice-input"
  //               className="input-premium text-left resize-y min-h-[120px]"
  //               placeholder=""
  //               value={text}
  //               onChange={(e) => setText(e.target.value)}
  //               rows={4}
  //             />
  //             <div className="input-underline absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary-color)]" />
  //           </div>

  //           <div className="mt-6 flex items-center justify-center gap-3">
  //             <label
  //               htmlFor="voice-select"
  //               className="text-sm text-[var(--text-secondary)]"
  //             >
  //               Voice
  //             </label>
  //             <select
  //               id="voice-select"
  //               className="rounded-md border-gray-300 text-sm"
  //               value={voice}
  //               onChange={(e) => setVoice(e.target.value)}
  //             >
  //               {VOICES.map((v) => (
  //                 <option key={v.id} value={v.id}>
  //                   {v.label}
  //                 </option>
  //               ))}
  //             </select>
  //           </div>

  //           {error ? (
  //             <p className="mt-3 text-sm text-red-600">{error}</p>
  //           ) : null}
  //         </div>
  //       </main>

  //       <footer className="p-6 space-y-4">
  //         <button
  //           onClick={handleSpeak}
  //           disabled={isLoading}
  //           className="w-20 h-20 flex items-center justify-center rounded-full bg-[var(--primary-color)] hover:bg-gray-800 transition-all duration-300 shadow-lg hover:shadow-xl active:shadow-md transform active:scale-95 focus:outline-none focus:ring-4 focus:ring-gray-300 focus:ring-opacity-50 mx-auto disabled:opacity-60"
  //         >
  //           {isLoading ? (
  //             <svg
  //               className="animate-spin text-white"
  //               xmlns="http://www.w3.org/2000/svg"
  //               width="28"
  //               height="28"
  //               viewBox="0 0 24 24"
  //               fill="none"
  //               stroke="currentColor"
  //               strokeWidth="2"
  //               strokeLinecap="round"
  //               strokeLinejoin="round"
  //             >
  //               <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  //             </svg>
  //           ) : (
  //             <svg
  //               className="text-white"
  //               fill="currentColor"
  //               height="32"
  //               viewBox="0 0 24 24"
  //               width="32"
  //               xmlns="http://www.w3.org/2000/svg"
  //             >
  //               <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"></path>
  //             </svg>
  //           )}
  //         </button>
  //         <div className="text-center">
  //           <a
  //             className="text-sm text-[var(--text-secondary)] hover:text-[var(--primary-color)] hover:underline"
  //             href="#"
  //           >
  //             Help
  //           </a>
  //         </div>
  //         <audio ref={audioRef} className="hidden" />
  //       </footer>
  //     </div>
  //   </div>
  // );
}
