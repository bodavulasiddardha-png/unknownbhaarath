import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadImage(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: 'unknownbhaarath',
        resource_type: 'image',
        format: 'jpg',
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

export async function uploadAll(buffers) {
  const urls = [];
  const ts = Date.now();
  for (let i = 0; i < buffers.length; i++) {
    const url = await uploadImage(buffers[i], `slide_${ts}_${i}`);
    urls.push(url);
  }
  return urls;
}

// Clean up old images (older than 1 day) to stay within free tier
export async function cleanupOld() {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'unknownbhaarath/',
      max_results: 100,
    });
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const res of result.resources) {
      if (new Date(res.created_at).getTime() < oneDayAgo) {
        await cloudinary.uploader.destroy(res.public_id);
      }
    }
  } catch (e) {
    console.warn('[Cloudinary] cleanup skipped:', e.message);
  }
}
