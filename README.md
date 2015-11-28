
WORK IN PROGRESS. DO NOT EXPECT THIS TO WORK.

rpc-multistream is similar to [rpc-stream](https://github.com/dominictarr/rpc-stream) but you can:

* Return streams from both sync and async remote functions
* Return multiple streams per call.
* Have multiple callbacks per call.
* Have infinite remote callback chains (like [dnode](https://github.com/substack/dnode))
* Mix and match efficient binary streams with text and object streams.

rpc-multistream uses [multiplex](https://github.com/maxogden/multiplex) so under the hood it is binary and streams3.

If you need authentication then check out [rpc-multiauth](https://github.com/biobricks/rpc-multiauth).

# Usage 

```
var fs = require('fs');
var rpc = require('rpc-multistream');

var server = rpc({
  foo: rpc.syncStream(function() {
    return fs.createReadStream('foo.txt');
  }),
  bar: function(cb) {
    console.log("bar called");
    cb(null, "bar says hi");
  }
});

var client = rpc();

client.pipe(server).pipe(client)

client.on('remote', function(remote) {

  var stream = remote.foo();
  stream.on('data', function(data) {
    console.log(data);
  });

  remote.bar(function(err, msg) {
    console.log(msg);
  });
});
```

# Error handling

All functions passed as arguments to async remote functions will be treated as callbacks and it will be assumed that their first argument is an optional error.

If that argument is an instance of Error then it will be marked as an error by setting the non-enumerable property _isErrorObject to true on the object before it is serialized. It will then be re-created as an Error object on the receiving end. You can overwrite the functions used for this like so:

```
var rpc = require('rpc-multistream');

var endpoint = rpc({ ... some methods ... }, {
  flattenError: function(err) {
    // prepare err before serialization here
    return err; 
  },
  expandError: function(err) {
    // process err after serialization here
    return err;
  }
})
```

You can also simply set flattenError and/or expandError to false and errors will be given no special treatment.

If an error occurs internally in rpc-multistream while calling a remote function, and the last argument is a function, then that function will be called with an error as first argument. Likewise if an uncaught exception occurs while calling a function with a callback then the exception will be converted to an error and passed as the first argument to the assumed callback.

TODO more about emitted stream errors and pump+destroy.

# Bi-directional RPC

There is no difference between server and client but one endpoint, and only one endpoint, must call .connect() to get things started. Here's an example with two-way RPC:

```
TODO
```

# Synchronous calls

If you declare a function with no wrapper then rpc-multistream assumes that is is an asynchronous function.

It is also possible to define synchronous functions that return only a stream by wrapping your functions using e.g:

```
var server = rpc({
  foo: rpc.syncReadStream(function() {
    return fs.createReadStream('foo.txt');
  })
};
```

The following wrappers exist:

* rpc.syncStream: For functions returning a duplex stream
* rpc.syncReadStream: For functions returning a readable stream
* rpc.syncWriteStream: For functions returning a writable stream

It is _not_ possible to define synchronous functions that return something other than a stream. Why not? Because the function call would block until the server responded. For synchronous functions returning streams the streams are instantly created on the client and when the server creates the other endpoint of the stream at some later point in time the two streams are piped together.

For synchronous functions remote errors are reported via the returned stream emitting an error. This is true even if an exception occurs before the remote stream has been created. Here's how it works:

```
var server = rpc({
  myFunc: rpc.syncReadStream(function() {
    throw new Error("I am an error!");
  })
});

// ... more code here ...

var stream = remote.myFunc()
stream.on('error', function(err) {
  console.error("Remote error:", err);
});
```

# Gotchas 

Either both ends must agree on the following opts (as passed to rpc-multistream):

* encoding
* objectMode

or you must set explicit to true. Setting explicit to true will cost more bandwidth since each call will include stream options even if they match defaults.

The streams returns by async callbacks are currently all duplex streams, no matter if the original stream on the remote side was only a read or write stream.

If using synchronous calls then both RPC server and client cannot be in the same process or error reporting won't work. But why would you even use an RPC system in that situation in the first place?

# Copyright and license

Copyright (c) 2014, 2015 Marc Juul <juul@sudomesh.org>

License: AGPLv3 (will probably change to MIT soon)

