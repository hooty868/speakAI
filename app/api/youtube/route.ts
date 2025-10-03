import { NextRequest, NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import { unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes timeout

// 設置 FFmpeg 路徑
ffmpeg.setFfmpegPath("/opt/homebrew/bin/ffmpeg");
ffmpeg.setFfprobePath("/opt/homebrew/bin/ffprobe");

// User-Agent 列表
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// YouTube URL 驗證
function isValidYouTubeUrl(url: string): boolean {
  const youtubeRegex =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  return youtubeRegex.test(url);
}

// 提取 YouTube 視頻 ID
function extractVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
  );
  return match ? match[1] : null;
}

// 清理檔案名稱
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, "") // 移除檔案系統不允許的字符
    .replace(/\s+/g, "_") // 空格轉下劃線
    .replace(/[^\w\u4e00-\u9fff\s-_]/g, "") // 保留中文字符、英文字母、數字、空格、連字符和下劃線
    .substring(0, 100); // 限制長度
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    const quality = searchParams.get("quality") || "highestaudio";

    // 驗證 URL 參數
    if (!url) {
      return NextResponse.json(
        { error: "請提供 YouTube URL" },
        { status: 400 }
      );
    }

    if (!isValidYouTubeUrl(url)) {
      return NextResponse.json(
        { error: "無效的 YouTube URL" },
        { status: 400 }
      );
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: "無法提取視頻 ID" }, { status: 400 });
    }

    // 檢查視頻可用性
    try {
      // 添加重試機制
      let info: any = null;
      let retries = 3;
      
              while (retries > 0) {
          try {
            info = await ytdl.getBasicInfo(url, {
              requestOptions: {
                headers: {
                  'User-Agent': getRandomUserAgent()
                }
              }
            });
            break;
          } catch (error: any) {
            retries--;
            if (retries === 0) throw error;
            
            console.log(`重試獲取視頻信息 (剩餘 ${retries} 次)...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
          }
        }
      
      if (!info) {
        throw new Error("無法獲取視頻信息");
      }
      
      const videoDetails = info.videoDetails;

      // 檢查視頻長度（限制在 2 小時內）
      const duration = parseInt(videoDetails.lengthSeconds);
      if (duration > 7200) {
        // 2 hours
        return NextResponse.json(
          {
            error: "視頻太長，請選擇 2 小時以內的視頻",
          },
          { status: 400 }
        );
      }

      // 檢查是否為私人或受限視頻
      if (videoDetails.isPrivate) {
        return NextResponse.json(
          { error: "無法下載私人視頻" },
          { status: 403 }
        );
      }

      // 創建臨時目錄
      const tempDir = path.join(process.cwd(), "temp");
      if (!existsSync(tempDir)) {
        await mkdir(tempDir, { recursive: true });
      }

      // 生成檔案名
      const sanitizedTitle = sanitizeFilename(videoDetails.title);
      const timestamp = Date.now();
      const outputMp3Path = path.join(
        tempDir,
        `${sanitizedTitle}_${timestamp}.mp3`
      );

      // 下載音訊流
      console.log(`開始下載: ${videoDetails.title}`);

      return new Promise<NextResponse>((resolve, reject) => {
        // 創建音訊下載流，添加更多選項來避免錯誤
        const audioStream = ytdl(url, {
          quality: quality as any,
          filter: "audioonly",
          highWaterMark: 1 << 25, // 32MB buffer
          requestOptions: {
            headers: {
              'User-Agent': getRandomUserAgent()
            }
          }
        });

        audioStream.on("progress", (chunkLength, downloaded, total) => {
          const percent = ((downloaded / total) * 100).toFixed(1);
          console.log(`下載進度: ${percent}%`);
        });

        // 使用 FFmpeg 轉換為 MP3
        const ffmpegCommand = ffmpeg()
          .input(audioStream)
          .audioCodec("libmp3lame")
          .audioBitrate("128k")
          .audioChannels(2)
          .audioFrequency(44100)
          .format("mp3")
          .outputOptions([
            '-avoid_negative_ts', 'make_zero',
            '-fflags', '+genpts'
          ])
          .on("start", (commandLine) => {
            console.log("FFmpeg 開始處理:", commandLine);
          })
          .on("progress", (progress) => {
            console.log(`轉換進度: ${progress.percent?.toFixed(1) || 0}%`);
          })
          .on("end", async () => {
            console.log("轉換完成");
            try {
              // 檢查檔案是否存在
              const fs = await import("fs");
              if (!fs.existsSync(outputMp3Path)) {
                throw new Error("MP3 檔案未生成");
              }
              
              // 讀取 MP3 檔案
              const mp3Buffer = fs.readFileSync(outputMp3Path);
              
              if (mp3Buffer.length === 0) {
                throw new Error("MP3 檔案為空");
              }

              // 清理臨時檔案
              try {
                await unlink(outputMp3Path);
              } catch (e) {
                console.warn("清理檔案失敗:", e);
              }

              // 返回 MP3 檔案
              // 對中文字符進行 URL 編碼以避免 HTTP 頭錯誤
              const encodedTitle = encodeURIComponent(sanitizedTitle);
              const encodedVideoTitle = encodeURIComponent(videoDetails.title);
              const encodedAuthor = encodeURIComponent(videoDetails.author.name);
              
              const response = new NextResponse(mp3Buffer, {
                headers: {
                  "Content-Type": "audio/mpeg",
                  "Content-Disposition": `attachment; filename*=UTF-8''${encodedTitle}.mp3`,
                  "Content-Length": mp3Buffer.length.toString(),
                  "X-Video-Title": encodedVideoTitle,
                  "X-Video-Duration": videoDetails.lengthSeconds,
                  "X-Video-Author": encodedAuthor,
                },
              });

              resolve(response);
            } catch (error) {
              console.error("讀取 MP3 檔案失敗:", error);
              console.error("檔案路徑:", outputMp3Path);
              console.error("視頻標題:", videoDetails.title);
              reject(new Error(`處理 MP3 檔案失敗: ${error instanceof Error ? error.message : String(error)}`));
            }
          })
          .on("error", async (error) => {
            console.error("FFmpeg 錯誤:", error);
            // 清理檔案
            try {
              await unlink(outputMp3Path);
            } catch (e) {}
            reject(error);
          });

        // 開始轉換
        ffmpegCommand.save(outputMp3Path);

        // 處理下載錯誤
        audioStream.on("error", (error) => {
          console.error("下載錯誤:", error);
          reject(error);
        });

        // 設置超時
        setTimeout(() => {
          reject(new Error("下載超時"));
        }, 300000); // 5 minutes
      });
    } catch (ytdlError: any) {
      console.error("YTDL 錯誤:", ytdlError);

      // 簡化錯誤處理
      let errorMessage = "無法處理此視頻";
      let statusCode = 500;

      if (
        ytdlError.message.includes("unavailable") ||
        ytdlError.message.includes("deleted")
      ) {
        errorMessage = "視頻不可用或已被刪除";
        statusCode = 404;
      } else if (
        ytdlError.message.includes("private") ||
        ytdlError.message.includes("restricted")
      ) {
        errorMessage = "無法存取此視頻（私人或受限）";
        statusCode = 403;
      }

      return NextResponse.json({ error: errorMessage }, { status: statusCode });
    }
  } catch (error: any) {
    console.error("YouTube API 錯誤:", error);
    return NextResponse.json(
      {
        error: "服務器錯誤",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// 獲取視頻信息的輔助 API
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || !isValidYouTubeUrl(url)) {
      return NextResponse.json(
        { error: "無效的 YouTube URL" },
        { status: 400 }
      );
    }

    const info = await ytdl.getBasicInfo(url);
    const videoDetails = info.videoDetails;

    return NextResponse.json({
      title: videoDetails.title,
      author: videoDetails.author.name,
      duration: parseInt(videoDetails.lengthSeconds),
      thumbnail:
        videoDetails.thumbnails?.[0]?.url ||
        videoDetails.thumbnail?.thumbnails?.[0]?.url,
      isLive: videoDetails.isLiveContent,
      isPrivate: videoDetails.isPrivate,
    });
  } catch (error: any) {
    console.error("獲取視頻信息錯誤:", error);
    return NextResponse.json(
      {
        error: "無法獲取視頻信息",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
