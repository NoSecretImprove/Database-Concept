var lmdb = require('node-lmdb');
var env = new lmdb.Env();
env.open({
    path: __dirname + "/data",
    maxDbs: 100
});

var indexTable = env.openDbi({
    name: "indexTable",
    create: true
})
