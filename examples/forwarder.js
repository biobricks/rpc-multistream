#!/usr/bin/env nodejs 

var through = require('through2');
var forwarder = require('../lib/forwarder.js');

var f = forwarder({objectMode: true});

f.pipe(process.stdout);
f.write("foo\n");

var t = through({objectMode: true}, function(data) {
    this.push(data.toUpperCase());
});

f.pipeRemote(t);




