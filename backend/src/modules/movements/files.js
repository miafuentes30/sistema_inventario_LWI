// Pure validation contract; no storage adapter or successful upload is simulated.
function inspectFile(buffer, maximumBytes = 5 * 1024 * 1024) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > maximumBytes) throw new Error("INVALID_FILE_SIZE");
  if (buffer.subarray(0,5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return "image/jpeg";
  throw new Error("INVALID_FILE_SIGNATURE");
}
module.exports = { inspectFile };
