import { z } from 'zod';

export const UploadSchema = z.object({
  file: z.any().refine((files) => {
    return files instanceof FileList && files.length > 0 && files[0].size > 0;
  }, {
    message: '請選擇檔案',
  }),
});

export const TranslateSchema = z.object({
  segments: z.array(z.object({
    id: z.string(),
    start: z.number().min(0),
    end: z.number().min(0),
    text: z.string().min(1),
  })).min(1),
});

export const YouTubeSchema = z.object({
  url: z.string().url().refine((url) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    return youtubeRegex.test(url);
  }, { message: '請輸入有效的 YouTube URL' }),
});

// export const TTSSchema = z.object({
//   voice: z.enum(['alloy','ash','coral','echo','fable','onyx','nova','sage','shimmer']).default('alloy'),
//   text: z.string().min(1),
// })