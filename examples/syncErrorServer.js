#!/usr/bin/env nodejs

// Example of error reporting for synchronous calling using rpc-multistream
//
// This example is split up into a server and a client since the error reporting
// does not work correctly when both server and client run in the same proc

var net = require('net');
var rpc = require('../index.js');

var server = rpc({

    foo: rpc.syncReadStream(function() {
        return fs.createReadStream('foo.txt', {encoding: 'utf8'});
    }),

    bar: rpc.syncWriteStream(function(filepath) {
        return fs.createWriteStream(filepath, {encoding: 'utf8'});
    }),

    baz: rpc.syncStream(function() {
        // creates duplex transform stream with utf8 input and output
        return through({encoding: 'utf8', decodeStrings: false}, function(data) {
            this.push(data.toUpperCase());
       });
    }),

    bad: rpc.syncStream(function() {
        throw new Error("Something bad happened");
    })

});

net.createServer(function (con) {
    con.pipe(server).pipe(con);
}).listen(4242);

console.log("Server listening...");
