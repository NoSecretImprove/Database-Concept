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
            if (value < -128 || value > 127) throw Error("Invalid Int8");
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

function computeLength(field, stream) {
    switch (field.type) {
        case 0:
        case 1: {
            stream.skip(1)
            return 1;
        }

        case 2:
        case 3: {
            stream.skip(2)
            return 2;
        }
        
        case 4:
        case 5: {
            stream.skip(4)
            return 4;
        }

        case 6:
        case 7: {
            stream.skip(8)
            return 8;
        }

        case 8:
        case 9: {
            stream.skip(16)
            return 16;
        }

        case 10: {
            stream.skip(8)
            return 8;
        }

        case 11: {
            stream.skip(4)
            return 4;
        }

        case 12:
        case 13: {
            const hasLength = typeof field.length === "number";
            if (hasLength) {
                stream.skip(field.length);
                return field.length;
            } else {
                const bufSize = stream.read(4).readUInt32BE();
                stream.skip(bufSize)
                return 4 + bufSize;
            } 
        }

        case 14: {
            return 0;
        }

        default: {
            throw Error("Invalid Type")
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

    skip(length) {
        this.pos += Number(length);
    }

    read(length) {
        const buf = this.buf.subarray(this.pos, this.pos + Number(length));
        this.pos += Number(length);

        if (buf.length != length) throw Error("Buffer out of range.")

        return buf;
    }
}

class FlagReader {
    constructor(flags) {
        this.flags = flags;
        this.pos = 0n;
    }

    read() {
        const flag = (this.flags & 1n) != 0;
        this.flags >>= 1n;
        return flag;
    }
}

function decodeSchema(schema, buf) {
    let flagSize = 0n;
    for (const field of schema.fields) {
        if (field.type == 14 || field.required != true) flagSize++;
    }
    flagSize = computeBytes(flagSize);

    const stream = new DecodeStream(buf);
    let flagReader = new FlagReader(BigInt("0x" + (stream.read(flagSize).toString("hex") || "0")))

    const obj = {};
    for (const field of schema.fields) {
        if (field.type == 14) {
            obj[field.name] = flagReader.read();
            continue;
        }
        let exists = true;
        if (field.required != true) {
            exists = flagReader.read();
        }
        if (exists) {
            obj[field.name] = decodeField(field, stream);
        }
    }

    return obj;
}

function detectType(value) {
    const valueType = typeof value;
    switch (valueType) {
        case "boolean": {
            return 14;
        }

        case "string": {
            return 12;
        }

        case "number": {
            const isNegative = value < 0;
            if (isNegative) {
                if (value >= -128) {
                    return 0;
                } else if (value >= Int16Min) {
                    return 2
                } else if (value >= Int32Min) {
                    return 4
                } else {
                    return 10;
                }
            } else {
                if (value <= 255) {
                    return 1;
                } else if (value <= UInt16Max) {
                    return 3;
                }  else if (value <= UInt32Max) {
                    return 5;
                } else {
                    return 10;
                }
            }
        }

        case "bigint": {
            const isNegative = value < 0n;
            if (isNegative) {
                if (value >= Int64Min) {
                    return 6;
                } else if (value >= Int128Min) {
                    return 8;
                } else {
                    throw Error("Integer can't be more than 128 bits.");
                }
            } else {
                if (value <= UInt64Max) {
                    return 7;
                } else if (value <= UInt128Max) {
                    return 9;
                } else {
                    throw Error("Integer can't be more than 128 bits.");
                }
            }
        }
    }

    if (value instanceof Buffer) {
        return 13;
    } else {
        throw Error("Invalid Type");
    }
}

const ObjectKeyEnd = Buffer.from("0000", "hex");

function encodeObject(obj) {
    let flags = 0n;
    let flagIndex = 0n;

    let keyBufferArray = [];
    let valueBufferArray = [];

    for (const [key, value] of Object.entries(obj)) {
        const valueType = detectType(value);
        const keyBuffer = Buffer.from(key, "binary");
        if (keyBuffer.length > 0xfffn) throw Error("Key too large.");
        let keyEntry = Buffer.alloc(3 + keyBuffer.length);
        keyEntry.writeUInt16BE(keyBuffer.length);
        keyEntry.writeUInt8(valueType, 2);
        keyEntry.set(keyBuffer, 3);
        keyBufferArray.push(keyEntry);
        
        if (valueType == 14) {
            if (value) {
                flags |= (1n << flagIndex);
            }

            flagIndex++;
        } else {
            const encodedValue = encodeField({ type: valueType }, value);
            valueBufferArray.push(encodedValue)
        }
    }

    const flagByteLength = computeBytes(flagIndex);
    const flagBytes = encodeByteN(flags, flagByteLength)

    return Buffer.concat([
        ...keyBufferArray,
        ObjectKeyEnd,
        flagBytes,
        ...valueBufferArray
    ])
}

function decodeObject(buf) {
    let obj = {};

    const keys = [];
    let flagSize = 0n;
    const stream = new DecodeStream(buf);

    for (;;) {
        const keyLength = stream.read(2).readUInt16BE();
        if (keyLength == 0) break;
        const keyHeader = stream.read(1 + keyLength);
        const type = keyHeader[0];
        const key = keyHeader.subarray(1).toString("binary");

        if (type == 14) flagSize++;

        keys.push({key, type});
    }
    
    flagSize = computeBytes(flagSize);

    let flagReader = new FlagReader(BigInt("0x" + (stream.read(flagSize).toString("hex") || "0")))

    for (const {key, type} of keys) {
        if (type == 14) {
            obj[key] = flagReader.read();
        } else {
            obj[key] = decodeField({ type }, stream);
        }
    }

    return obj;
}

// Example

const encodedObj = encodeObject({
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
})

console.log(decodeObject(encodedObj))


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

function seralizeJSON(json) {
    const obj = {};
    for (const [key, value] of Object.entries(json)) {
        if (typeof value == "bigint") {
            obj[key] = value.toString() + "n"
        } else if (value instanceof Buffer) {
            obj[key] = value.toString("binary")
        } else {
            obj[key] = value
        }
    }

    return obj;
}

const encodedJSON = JSON.stringify(seralizeJSON(json));

const encoded = encodeSchema(schema.allTypes, json)

console.log(((encoded.length / encodedJSON.length) * 100).toFixed(0) + "% bytes less.\n")

console.log(decodeSchema(
    schema.allTypes,
    encoded
))

console.time("LMDB SCHEMA")
for (var i = 0; i < 10000; i++) {
    decodeSchema(
        schema.allTypes,
        encoded
    )
}
console.timeEnd("LMDB SCHEMA")

console.time("JSON")
for (var i = 0; i < 10000; i++) {
    JSON.parse(encodedJSON)
}
console.timeEnd("JSON")
//console.log(encodeField({type:12, length: 3}, "hi"));