const MAX_SIDE_PX = 1600;
const JPEG_QUALITY = 0.85;
const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Большой файл, который сервер режет на лету, браузер иногда показывает как сетевую ошибку
// (Connection: close до того, как дочитана загрузка). Поэтому сжимаем картинку здесь:
// аватарки и фон всё равно отображаются маленькими, терять качество заметно не нужно.
export const prepareImageForUpload = async (file: File): Promise<File> => {
  if (file.type === "image/gif") {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("Файл больше 20 МБ");
    return file;
  }
  if (file.size <= SKIP_BELOW_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось обработать картинку");
  // Прозрачный фон PNG в JPEG станет чёрным - заливаем белым заранее.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) throw new Error("Не удалось сжать картинку");

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  const compressed = new File([blob], name, { type: "image/jpeg" });
  if (compressed.size > MAX_UPLOAD_BYTES) throw new Error("Картинка слишком большая даже после сжатия");
  return compressed;
};
