let fs = require('fs');
let path = require('path');
const internal = require('stream');

// Recursively find all sub-directories of a directory
// Callback passes an array of strings, each a path relative to the base directory
// eg: ['.', 'subdir', 'subdir/subdir' ]
function findAllSubDirectories(basedir, callback)
{
    let pending = 0;
    let result = [];
    helper(path.resolve(basedir), '.');

    function helper(dir, reldir)
    {
        result.push(reldir);

        pending++;
        fs.readdir(dir, { withFileTypes: true }, function(err, des) {
            if (err)
            {
                callback(err);
                callback = null;
                return;
            }

            for (let de of des)
            {
                if (de.isDirectory())
                {
                    helper(path.join(dir, de.name), path.join(reldir, de.name));
                }
            }

            pending--;
            if (pending == 0 && callback)
                callback(null, result);
        })
    }
}


function watchAndStatRecursive_fallback(basedir, callback)
{
    // Make sure fully qualified
    basedir = path.resolve(basedir);
    if (!basedir.endsWith(path.sep))
        basedir += path.sep;

    // Map if subdirectory to its watcher
    let watchers = new Map();
    
    // Start watching the base directory an all its sub-directories
    watch_all_dirs(basedir, '.');

    // This is a map of all known subdirectories (even those that have
    // been deleted).
    let allKnownDirectories = new Set();

    function watch_all_dirs(dir, reldir, finished)
    {
        // Recursively find all subdirectories
        findAllSubDirectories(dir, function(err, data) {
    
            // Quit if failed
            if (err)
            {
                callback('error', null, err);
            }
            else
            {
                // Watch all subdirectories
                for (let subdir of data)
                {
                    let fullsubdir = path.join(dir, subdir);
                    allKnownDirectories.add(fullsubdir);
                    if (!watchers.has(fullsubdir))
                    {
                        watchers.set(fullsubdir, fs.watch(fullsubdir + path.sep, function (event, filename){
                            if (filename)
                                handle_event(event, path.join(reldir, subdir, filename), fullsubdir);
                        }));
                    }
                }
            }

            if (finished)
                finished();
        });
    }

    let busy;
    let queue = [];
    function handle_event(event, filename)
    {
        if (busy)
        {
            queue.push({event, filename});
            return;
        }
        else
        {
            process(event, filename);
        }

        function process(event, filename)
        {
            // get the full path
            let fullpath = path.join(basedir, filename);
    
            // Stat it
            busy = true;
            fs.stat(fullpath, function(err, stat) {

                let isOrWasDir = stat?.isDirectory() ?? allKnownDirectories.has(filename);

                // Call listener
                callback(event, filename + (isOrWasDir ? path.sep : ''), err, stat);

                if (err == null)
                {
                    if (stat.isDirectory())
                    {
                        // Remember this is a directory
                        allKnownDirectories.add(filename);

                        // A new directory, we need to watch all its subdirectories too
                        watch_all_dirs(fullpath, filename, start_next);
                    }
                    else
                    {
                        // Remember this was not a directory
                        allKnownDirectories.delete(filename);
                    }
                }
                else if (err && err.code == 'ENOENT')
                {
                    if (watchers.has(fullpath))
                    {
                        // Close any watchers in this and any subdirectories
                        watchers.get(fullpath).close();
                        watchers.delete(fullpath);
                        for (let wk of watchers.keys())
                        {
                            if (wk.startsWith(fullpath + path.sep))
                            {
                                watchers.get(wk).close();
                                watchers.delete(wk);
                            }
                        }
                    }

                    start_next();
                }
                else
                {
                    start_next();
                }
                
                // Start processing the next item in the queue
                function start_next()
                {
                    // Continue with next waiting
                    busy = false;
                    let next = queue.shift();
                    if (next)
                    {
                        process(next.event, next.filename);
                    }
                }
            });
        }
    }

    return {
        close: function() {
            if (watchers)
            {
                for (let subdir of watchers.keys())
                {
                    watchers.get(subdir).close();
                }
                watchers = null;
            }
        }
    }
}

function watchAndStatRecursive_native(basedir, callback)
{
    let allKnownDirectories;
    let busy = true;
    let queue = [];
    function handle_event(event, filename)
    {
        if (busy)
        {
            queue.push({event, filename});
            return;
        }
        else
        {
            process(event, filename);
        }
    }

    function process(event, filename)
    {
        // get the full path
        let fullpath = path.join(basedir, filename);

        // Stat it
        busy = true;
        fs.stat(fullpath, function(err, stat) {

            let isOrWasDir = stat?.isDirectory() || allKnownDirectories.has(filename);

            // Call listener
            callback(event, filename + (isOrWasDir ? path.sep : ''), err, stat);

            if (stat)
            {
                if (stat.isDirectory())
                    allKnownDirectories.add(filename);
                else
                    allKnownDirectories.delete(filename);
            }

            // Continue with next waiting
            busy = false;
            process_next();

        });
    }

    function process_next()
    {
        let next = queue.shift();
        if (next)
        {
            process(next.event, next.filename);
        }
    }

    // Create watcher
    let watcher = fs.watch(basedir, { recursive: true }, handle_event);

    // Find initial directory set
    findAllSubDirectories(basedir, function(err, data) {
        if (err)
        {
            watcher.close();
            callback()
        }

        allKnownDirectories = new Set(data);
        busy = false;
        process_next();
    });

    return watcher;
}




// Watches a directory recursively and stats the notified files
// before calling an event handler
// callback(event, filename, err, stat)
// event and filename from the underlying fs.watch()
// err and state from the stat call on the notifed file
function watchAndStatRecursive(basedir, callback)
{
    try
    {
        return watchAndStatRecursive_native(basedir, callback);
    }
    catch (err)
    {
        if (err.code == 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM')
            return watchAndStatRecursive_fallback(basedir, callback);
        else
            throw err;
    }
}

// Coalesces callbacks as described for watchRecursive
// The returned function can be passed to watchDirectoryRecursive and has
// an attached method 'close' that can be use to close the coalescer
function coalesc(target, options)
{
    let pendingOps = [];
    let minTimer = null;
    let maxTimer = null;
    let closed = false;

    function flush()
    {
        if (pendingOps.length)
        {
//            console.log("-- flush --")
            let send = pendingOps;
            pendingOps = [];
            target(send);
            //            console.log("-----------")

            // Clear timers
            if (minTimer != null)
            {
                clearTimeout(minTimer);
                minTimer = null;
            }
            if (maxTimer != null)
            {
                clearTimeout(maxTimer);
                maxTimer = null;
            }
        }
    }

    let handler = function(event, filename, err, stat)
    {
        // Closed?
        if (closed)
            return;

        options?.verbose(`# ${event} ${filename} ${err?.code ?? '-'}, ${stat?.isDirectory() ?? '-'}`);
            
        // Reset min timer
        if (minTimer)
        clearTimeout(minTimer);
        minTimer = setTimeout(flush, options.minPeriod || 1000);
        
        // Start the max timer (if not already running)
        if (maxTimer == null)
        maxTimer = setTimeout(flush, options.maxPeriod || 10000);
        
        if (filename == '.')
            return;

        // Deleted?
        if (err)
        {
            // Pass errors through
            if (err.code != 'ENOENT')
            {
                target(event, filename, err, stat)
                return;
            }
            
            for (let i=pendingOps.length - 1; i>=0; i--)
            {
                let prev = pendingOps[i];

                // Don't coalesc across change/delete boundary
                if (prev.event != 'delete')
                    break;

                // Previous op same?
                if (prev.filename == filename)
                    return;

                // Previous op was in this deleted directory, remove it
                if (filename.endsWith(path.sep) && prev.filename.startsWith(filename))
                {
                    pendingOps.splice(pendingOps.length - 1, 1);
                    continue;
                }

                // This op was in a previously deleted directory (should never happen)
                if (prev.filename.endsWith(path.sep) && filename.startsWith(prev.filename))
                {
                    return;
                }
            }

            // Deleted
            pendingOps.push({ event: "delete", filename });
        }
        else
        {
            if (event == 'change' && filename.endsWith(path.sep))
                return;
            if (event == 'rename')
                event = 'change';

            // Look for a parent directory entry with the same name
            for (let i=pendingOps.length - 1; i>=0; i--)
            {
                let prev = pendingOps[i];

                // Don't coalesc across change/delete boundaries
                if (prev.event == 'delete')
                    break;

                // Same as existing op?
                if (prev.event == event && filename == prev.filename)
                    return;

                // Already covered by parent directory?
                if (prev.filename.endsWith(path.sep) && filename.startsWith(prev.filename))
                    return;

                // Existing entry covered by this new one? (should never happen)
                if (filename.endsWith(path.sep) && prev.filename.startsWith(filename))
                {
                    pendingOps.splice(i, 1);
                    continue;
                }
            }

            pendingOps.push({ event: event, filename }) ;
        }
    }

    handler.close = function()
    {
        if (!closed)
        {
            clearTimeout(minTimer);
            clearTimeout(maxTimer);
            closed = true;
        }
    }

    return handler;
}

// Watches a directory recursively and callsback on changes
// callback with an array of {event:, filename:} where
//  event == 'delete' for a deleted file or directory
//  event == 'dir' for a new or modified directory
//  event == 'file' for a new of modified file
// Added/deleted directories are simplified to a single callback such
// that adding an entire directory tree will only provide a single callback
// for the parent-most directory.  similar for deleting.
// The options object specifies two time periods:
//  minPeriod = the minimum time between callbacks
//  maxPeriod - the maximum time between callbacks
// Operations that take longer than the maxPeriod will be reported
// across two or more callbacks.
// Creating then deleting then recreating a file or directory
// don't collapse into a single callback.
// Returns a function() that when called closes the watcher
function watchRecursive(dir, options, callback)
{
    let coalescer = coalesc(callback, options);
    let watcher =  watchAndStatRecursive(dir, coalescer);

    return function()
    {
        if (coalescer)
        {
            coalescer.close();
            coalescer = null;
        }
        if (watcher)
        {
            watcher.close();
            watcher = null;
        }
    }
}

module.exports = watchRecursive;