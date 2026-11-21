/** 从原始文件头识别支持的图片格式；系统选择器提供的 MIME 和扩展名可能不一致。 */
export function imageMimeFromBytes(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 &&
    bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
  return null;
}
