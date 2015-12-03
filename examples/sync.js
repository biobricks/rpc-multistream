#!/usr/bin/env nodejs

// Example of synchronous calling using rpc-multistream

var fs = require('fs');
var through = require('through2');

var rpc = require('../index.js');

var outFile = "/tmp/test.out";

var server = rpc({

    foo: rpc.syncReadStream(function() {
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

client.on('methods', function(methods) {
    var inStream = methods.foo();
    inStream.pipe(process.stdout);

    var outStream = methods.bar(outFile);
    outStream.write("Love!\n");
    outStream.end();
    console.log("Wrote to", outFile);

    var duplexStream = methods.baz();
    duplexStream.on('data', function(data) {
        console.log("Duplex got:", data);
    });
    duplexStream.write("some data I sent to the duplex stream\n");

});
