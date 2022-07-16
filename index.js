const schema = require("./config.json");

const UInt16Max = 65535;
const UInt32Max = 4294967295;
const UInt64Max = 18446744073709551615n;
const UInt128Max = 340282366920938463463374607431768211455n;

const Int16Max = 32767;
const Int16Min = -32768;

const Int32Max = 2147483647;
const Int32Min = -2147483648;

const Int64Max = 9223372036854775807n;
const Int64Min = -9223372036854775808n;

const Int128Max = 170141183460469231731687303715884105727n;
const Int128Min = -170141183460469231731687303715884105728n;

function normalizeBuffer(input) {
    if (input instanceof Buffer) {
        return input;
    }

    if (typeof input == "string") {
        return Buffer.from(input, "binary")
    }

    return Buffer.from(input);
}

const emptyBuffer = Buffer.from([]);

function encodeField(field, value) {
    switch (field.type) {
        case 0: {
            if (value < -127 || value > 127) throw Error("Invalid Int8");
            const buf = Buffer.alloc(1);
            buf.writeInt8(value);

            return buf;
        }
        case 1: {
            if (value < 0 || value > 256) throw Error("Invalid UInt8");
            const buf = Buffer.alloc(1);
            buf.writeUInt8(value);

            return buf;
        }
        case 2: {
            if (value < Int16Min || value > Int16Max) throw Error("Invalid Int16");
            const buf = Buffer.alloc(2);
            buf.writeInt16BE(value);

            return buf;
        }
        case 3: {
            if (value < 0 || value > UInt16Max) throw Error("Invalid UInt16");
            const buf = Buffer.alloc(2);
            buf.writeUInt16BE(value);

            return buf;
        }
        case 4: {
            if (value < Int32Min || value > Int32Max) throw Error("Invalid Int32");
            const buf = Buffer.alloc(4);
            buf.writeInt32BE(value);

            return buf;
        }
        case 5: {
            if (value < 0 || value > UInt32Max) throw Error("Invalid UInt32");
            const buf = Buffer.alloc(4);
            buf.writeUInt32BE(value);

            return buf;
        }
        case 6: {
            if (value < Int64Min || value > Int64Max) throw Error("Invalid Int64");
            const buf = Buffer.alloc(8);
            buf.writeBigInt64BE(value);

            return buf;
        }
        case 7: {
            if (value < 0n || value > UInt64Max) throw Error("Invalid UInt64");
            const buf = Buffer.alloc(8);
            buf.writeBigUInt64BE(value);

            return buf;
        }

        case 8: {
            if (value < Int128Min || value > Int128Max) throw Error("Invalid Int128");
            const UIntValue = BigInt.asUintN(128, value);
            const buf = Buffer.alloc(16);
            buf.writeBigUInt64BE(UIntValue >> 64n);
            buf.writeBigUInt64BE(UIntValue & 0xffffffffffffffffn, 8);

            return buf;
        }

        case 9: {
            if (value < 0n || value > UInt128Max) throw Error("Invalid UInt128");
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
            return stream.read(1).readInt8();
        }

        case 1: {
            return stream.read(1).readUInt8();
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
            return stream.read(8).readBigInt64BE();
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

        case 11: {
            return stream.read(4).readFloatBE();
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
            const valueExists = typeof value != "undefined";

            if (field.required) {
                if (!valueExists) {
                    if (field.required) throw Error(`Type '${field.name}' is required.`);
                }
            } else {
                if (valueExists) {
                    bits |= (1n << bitIndex);
                }
                bitIndex++;
            }

            if (valueExists) {
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
            continue;
        }
        let exists = true;
        if (field.required != true) {
            exists = (flags & (1n << flagIndex)) != 0;
            flagIndex++;
        }
        if (exists) {
            obj[field.name] = decodeField(field, stream);
        }
    }

    return obj;
}

// Example

const json = {
    i8: -127,
    u8: 255,
    i16: -32768,
    u16: 65535,
    i32: -2147483648,
    u32: 4294967295,
    i64: -9223372036854775808n,
    u64: 18446744073709551615n,
    i128: -170141183460469231731687303715884105728n,
    u128: 340282366920938463463374607431768211455n,
    double: 1.175494351E-38,
    float: 1.175494351E-380,
    len_str: "Hello, World",
    str: "I can type anything of any length, fr?",
    len_buf: Buffer.from("43574fd420fd9aec48227b1c", "hex"),
    buf: Buffer.from("Any length? god damm")
}

const encoded = encodeSchema(schema.allTypes, json)


console.log(decodeSchema(
    schema.allTypes,
    encoded
))

//console.log(encodeField({type:12, length: 3}, "hi"));