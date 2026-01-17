/**
 * Client-side image compression utility
 * Compresses images before upload to reduce file size and prevent server errors
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;  // 0 to 1
  maxSizeMB?: number;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.8,
  maxSizeMB: 1.5  // Compress to under 1.5MB (server limit is 2MB)
};

/**
 * Compress an image file using canvas
 * @param file - Original image file
 * @param options - Compression options
 * @returns Compressed file as a new File object
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Skip non-image files
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // Skip if already small enough
  const maxSizeBytes = (opts.maxSizeMB || 1.5) * 1024 * 1024;
  if (file.size <= maxSizeBytes) {
    console.log(`📷 Image already small (${(file.size / 1024).toFixed(1)}KB), skipping compression`);
    return file;
  }

  console.log(`📷 Compressing image from ${(file.size / 1024 / 1024).toFixed(2)}MB...`);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        const maxW = opts.maxWidth || 800;
        const maxH = opts.maxHeight || 800;

        if (width > maxW || height > maxH) {
          const ratio = Math.min(maxW / width, maxH / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Use white background for JPEG (avoids black background on transparent PNGs)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob with quality setting
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            // Create new File with same name
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, '.jpg'), // Convert to jpg
              { type: 'image/jpeg', lastModified: Date.now() }
            );

            console.log(`✅ Compressed: ${(file.size / 1024).toFixed(1)}KB → ${(compressedFile.size / 1024).toFixed(1)}KB (${Math.round((1 - compressedFile.size / file.size) * 100)}% reduction)`);
            
            resolve(compressedFile);
          },
          'image/jpeg',
          opts.quality || 0.8
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
