#!/usr/bin/env node

var util = require('util');
var fs = require('fs');
var rpc = require('rpc-multistream');

var server = rpc({
    foo: rpc.readable(function() {
        return fs.createReadStream('foo.txt');
    }),
    bar: function(cb) {
        console.log("bar called");
        cb(null, "bar says hi");
    }
});

var client = rpc();

client.pipe(server).pipe(client)

client.on('remote', function(remote) {

    var stream = remote.foo();
    stream.on('data', function(data) {
        console.log(data);
    });

    remote.bar(function(err, msg) {
        console.log(msg);
    });
});
