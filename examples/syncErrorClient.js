#!/usr/bin/env nodejs

// Example of error reporting for synchronous calling using rpc-multistream
//
// This example is split up into a server and a client since the error reporting
// does not work correctly when both server and client run in the same process

var net = require('net');
var rpc = require('../index.js');

var client = rpc();

client.on('remote', function(remote) {

    var noStream = remote.bad();
    noStream.on('error', function(err) {
        console.log("Remote error:", err.message);
    });
});

console.log("Client connecting...");
var con = net.connect({port: 4242}, function() {
    console.log("Client connected!");
    con.pipe(client).pipe(con);
    client.connect();
});
