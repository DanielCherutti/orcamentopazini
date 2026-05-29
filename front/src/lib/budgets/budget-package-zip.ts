import zlib from "node:zlib";

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

type ZipFile = { name: string; data: Buffer };

/** Lê entradas de um ZIP (DEFLATE ou STORE). */
export function parseZipBuffer(zipBuf: Buffer): ZipFile[] {
    const files: ZipFile[] = [];
    let pos = 0;

    while (pos + 30 <= zipBuf.length) {
        const sig = zipBuf.readUInt32LE(pos);
        if (sig === 0x06054b50) break;
        if (sig !== 0x04034b50) {
            pos++;
            continue;
        }

        const method = zipBuf.readUInt16LE(pos + 6);
        const compSize = zipBuf.readUInt32LE(pos + 18);
        const uncompSize = zipBuf.readUInt32LE(pos + 22);
        const nameLen = zipBuf.readUInt16LE(pos + 26);
        const extraLen = zipBuf.readUInt16LE(pos + 28);
        const nameStart = pos + 30;
        const name = zipBuf.subarray(nameStart, nameStart + nameLen).toString("utf8");
        const dataStart = nameStart + nameLen + extraLen;
        const compData = zipBuf.subarray(dataStart, dataStart + compSize);

        let data: Buffer;
        if (method === 0) {
            data = compData;
        } else if (method === 8) {
            data = zlib.inflateRawSync(compData);
            if (data.length !== uncompSize) {
                throw new Error(`ZIP: tamanho inválido em ${name}`);
            }
        } else {
            throw new Error(`ZIP: método não suportado (${method}) em ${name}`);
        }

        files.push({ name, data });
        pos = dataStart + compSize;
    }

    return files;
}
