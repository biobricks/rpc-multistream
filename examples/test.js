#!/usr/bin/env node

// Simple rpc-multistream example showing asynchronous calling

var fs = require('fs');
var rpc = require('../index.js');




var server = rpc({

    foo: function(str, cb) {
        str = str.toUpperCase();
        cb(null, str);
    },

    bar: function(path, cb) {
        var stream = fs.createReadStream(path);
        cb(null, stream);
    },

    baz: rpc.syncReadStream(function(path) {
        return fs.createReadStream(path);
    }),

});

var client = rpc();

client.pipe(server).pipe(client);

//client.connect();

client.on('methods', function(methods) {
    console.log("methods:", methods);
    

//    methods.foo("hi from client", function(err, str) {
//        console.log("got response:", str);
//    });


//    methods.bar("foo.txt", function(err, stream) {
//        stream.pipe(process.stdout);
//    });


    var s = methods.baz("foo.txt");
    s.pipe(process.stdout);
});
