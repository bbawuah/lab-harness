import { readSync } from "node:fs";
import { AppearanceError } from "./appearance.ts";

/** Bound bytes actually read, even if the open file grows after fstat. */
type Reader = (fd: number, buffer: Buffer, offset: number, length: number, position: null) => number;
export function readAppearanceBytes(fd: number, reader: Reader = readSync): Buffer {
 const bytes=Buffer.alloc(65537); let offset=0;
 while(offset<bytes.length) {
  const count=reader(fd,bytes,offset,bytes.length-offset,null);
  if(count===0) return bytes.subarray(0,offset);
  offset+=count;
 }
 throw new AppearanceError("INVALID_STORE");
}
