var rpc = require('../')
var test = require('tape')

// This is an example of remote exceptions triggering 
// a local callback call with an error argument

test('asyncException', function (t) {
    var server = rpc({
        foo: function(cb) {
            throw new Error("DON'T PANIC")
        }
    })
    var client = rpc()
    client.pipe(server).pipe(client)
    t.plan(1)
    client.on('methods', function(methods) {
        methods.foo(function(err) {
            t.equal(err.message,"DON'T PANIC","error is correct")
        })
    })
})
