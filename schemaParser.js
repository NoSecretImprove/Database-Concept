const fs = require('fs');
const schema = fs.readFileSync("./schema").toString();

let obj = {};
let dbObj = {};

let databaseName;
let currentField ;
let currentFieldValue;

function resetState() {
    dbObj = { fields: [] };
    databaseName = "";
    currentField = null;
    currentFieldValue = null;
}
resetState();

const typeEnum = {
    Int8: 0,
    UInt8: 1,
    Int16: 2,
    UInt16: 3,
    Int32: 4,
    UInt32: 5,
    Int64: 6,
    UInt64: 7,
    Int128: 8,
    UInt128: 9,
    Double: 10,
    Float: 11,
    String: 12,
    Buffer: 13,
    Boolean: 14
}

const fieldRegex = /^([A-z]*)({\d*})?(!?)$/;

function decodeFieldValue(input) {
    const inputMatch = input.match(fieldRegex);

    if (!inputMatch) throw TypeError("Invalid Type: " + type);

    const type = inputMatch[1];

    if (!typeEnum[type]) throw TypeError("Invalid Type: " + type);

    let returnValue = { type: typeEnum[type], required: inputMatch[3] === "!" };

    const lengthStr = inputMatch[2];

    if (lengthStr) {
        if (type == "String" || type == "Buffer") {
            returnValue.length = parseInt(lengthStr.slice(1, -1));
        } else {
            throw Error("Type doesn't have paramater.")
        }
    }

    return returnValue;
}

for (const char of schema) {
    if (char == "\t") continue;
    if (char == "\r") continue;
    if (char == " ") continue;

    if (currentFieldValue !== null) {
        if (char == "\n") {
            dbObj.fields.push({
                ...decodeFieldValue(currentFieldValue),
                name: currentField
            });
            currentField = "";
            currentFieldValue = null;
        } else {
            currentFieldValue += char;
        }
    } else if (currentField !== null) {
        if (char == "}" && currentField == "") {
            obj[databaseName] = dbObj;
            resetState();
            continue;
        }

        if (char == "\n") {
            if (currentField !== "") throw Error("New Line before field was finished.");
            continue;
        }
        if (char == ":") {
            currentFieldValue = ""
        } else {
            currentField += char;
        }
    } else {
        if (char == "\n") {
            if (databaseName !== "") throw Error("New Line before name was finished.");
            continue;
        }

        if (char == "{") {
            currentField = "";
        } else {
            databaseName += char;
        }
    }
}

fs.writeFileSync("./config.json", JSON.stringify(obj, null, 2))
