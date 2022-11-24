#!/usr/bin/env node

let fs = require('fs');
let path = require('path');
let fetch = require('node-fetch');
let { program } = require('commander');
let Minimatch = require('minimatch').Minimatch;

let watchRecursive = require('./watchRecursive');
let mimematch = require('./mimematch');

function minimatch(pattern, matchNoExt)
{
    let mm = new Minimatch(pattern, {});
    return function(filename)
    {
        if (matchNoExt !== undefined)
        {
            let ext = path.extname(filename);
            if (ext.length == 0)
                return matchNoExt;
        }
        return mm.match(filename);
    } 
}

let pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')), "utf8");

program
    .description("Watches a directory for changes and posts change notifications to a HTTP server")
    .argument("<directory>")
    .version(pkg.version, '-v, --vers', 'output the current version')
    .option("--minPeriod <minPeriodSecs>", "minimum coalescing period (default=60)", 60)
    .option("--maxPeriod <minPeriodSecs>", "maximum coalescing period (default=600)", 600)
    .option("--include <spec...>", "files to include (default = all)")
    .option("--exclude <spec...>", "files to exclude (default = none)")
    .option("--includeMime <mimeType...>", "files to include by MIME type")
    .option("--excludeMime <mimeType...>", "files to exclude by MIME type")
    .option("--post <endPoint>", "URL of the HTTP endpoint to post to")
    .option("--prefix <prefix>", "a prefix to prepend to each filename") 
    .option("--plainText", "send body as plain text file list instead of JSON")
    .option("--withEvent", "include the event type in plain text format ('delete', 'change' at start of line)")
    .option("--logTime", "write to output the time of each event batch")
    .option("--logBody", "write to output the post body")
    .option("--logEvents", "write a list of events to output")
    .option("--logResponse", "log response to the http post")
    .option("--verbose", "logs info for diagnostics")
    .action(function(directory, options) {

        if (!options.prefix)
            options.prefix = "";

        // generate include/exclude matchers
        let mm_opts = {};
        let include_mm = options.include ? options.include.map(x => minimatch(x, true)) : [];
        let exclude_mm = options.exclude ? options.exclude.map(x => y => minimatch(x, false)) : [];
        let include_mime = options.includeMime ? options.includeMime.map(x => mimematch(x, true)) : [];
        let exclude_mime = options.excludeMime ? options.excludeMime.map(x => mimematch(x, false)) : [];
        let include = [...include_mm, ...include_mime];
        let exclude = [...exclude_mm, ...exclude_mime];

        function should_include(filename)
        {
            if (include.length && !include.some(x => x(filename)))
            {
                if (options.verbose)
                    console.log(`# excluded by include filter: ${filename}`);
                return false;
            }
            if (exclude.length && exclude.some(x => x(filename)))
            {
                if (options.verbose)
                    console.log(`# excluded by exclude filter ${filename}`);
                return false;
            }
            return true;
        }

        function watchFilter(event, filename, err, stat)
        {
            if (options.verbose)
                console.log(`# ${event} ${filename} ${err ? err.code : '-'}, ${stat ? stat.isDirectory() : '-'}`);
            return should_include(filename);
        }


        watchRecursive(directory, {
            minPeriod: (parseInt(options.minPeriod) || 60) * 1000,
            maxPeriod: (parseInt(options.maxPeriod) || 600) * 1000,
            filter: watchFilter,
        }, async function(ops) {

            // Fix up things
            for (let op of ops)
            {
                // Apply prefix and convert to forward slashes
                op.filename = options.prefix + op.filename.replace(/\\/g, '/');

                // More clearly mark directories by append '/'
                if (op.event == 'dir')
                    op.filename += '/';
            }

            if (options.logTime)
                console.log(`# ${new Date().toISOString()} [${ops.length}]`);

            // Show changes
            if (options.logEvents)
            {
                for (let op of ops)
                {
                    console.log(op.event, op.filename);
                }
                console.log();
            }            

            // Work out body/content type
            let body;
            let contentType;
            if (options.plainText)
            {
                body = ops.map(function(x) { 
                    if (options.withEvent)
                        return x.event + ' ' + x.filename;
                    else
                        return x.filename 
                }).join('\n');
                contentType = 'text/plain'; 
            }
            else
            {
                body = JSON.stringify(ops);
                contentType = 'application/json';
            }

            if (options.logBody)
                console.log(body);

            if (options.post)
            {
                try
                {
                    const response = await fetch(options.post, {
                        method: 'post',
                        headers: { 'Content-Type': contentType },
                        body: body
                    });
                    const responseText = await response.text();
                    if (options.logResponse)
                        console.log(`# ${response.status} - ${responseText}`);
                    if (response.status >= 400)
                        console.error(`Failed to post, server responded with ${response.status} - ${responseText}`);
                }
                catch (err)
                {
                    console.error("Failed to post:", err.message);
                }
            }

            if (options.logBody)
                console.log();
        });

    });

program.addHelpText('before', function() {
    return `svmon ${pkg.version} - Directory Monitoring Utility
Copyright (C) 2022 Topten Software. All Rights Reserved
`;
});

// Run it...
program.parse();
