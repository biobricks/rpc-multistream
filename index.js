var through = require('through2');
var isStream = require('isstream');
var pump = require('pump');
var Multiplex = require('multiplex');
var uuid = require('uuid').v4;
var xtend = require('xtend');
var jsonStream = require('duplex-json-stream');

/*
  rpcStream message format:
  
  ['functionNameOrCallbackId', [functionArgs], {indexOfCallbackArg1: 'callback1Id', indexOfCallbackArg2: 'callback2Id'}, {indexOfStreamArg1: stream1Identifier, indexOfStreamArg2: stream2Identifier}, returnStreamIdenfifier]
 
  Everything after functionNameOrCallbackId is optional but position in the array is important. So you can do [val1, val2] and leave out the rest but not [val1, val2, val4] without doing [val1, val2, null, val4].

  returnStreamIdentifier can also be an array if you plan to return multiple streams using synchronous calling.

  A streamIdentifier is of the following format:

  [streamId, 'type', objectMode, 'encoding']

  where 'type' is 'd', 'r', or 'w'
  and can be skipped, in which case type defaults to 'd' duplex:

  ['streamId', objectMode, 'encoding']

  or it can be a string:

  'streamId'

  and for all undefined stream options, 
  the values from the rpc-multiplex opts are used.

  Example: 

  A method is called like so:
  
  var myStream = fs.createReadStream('/dev/urandom');
  remoteMethod.foo('hello', myStream, function(err) {
  // ...
  });
  
  Both the callback function and myStream will be saved locally 
  and assigned a unique id. 
  Let's say myStream gets id 101 and the callback id 202.
  The message sent will look like this:
  
  ['foo', ['hello'], {1: [101}, {2: 202}]
  
  If foo returned a stream, then that stream would also be given an id,
  say it got id 303, the message would look like this:

  ['foo', ['hello'], {1: 101}, {2: 202}, 303]
  
  or foo could return multiple streams, in which case we'd see something like:
  
  ['foo', ['hello'], {1: 101}, {2: 202}, [303, 404, 505]]
  
  Once the callback got called, we'd get back a message like:
  
  ['202', [null, 'remote says hi']]
  
  Though there is no reason why a callback couldn't also include streams
  both as arguments and as return values.

*/

var moduleName = 'rpc-multistream';

function streamType(stream) {
    if(!isStream(stream)) return null;
    if(isStream.isDuplex(stream)) return 'd';
    if(isStream.isWritable(stream)) return 'w';
    if(isStream.isReadable(stream)) return 'r';
    return null;
}

function flattenError(err) {
    if(!(err instanceof Error)) return err;
    var err2 = {
        message: err.message
        };
    Object.defineProperty(
        err2, 
        '_isErrorObject',
        {enumerable: false, value: true}
    );
    
    for(var k in err) {
        err2[k] = err[k] 
    }
        return err2
};

function expandError(err) {
    if (!err || !err._isErrorObject) return err
    var err2 = new Error(err.message)
    for(var k in err) {
        err2[k] = err[k]
    }
    return err2;
};


function rpcMultiStream(methods, opts) {
    opts = xtend((opts || {}), {
        init: true, // automatically send rpc methods manifest on instantiation
        // TODO implement detectEncoding
        detectEncoding: true, // detect encoding and objectMode for streams
        // TODO implement detectStreamType
        detectStreamType: true, // detect if streams are readable/writeable/duplex
        encoding: 'utf8', // default encoding for streams
        objectMode: true, // default objectMode for streams
        explicit: false, // include encoding/objectMode even if they match defaults
        flattenError: flattenError,
        expandError: expandError,
        onError: function(err) {
            // emit error both on local and remote sides
            multiplex.emit('error', err);
            metaStream.write('error', flattenError(err));
        }
    });

    var diceRoll = uuid();
    var isEven;

    var methods = methods;

    var multiplex = Multiplex(opts);

    var callbacks = []; // saved callbacks
    var cbCount;

    var streams = []; // saved streams
    var streamCount; // set when manifest received

    var metaStream = makeStream('m', {objectMode: true});
    var rpcStream = makeStream('r', {objectMode: true});

    pump(metaStream, through.obj(function(data, enc, cb) {
        handleMeta(data);
        cb();
    }), function(err) {
        // TODO handle error 
        console.error("rpcStream error:", err);
    });


    pump(rpcStream, through.obj(function(data, enc, cb) {
        if(!(data instanceof Array) || data.length < 1) return cb();
        handleRPC(data)
        cb();
    }), function(err) {
        // TODO handle error 
        console.error("rpcStream error:", err);
    });


    if(opts.init) {
        init();
    }

    // --- functions below

    function restoreCallbackArgs(args, cbArgs) {
        var i;
        for(i in cbArgs) {
            args[i] = createRemoteCall(cbArgs[i]);
        }
    }

    function restoreStreamArgs(args, streamArgs) {
        var i, arg, id, type, sopts;
        for(i in streamArgs) {
            arg = streamArgs[i];
            sopts = {
                encoding: opts.encoding,
                objectMode: opts.objectMode
            };
            type = 'd';
            if(!(arg instanceof Array)) {
                id = parseInt(arg);
            } else {
                id = parseInt(arg.shift());
                if(typeof arg[0] === 'string') {
                    type = arg.shift();
                }
                if(typeof arg[0] === 'boolean') {
                    sopts.objectMode = arg[0];
                }
                if(typeof arg[1] === 'string') {
                    sopts.encoding = arg[1];
                }
            }
            if(!id) throw new Error("Non-numeric stream id");
            args[i] = makeStream(id, type, sopts);
        }
    }

    // errors that have no means of being reported
    // to the remote end will be sent here
    function uncaughtError(err) {
        if(typeof opts.onError === 'function') {
            return opts.onError(err);
        }
        console.error(err);
    }

    function handleRPC(data) {
        var fn;
        var cbi = parseInt(data[0]);
        if(cbi) {
            fn = callbacks[cbi];
        } else {
            var name = data[0];
            fn = methods[name];
        }
        if(!fn) return console.error("Invalid RPC:", data);

        var args = data[1] || [];
        var cbArgs = data[2];
        var streamArgs = data[3];
        var retStreams = data[4];

        try {
            // expand errors only for first argument to callback
            if(cbi) { 
                if(args.length && (typeof opts.expandError === 'function')) {
                    args[0] = opts.expandError(args[0]);
                }
            }
            
            if(cbArgs) restoreCallbackArgs(args, cbArgs);
            if(streamArgs) restoreStreamArgs(args, streamArgs);


            var ret = fn.apply(methods, args);
        } catch(err) {
            // if last argument is a function then assume it's the main callback
            // and call it with the error as only argument
            if(args.length && typeof args[args.length-1] === 'function') {
                args[args.length-1].call(methods, err);

            // TODO emit error on each retStream if no callback?
            // maybe have to send that over the metaStream (or rpcStream)
            } else { 
                uncaughtError(err);
            }
            // TODO destroy all stream args and retStreams
            return;
        }

        // TODO handle return values
    }

    /*
      same as multiplex.createSharedStream
      but supports the additional opts:
      * encoding
      * objectMode
      */
    function makeStream(id, type, opts) {
        if(typeof type === 'object') {
            opts = type;
            type = 'duplex';
        }
        opts = opts || {};

        // TODO close unused end of non-duplex streams
        // remember that type can be 'd' or 'duplex' etc.
        var stream = multiplex.createSharedStream(id, opts);
        if(opts.encoding || opts.objectMode) {
            opts.encoding = opts.encoding || 'utf8';
            stream.setEncoding(opts.encoding);
            stream.setDefaultEncoding(opts.encoding);
        }
        if(opts.objectMode) {
            stream = jsonStream(stream);
        }
        return stream;
    };


    function genManifest(methods) {
        // each side rolls a 2^128 sided dice
        // whoever gets the higher number uses even indexes
        // the other uses uneven indexes
        var manifest = {
            '.diceRoll': diceRoll
        };
        var name;
        for(name in methods) {
            manifest[name] = methods[name]._rpcType || 'async';
        }
        return manifest;
    }

    function streamOpts(stream) {
        var sopts = {};
        // TODO care about different opts for readable and writable?
        var state = stream._readableState || stream._writableState;
        if(state.objectMode) {
            sopts.objectMode = true;
            sopts.encoding = 'utf8';
        } else {
            sopts.encoding = state.encoding || opts.encoding;
            sopts.objectMode = false
        }
        return sopts;
    }

    function streamIdentifier(streamId, type, sopts) {
        var id = [streamId];
        
        if(type !== 'd') {
            id.push(type);
        }

        if((sopts.encoding === opts.encoding) && !opts.explicit) {
            if(sopts.objectMode != opts.objectMode) {
                id.push(sopts.objectMode);
            }
        } else {
            id.push(sopts.objectMode);
            id.push(sopts.encoding);
        }

        if(id.length === 1) {
            return streamId
        }
        return id;
    }
    
    function registerStreams(args) {
        var mapping = {};
        var i, s, type, opts, stream;
        for(i=0; i < args.length; i++) {
            s = args[i];
            type = streamType(s);
            if(!type) continue; // not a stream

            opts = streamOpts(s);
            stream = makeStream(streamCount, type, opts);
            streams[streamCount] = stream;
            mapping[i] = streamIdentifier(streamCount, type, opts);
            args[i] = null;
            streamCount += 2;
            if(streamCount >= 9007199254740992) {
                // this will almost certainly never happen
                streamCount = (isEven) ? 2 : 1;
            }
            if(type === 'r') {
                // TODO what to do on error here?
                pump(s, stream);
            } else if(type === 'w') {
                pump(stream, s);
            } else {
                pump(s, stream, s);
            }
        }
        if(!Object.keys(mapping).length) return null;
        return mapping;
    }

    function registerCallbacks(args) {
        var mapping = {};
        var i, cb;
        for(i=0; i < args.length; i++) {
            cb = args[i];
            if(typeof cb !== 'function') continue;

            callbacks[cbCount] = cb
            mapping[i] = cbCount;
            args[i] = null;
            cbCount += 2;
            if(cbCount >= 9007199254740991) {
                cbCount = (isEvent) ? 2 : 1; // this will almost certainly never happen
            }
        }
        if(!Object.keys(mapping).length) return null;
        return mapping;
    }

    // register streams used as return values
    function registerReturnStreams(streamOpts) {
        var ids = [];
        var retStreams = [];
        
        var i, type, opts, stream;
        for(i=0; i < streamOpts.length; i++) {
            opts = {
                objectMode: streamOpts[i].objectMode,
                encoding: streamOpts[i].encoding
            };
            type = streamOpts[i].type || 'd';

            ids.push(streamIdentifier(streamCount, type, opts));

            stream = makeStream(streamCount, type, opts);
            retStreams.push(stream);
            streams[streamCount] = stream;

            streamCount++;
            if(streamCount >= 9007199254740991) {
                streamCount = 1; // this will almost certainly never happen
            }
        }
        return {
            ids: (ids.length > 1) ? ids : ids[0],
            streams: (retStreams.length > 1) ? retStreams : retStreams[0]
        };
    }
    function createRemoteCall(name, retStreamOpts) {
        return function() {
            var args = [].slice.call(arguments);
            var cbMapping = registerCallbacks(args);
            var streamMapping = registerStreams(args);
            var returnMapping = null;
            
            var msg = [name];
            if(args && args.length) {
                // flatten error only for first argument of callbacks 
                if(parseInt(name) && typeof opts.flattenError === 'function') {
                    args[0] = opts.flattenError(args[0]);
                }
                msg.push(args);
            }
            if(cbMapping) msg.push(cbMapping);
            if(streamMapping) {
                if(!cbMapping) msg.push({});
                msg.push(streamMapping);
            }
            
            if(retStreamOpts && retStreamOpts !== 'async') {
                if(!(retStreamOpts instanceof Array)) {
                    retStreamOpts = [retStreamOpts];
                }
                var ret = registerReturnStreams(retStreamOpts);
                msg.push(ret.ids);
                rpcStream.write(msg);
                return ret.streams;
            }

            rpcStream.write(msg);
        }
    }

    function initIndexes(even) {
        isEven = even;
        if(even) {
            cbCount = 2;
            streamCount = 2;
        } else {
            cbCount = 1;
            streamCount = 1;
        }
    }

    function gotManifest(manifest) {
        if(!manifest['.diceRoll']) uncaughtError("Manifest is missing diceRoll");
        if(manifest['.diceRoll'] > diceRoll) {
            initIndexes(true);            
        } else if(manifest['.diceRoll'] < diceRoll) {
            initIndexes(false);
        } else {
            multiplex.destroy("Both endpoints generated the same roll on a 2^128 sided dice. Congratulations?");
            return;
        }

        var name;
        var methods = {};
        for(name in manifest) {
            if(name[0] === '.') continue;
            methods[name] = createRemoteCall(name, manifest[name]);
        }
        multiplex.emit('methods', methods);
    }
  
    function sendMeta(msgType, msg) {
        metaStream.write([msgType, msg]);
    }

    function handleMeta(data) {
        if(!(data instanceof Array)|| data.length < 2) return;
        var msgType = data[0];
        var msg = data[1];
        if(!msgType || !msg) return;

        switch(msgType) {
            
        case 'manifest':
            gotManifest(msg);
            break;
        case 'error':
            multiplex.emit('error', "Remote error: " + msg.message || msg);
            break;
        default:
            multiplex.emit('error', "Unknown meta message type: " + msgType);
        }
    }

    function init(cb) {
        var manifest = genManifest(methods);
        if(manifest) {
            sendMeta('manifest', manifest);
        }
    };
    
    return multiplex;
}

rpcMultiStream.prototype.syncStream = function(fn) {
    // TODO
    multiplex.createSharedStream;
};




module.exports = rpcMultiStream;



