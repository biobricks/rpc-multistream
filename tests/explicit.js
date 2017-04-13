var from = require('from2');
var fs = require('fs')
var rpc = require('../')
var test = require('tape-catch')
const util = require('util')

// tape test for rpc-multistream functionality:
// opts.explicit

test('opts.explicit.on', function (t) {
    var server = rpc({
        foo: rpc.syncReadStream(function() {
            return fs.createReadStream('tests/foo.txt', {encoding: 'utf8'});
        }),
        bar: rpc.syncReadStream(function() {
            var i = 0;
            return from.obj(function(size, next) {
                if(i++) return next(null, null);
                next(null, {
                    hoopy: 'frood'
                });
            });
        }, { objectMode: true }) // bar is objectMode
    }, { objectMode: false }); // foo is not
    t.plan(5)
    var client = rpc(undefined, {
        objectMode: true, // different default than the server
        explicit: true // with explicit set it doesn't matter if defaults differ
    });
    client.pipe(server).pipe(client);
    client.on('methods', function(methods) {
        t.equal(typeof methods.foo, 'function', 'explicit client: methods.foo is a function')
        t.equal(typeof methods.bar, 'function', 'explicit client: methods.bar is a function')

        methods.foo().on('data', function(data) {
            t.equal(data,"I am the contents of foo.txt :)\n","explicit client: foo creatReadStream foo.txt")
        })

        var objStream = methods.bar();
        objStream.on('data', function(data) {
            t.equal(typeof data,"object","explicit client: bar gives an object")
            t.deepEqual(data,{hoopy: 'frood'},"explicit client: bar object is correct")
        });
    })
})
test('opts.explicit.off', function (t) {
    try {
        var server = rpc({
            //        foo: rpc.syncReadStream(function() {
            //            return fs.createReadStream('tests/foo.txt', {encoding: 'utf8'});
            //        }),
            bar: rpc.syncReadStream(function() {
                var i = 0;
                console.log("started bar: i = " + i)
                try {
                    var fromobj = from.obj(function(size, next) {
                        console.log("start fromobj: i = " + i)
                        try {
                            if(i++) return next(null, null);
                            next(null, {
                                hoopy: 'frood'
                            });
                        } catch(err) {
                            console.log("caught objfuncerr: " + err)
                        }
                        console.log("end fromobj: i = " + i)
                    });
                    fromobj.on('error',function(err) {
                        console.log("fromobjerr: " + err)
                    })
                    return fromobj;
                } catch(err) {
                    console.log("caught serverr: " + err)
                }
                console.log("end bar: i = " + i)
            }, { objectMode: true }) // bar is objectMode
        }, {
            objectMode: false, // foo is not
            onError: function(err) {
                console.log("rpc srv err: " + err)
            }
        })
        server.on('error',function(err){
            console.log("serveronerr: " + err)
        })
        t.plan(1)
        var client = rpc(undefined, {
            objectMode: true, // different default than the server
            explicit: false, // this will cause ??? to fail
            onError: function(err) {
                console.log("rpc cli err: " + err)
            }
        });
        try {
            client.pipe(server).pipe(client);
        } catch(err) {
            console.log("pipe err: " + err)
        }
        client.on('methods', function(methods) {
            //        t.equal(typeof methods.foo, 'function', 'nonexplicit client: methods.foo is a function')
            t.equal(typeof methods.bar, 'function', 'nonexplicit client: methods.bar is a function')
            
            try {
                var foofoo = methods.bar(function(err) {
                    console.log("methodserr: " + err)
                })
                console.log("own: " + Object.getOwnPropertyNames(foofoo))
                console.log("util: " + util.inspect(Object.getOwnPropertyNames(foofoo), {
                    colors: true,
                    showHidden: true,
                    showProxy: true,
                    depth: null
                }))
                foofoo.on('error',function(err) {
                    console.log("onerr: " + err)
                })
                foofoo.on('data',function(data) {
                    console.log("ondata: " + data)
                })
            } catch(err) {
                console.log("caught foo err: " + err)
            }
        })
        client.on('error',function(err){
            console.log("clientonerr: " + err)
        })
    } catch(err) {
        console.log("test err: " + err)
    }
})
