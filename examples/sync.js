#!/usr/bin/env nodejs

// Example of synchronous calling using rpc-multistream

var fs = require('fs');
var through = require('through2');

var rpc = require('../index.js');

var outFile = "/tmp/test.out";

var server = rpc({

    foo: rpc.sync(function() {
        return fs.createReadStream('foo.txt', {encoding: 'utf8'});
    }),

    bar: rpc.syncWriteStream(function(filepath) {
        return fs.createWriteStream(filepath, {encoding: 'utf8'});
    }),

    baz: rpc.syncStream(function() {
        // create duplex transform stream with utf8 input and output
        return through({encoding: 'utf8', decodeStrings: false}, function(data) {
            this.push(data.toUpperCase());
       });
    }),

    bad: rpc.syncStream(function() {
        throw new Error("Something bad happened");
    })

});

var client = rpc();

client.pipe(server).pipe(client);

client.on('remote', function(remote) {
    var inStream = remote.foo();
    inStream.pipe(process.stdout);

    var outStream = remote.bar(outFile);
    outStream.write("Love!\n");
    outStream.end();
    console.log("Wrote to", outFile);

    var duplexStream = remote.baz();
    duplexStream.on('data', function(data) {
        console.log("Duplex got:", data);
    });
    duplexStream.write("some data I sent to the duplex stream\n");

});

client.connect();
