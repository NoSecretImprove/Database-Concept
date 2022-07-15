const schema = require("./config.json");
const UInt32Max = 4294967295n;

function normalizeBuffer(input) {
    if (input instanceof Buffer) {
        return input;
    }

    return Buffer.from(input);
}

const emptyBuffer = Buffer.from([]);

function encodeField(field, value) {
    switch (field.type) {
        case 0: {
            const buf = Buffer.alloc(1);
            buf.writeInt8(value);

            return buf;
        }
        case 1: {
            const buf = Buffer.alloc(1);
            buf.writeUInt8(value);

            return buf;
        }
        case 2: {
            const buf = Buffer.alloc(2);
            buf.writeInt16BE(value);

            return buf;
        }
        case 3: {
            const buf = Buffer.alloc(2);
            buf.writeUInt16BE(value);

            return buf;
        }
        case 4: {
            const buf = Buffer.alloc(4);
            buf.writeInt32BE(value);

            return buf;
        }
        case 5: {
            const buf = Buffer.alloc(4);
            buf.writeUInt32BE(value);

            return buf;
        }
        case 6: {
            const buf = Buffer.alloc(8);
            buf.writeInt64BE(value);

            return buf;
        }
        case 7: {
            const buf = Buffer.alloc(8);
            buf.writeUInt64BE(value);

            return buf;
        }

        case 8: {
            const UIntValue = BigInt.asUintN(128, value);
            const buf = Buffer.alloc(16);
            buf.writeBigUInt64BE(UIntValue >> 64n);
            buf.writeBigUInt64BE(UIntValue & 0xffffffffffffffffn, 8);

            return buf;
        }

        case 9: {
            const buf = Buffer.alloc(16);
            buf.writeBigUInt64BE(value >> 64n);
            buf.writeBigUInt64BE(value & 0xffffffffffffffffn, 8);

            return buf;
        }

        case 10: {
            const buf = Buffer.alloc(8);
            buf.writeDoubleBE(value);

            return buf;
        }

        case 11: {
            const buf = Buffer.alloc(4);
            buf.writeFloatBE(value);

            return buf;
        }

        case 12:
        case 13: {
            const normalizedBuffer = normalizeBuffer(value);
            const hasLength = typeof field.length === "number";
            if (hasLength) {
                if (normalizedBuffer.length !== field.length) throw Error("Invalid Length.");
                return normalizedBuffer;
            } else {
                if (normalizedBuffer.length > UInt32Max) throw Error("Length can't fit in UInt32.");

                const buf = Buffer.alloc(4 + normalizedBuffer.length);
                buf.writeUInt32BE(normalizedBuffer.length, 0);
                buf.set(normalizedBuffer, 4);

                return buf;
            }
        }

        default: {
            return emptyBuffer
        }
    }
}

function decodeField(field, stream) {
    switch (field.type) {
        case 0: {
            return stream.read(1).readInt8BE();
        }

        case 1: {
            return stream.read(1).readUInt8BE();
        }

        case 2: {
            return stream.read(2).readInt16BE();
        }

        case 3: {
            return stream.read(2).readUInt16BE();
        }

        case 4: {
            return stream.read(4).readInt32BE();
        }

        case 5: {
            return stream.read(4).readUInt32BE();
        }

        case 6: {
            return stream.read(8).readBigUInt64BE();
        }

        case 7: {
            return stream.read(8).readBigUInt64BE();
        }

        case 8: {
            const buf = stream.read(16);
            let val = buf.readBigUInt64BE() << 64n;
            val |= buf.readBigUInt64BE(8);

            return BigInt.asIntN(128, val);
        }

        case 9: {
            const buf = stream.read(16);
            let val = buf.readBigUInt64BE() << 64n;
            val |= buf.readBigUInt64BE(8);

            return val;
        }

        case 10: {
            return stream.read(8).readDoubleBE();
        }

        case 12: {
            const hasLength = typeof field.length === "number";
            if (hasLength) {
                return stream.read(field.length).toString();
            } else {
                const bufSize = stream.read(4).readUInt32BE();
                return stream.read(bufSize).toString();
            }
        }
        
        case 13: {
            const hasLength = typeof field.length === "number";
            if (hasLength) {
                return stream.read(field.length);
            } else {
                const bufSize = stream.read(4).readUInt32BE();
                return stream.read(bufSize);
            }
        }

        default: {
            throw Error("Invalid Type.")
        }
    }
}

function computeBytes(bits) {
    const rem = bits & 7n;
    return (bits >> 3n) + BigInt(rem >= 1n);
}

function encodeByteN(bits, N) {
    const hex = bits.toString(16).padStart(Number(N * 2n), "0");

    return Buffer.from(hex, "hex");
}

function encodeSchema(schema, obj) {
    let bufferArray = [];
    let bitIndex = 0n;
    let bits = 0n;
    
    for (const field of schema.fields) {
        const value = obj[field.name];
        if (field.type == 14) {
            if (typeof value == "undefined") {
                if (field.required) throw Error(`Type '${field.name}' is required.`);
            } else if (value) {
                bits |= (1n << bitIndex);
            }
            bitIndex++;
        } else {
            if (field.required) {
                if (typeof value == "undefined") {
                    if (field.required) throw Error(`Type '${field.name}' is required.`);
                }
            } else {
                if (typeof value != "undefined") {
                    bits |= (1n << bitIndex);
                }
                bitIndex++;
            }

            if (value) {
                bufferArray.push(encodeField(field, value))
            }
        }
    }

    const flagByteLength = computeBytes(bitIndex);
    const flagBytes = encodeByteN(bits, flagByteLength)

    return Buffer.concat([
        flagBytes,
        ...bufferArray
    ])
}

class DecodeStream {
    constructor(buf) {
        this.pos = 0;
        this.buf = buf;
    }

    read(length) {
        const buf = this.buf.subarray(this.pos, this.pos + Number(length));
        this.pos += Number(length);

        return buf;
    }
}

function decodeSchema(schema, buf) {
    let flagSize = 0n;
    let flagIndex = 0n;
    for (const field of schema.fields) {
        if (field.type == 14 || field.required != true) flagSize++;
    }
    flagSize = computeBytes(flagSize);

    const stream = new DecodeStream(buf);
    const flags = BigInt("0x" + stream.read(flagSize).toString("hex"));

    const obj = {};
    for (const field of schema.fields) {
        if (field.type == 14) {
            obj[field.name] = (flags & (1n << flagIndex)) != 0;
            flagIndex++;
        } else {
            let exists = true;
            if (field.required != true) {
                exists = (flags & (1n << flagIndex)) != 0;
                flagIndex++;
            }
            if (exists) {
                obj[field.name] = decodeField(field, stream);
            }
            
        }
    }

    return obj;
}

console.log(decodeSchema(
    schema.users,
    encodeSchema(schema.users, {
        username: "NoSecretImprove",
        passwordSalt: Buffer.from("43574fd420fd9aec48227b1c89bbd34c", "hex"),
        passwordHash: Buffer.from("083c93e1cea4b90607403f0a5540315f0ac59b0d4f825f10441201f4889f432a", "hex"),
        isAdmin: true
    })
))

//console.log(encodeField({type:12, length: 3}, "hi"));