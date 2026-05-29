import zlib from "node:zlib";
import { unzipSync } from "fflate";

/** CRC-32 (IEEE) para cabeçalhos ZIP. */
function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Buffer };

/**
 * Monta um arquivo ZIP (método DEFLATE) apenas com APIs do Node.
 */
export function buildZipBuffer(entries: ZipEntry[]): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, "utf8");
        const compressed = zlib.deflateRawSync(entry.data);
        const crc = crc32(entry.data);
        const useStore = compressed.length >= entry.data.length;
        const payload = useStore ? entry.data : compressed;
        const method = useStore ? 0 : 8;

        const local = Buffer.alloc(30 + nameBuf.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(method, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(0, 10);
        local.writeUInt32LE(crc, 12);
        local.writeUInt32LE(payload.length, 16);
        local.writeUInt32LE(entry.data.length, 20);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        nameBuf.copy(local, 30);

        localParts.push(local, payload);

        const central = Buffer.alloc(46 + nameBuf.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(method, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(payload.length, 20);
        central.writeUInt32LE(entry.data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(0, 38);
        central.writeUInt32LE(offset, 42);
        nameBuf.copy(central, 46);
        centralParts.push(central);

        offset += local.length + payload.length;
    }

    const centralDir = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDir.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDir, end]);
}

/** Decodifica entrada de texto do ZIP (JSON) mesmo se ainda vier compactada. */
export function decodeZipUtf8Entry(buf: Buffer): string {
    const head = buf.subarray(0, Math.min(buf.length, 16));
    const looksUtf8Json =
        head.length > 0 &&
        (head[0] === 0x7b || head[0] === 0x5b || head[0] === 0xef); // { [ BOM

    if (looksUtf8Json) {
        return buf.toString("utf8");
    }

    try {
        return zlib.inflateRawSync(buf).toString("utf8");
    } catch {
        return zlib.inflateSync(buf).toString("utf8");
    }
}

/**
 * Extrai entradas de um ZIP (DEFLATE/STORE, ZIP grande).
 * Usa `fflate` — parser manual falhava em pacotes completos grandes.
 */
export function parseZipBuffer(zipBuf: Buffer): ZipEntry[] {
    if (zipBuf.length < 22) {
        throw new Error("ZIP: arquivo muito pequeno");
    }

    try {
        const unzipped = unzipSync(new Uint8Array(zipBuf));
        const files: ZipEntry[] = [];
        for (const [name, data] of Object.entries(unzipped)) {
            if (!name || name.endsWith("/")) continue;
            files.push({ name, data: Buffer.from(data) });
        }
        if (files.length === 0) {
            throw new Error("ZIP: nenhuma entrada encontrada");
        }
        return files;
    } catch (err) {
        const detail = err instanceof Error ? err.message : "erro desconhecido";
        throw new Error(`ZIP: falha ao extrair (${detail})`);
    }
}
