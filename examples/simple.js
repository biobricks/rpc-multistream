#!/usr/bin/env node

// Simple rpc-multistream example showing asynchronous calling

var rpc = require('../index.js');

var server = rpc({

    foo: function(str, cb) {
        str = str.toUpperCase();
        cb(null, str);
    }

});

var client = rpc();

client.pipe(server).pipe(client);

client.on('methods', function(methods) {

    methods.foo("rose", function(err, msg) {
        console.log("Remote said: " + msg);
    });

});
