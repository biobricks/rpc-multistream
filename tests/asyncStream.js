var fs = require('fs')
var path = require('path')
var rpc = require('../')
var test = require('tape')
var through = require('through2')

// asynchronous remote functions that return streams

test('asyncStream', function (t) {
    var server = rpc({
        foo: function(filename, cb) {
            var w = fs.createWriteStream(path.join('/tmp', filename), {encoding: 'utf8'})
            cb(null, w)
        },
        bar: function(cb) {
            var r = fs.createReadStream('foo.txt', {encoding: 'utf8'})
            cb(null, "bar says hi", r)
        },
        baz: function(filename, cb) {
            var w = fs.createWriteStream(path.join('/tmp', filename), {encoding: 'utf8'})
            var r = fs.createReadStream('foo.txt', {encoding: 'utf8'})
            cb(null, r, w, {chiao: "hiya!"})
        },
        duper: function(cb) {
            var ds = through({encoding: 'utf8', decodeStrings: false}, function(data) {
                data = data.toUpperCase()
                this.push(data)
            })
            cb(null, ds)
        }
    })
    var client = rpc()
    client.pipe(server).pipe(client)
    t.plan(5)
    client.on('methods', function(methods) {
        methods.foo('haha.txt', function(err, w) {
            t.pass("foo")
            w.write("woop!")
            w.end()
        })
        methods.bar(function(err, msg, r) {
            t.equal(msg,"bar says hi","bar")
            r.on('data', function(data) {
//                t.equal(data,"I am the contents of foo.txt :)","bar foo.txt")
            })
            r.on('error',function(err) {
                console.log("bar err: " + err)
            })
        })
        methods.baz('cookie-cat.txt', function(err, r, w, msg) {
            t.deepEqual(msg,{chiao:'hiya!'},"baz chiao")
            r.on('data', function(data) {
//                t.equal(data,"I am the contents of foo.txt :)","baz foo.txt")
            })
            r.on('error',function(err) {
                console.log("baz err: " + err)
            })
            w.write("a treat for your tummy!")
            w.end()
        })
        methods.duper(function(err, dupStream) {
            t.pass("duper returned")
            dupStream.on('data',function(data) {
                t.equal(data,"MAKING THIS UPPERCAAAAASE","duper uppercase")
            })
            dupStream.write("making this uppercaaaaase")
        })
    })
})
